import { request } from "./request";
import { authHeaders, restBase } from "./session";
import type { Moment, Need, Path, PathDay, PathKind, PathStatus, Topic } from "./types";

/**
 * Supabase tables over REST, the same way the catalogue reads (see
 * catalogue/remote.ts): plain fetch with the publishable key for the public
 * tables, and the viewer's own token for their path progress (row level
 * security limits those rows to their owner). No second Supabase client.
 *
 * Everything throws on failure; LearningProvider keeps the cached copy and
 * tries again later. A table that doesn't exist yet (404) reads as empty,
 * so screens degrade quietly while the backend is being deployed.
 */

const TIMEOUT = 15_000;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function rest<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string | null; prefer?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(await authHeaders(init.token)),
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.prefer) headers.Prefer = init.prefer;
  // The body is read under the same deadline as the request.
  return request(
    `${restBase}/${path}`,
    {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      timeoutMs: TIMEOUT,
    },
    async (response) => {
      if (!response.ok) throw new HttpError(response.status, `${path.split("?")[0]} failed (${response.status})`);
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    },
  );
}

/** Reads a public table; a table not deployed yet reads as empty. */
async function table<T>(path: string): Promise<T[]> {
  try {
    return await rest<T[]>(path, { token: null });
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return [];
    throw error;
  }
}

type NeedRow = { id: string; label: string; short: string; theme: string; sort: number };
type TopicRow = {
  id: string;
  label: string;
  description: string;
  need_ids: string[] | null;
  path_ids: string[] | null;
  sort: number;
};
type MomentRow = {
  id: number | string;
  youtube_id: string;
  need_id: string | null;
  at_s: number;
  end_s: number;
  title: string;
  quote: string;
  score: number | null;
};
type PathRow = {
  id: string;
  kind: PathKind | null;
  name: string;
  italic: string;
  promise: string;
  why: string;
  needs: string[] | null;
  minutes_per_day: number;
  status: PathStatus;
  sort: number;
};
type DayRow = {
  path_id: string;
  day: number;
  youtube_id: string;
  focus_start: number;
  focus_end: number;
  theme: string;
  key_at: number;
  key_title: string;
  key_quote: string;
};

/** Published needs in editorial order (row level security hides drafts). */
export async function fetchNeeds(): Promise<Need[]> {
  const rows = await table<NeedRow>("needs?select=id,label,short,theme,sort&order=sort.asc,id.asc");
  return rows.map((r) => ({ id: r.id, label: r.label, short: r.short, theme: r.theme, sort: r.sort }));
}

/** The topics people pick, in the order they're offered. */
export async function fetchTopics(): Promise<Topic[]> {
  const rows = await table<TopicRow>(
    "topics?select=id,label,description,need_ids,path_ids,sort&order=sort.asc,id.asc",
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    description: r.description,
    needIds: r.need_ids ?? [],
    pathIds: r.path_ids ?? [],
    sort: r.sort,
  }));
}

/** A sermon's verified moments, in playing order. */
export async function fetchMoments(youtubeId: string): Promise<Moment[]> {
  const rows = await table<MomentRow>(
    `moments?select=id,youtube_id,need_id,at_s,end_s,title,quote,score&youtube_id=eq.${encodeURIComponent(youtubeId)}&order=at_s.asc`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    youtubeId: r.youtube_id,
    needId: r.need_id,
    at: r.at_s,
    end: r.end_s,
    title: r.title,
    quote: r.quote,
    score: r.score,
  }));
}

/**
 * Every path and teaching series (drafts included, shown without a label;
 * only a published path says the ministry set its order) and all their days.
 */
export async function fetchPaths(): Promise<{ paths: Path[]; days: PathDay[] }> {
  const [pathRows, dayRows] = await Promise.all([
    table<PathRow>("paths?select=id,kind,name,italic,promise,why,needs,minutes_per_day,status,sort&order=sort.asc,id.asc"),
    table<DayRow>(
      "path_days?select=path_id,day,youtube_id,focus_start,focus_end,theme,key_at,key_title,key_quote&order=path_id.asc,day.asc",
    ),
  ]);
  const days: PathDay[] = dayRows.map((r) => ({
    pathId: r.path_id,
    day: r.day,
    youtubeId: r.youtube_id,
    focusStart: r.focus_start,
    focusEnd: r.focus_end,
    theme: r.theme,
    keyAt: r.key_at,
    keyTitle: r.key_title,
    keyQuote: r.key_quote,
  }));
  const counts = new Map<string, number>();
  days.forEach((d) => counts.set(d.pathId, (counts.get(d.pathId) ?? 0) + 1));
  const paths: Path[] = pathRows
    .map((r) => ({
      id: r.id,
      kind: r.kind === "series" ? ("series" as const) : ("path" as const),
      name: r.name,
      italic: r.italic,
      promise: r.promise,
      why: r.why,
      needs: r.needs ?? [],
      minutesPerDay: r.minutes_per_day,
      status: r.status,
      sort: r.sort,
      dayCount: counts.get(r.id) ?? 0,
    }))
    // A path with no days yet can't be followed; leave it out.
    .filter((p) => p.dayCount > 0);
  return { paths, days };
}

// ---- The viewer's own progress (signed in only) -----------------------------

export type RemoteProgress = {
  enrollments: { path_id: string; started_at: string; finished_at: string | null }[];
  done: { path_id: string; day: number; done_at: string }[];
};

export async function fetchProgress(token: string): Promise<RemoteProgress> {
  const [enrollments, done] = await Promise.all([
    rest<RemoteProgress["enrollments"]>("path_enrollments?select=path_id,started_at,finished_at", { token }),
    rest<RemoteProgress["done"]>("path_day_done?select=path_id,day,done_at&order=day.asc", { token }),
  ]);
  return { enrollments: enrollments ?? [], done: done ?? [] };
}

/** Starting twice is harmless (the first start time is kept). */
export async function postEnrollment(token: string, pathId: string, startedAt: string) {
  await rest("path_enrollments?on_conflict=user_id,path_id", {
    method: "POST",
    token,
    body: { path_id: pathId, started_at: startedAt },
    prefer: "resolution=ignore-duplicates,return=minimal",
  });
}

export async function patchEnrollment(token: string, pathId: string, finishedAt: string | null) {
  await rest(`path_enrollments?path_id=eq.${encodeURIComponent(pathId)}`, {
    method: "PATCH",
    token,
    body: { finished_at: finishedAt },
    prefer: "return=minimal",
  });
}

export async function deleteEnrollment(token: string, pathId: string) {
  const id = encodeURIComponent(pathId);
  await rest(`path_day_done?path_id=eq.${id}`, { method: "DELETE", token, prefer: "return=minimal" });
  await rest(`path_enrollments?path_id=eq.${id}`, { method: "DELETE", token, prefer: "return=minimal" });
}

export async function postDayDone(token: string, pathId: string, day: number, doneAt: string) {
  await rest("path_day_done?on_conflict=user_id,path_id,day", {
    method: "POST",
    token,
    body: { path_id: pathId, day, done_at: doneAt },
    prefer: "resolution=ignore-duplicates,return=minimal",
  });
}

export async function deleteDayDone(token: string, pathId: string, day: number) {
  await rest(`path_day_done?path_id=eq.${encodeURIComponent(pathId)}&day=eq.${day}`, {
    method: "DELETE",
    token,
    prefer: "return=minimal",
  });
}

/** A request the server refused for good (not a dropped connection). */
export function isPermanent(error: unknown) {
  return error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 408 && error.status !== 429;
}
