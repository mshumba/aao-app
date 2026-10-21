import type { Sermon } from "../data/sermons";
import { takeTurns } from "../lib/turns";
import type { RemoteProgress } from "./queries";
import type { ActivePath, Enrollment, Path, PathDay, PathDayWithSermon, Topic } from "./types";

/**
 * Progress through paths as plain data, so the same rules run for members
 * (Supabase), guests and the on-device test mode. Changes are recorded as
 * operations: applied at once on the device, then sent to the server for
 * members and kept until it has them (so a dropped connection loses nothing).
 */

export type ProgressOp =
  | { kind: "start"; pathId: string; at: string }
  | { kind: "done"; pathId: string; day: number; at: string }
  | { kind: "undone"; pathId: string; day: number }
  | { kind: "finish"; pathId: string; at: string | null }
  | { kind: "leave"; pathId: string };

export type ProgressState = {
  enrollments: Record<string, { startedAt: string; finishedAt: string | null }>;
  /** Day numbers done per path, ascending. */
  done: Record<string, number[]>;
  /** Members only: changes the server hasn't confirmed yet, oldest first. */
  pending: ProgressOp[];
};

export const emptyProgress: ProgressState = { enrollments: {}, done: {}, pending: [] };

export function applyOp(state: ProgressState, op: ProgressOp): ProgressState {
  const enrollments = { ...state.enrollments };
  const done = { ...state.done };
  switch (op.kind) {
    case "start":
      // Starting again keeps the first start, and re-opens a finished path.
      enrollments[op.pathId] = {
        startedAt: enrollments[op.pathId]?.startedAt ?? op.at,
        finishedAt: null,
      };
      done[op.pathId] ??= [];
      break;
    case "done": {
      const list = done[op.pathId] ?? [];
      if (!list.includes(op.day)) done[op.pathId] = [...list, op.day].sort((a, b) => a - b);
      enrollments[op.pathId] ??= { startedAt: op.at, finishedAt: null };
      break;
    }
    case "undone":
      done[op.pathId] = (done[op.pathId] ?? []).filter((d) => d !== op.day);
      break;
    case "finish":
      if (enrollments[op.pathId])
        enrollments[op.pathId] = { ...enrollments[op.pathId], finishedAt: op.at };
      break;
    case "leave":
      delete enrollments[op.pathId];
      delete done[op.pathId];
      break;
  }
  return { ...state, enrollments, done };
}

/** The server's rows, with this device's unconfirmed changes on top. */
export function fromRemote(remote: RemoteProgress, pending: ProgressOp[]): ProgressState {
  let state: ProgressState = { enrollments: {}, done: {}, pending };
  remote.enrollments.forEach((e) => {
    state.enrollments[e.path_id] = { startedAt: e.started_at, finishedAt: e.finished_at };
  });
  remote.done.forEach((d) => {
    const list = (state.done[d.path_id] ??= []);
    if (!list.includes(d.day)) list.push(d.day);
  });
  Object.values(state.done).forEach((list) => list.sort((a, b) => a - b));
  pending.forEach((op) => {
    state = applyOp(state, op);
  });
  return { ...state, pending };
}

export function enrollmentOf(state: ProgressState, pathId: string): Enrollment | null {
  const e = state.enrollments[pathId];
  if (!e) return null;
  return { pathId, startedAt: e.startedAt, finishedAt: e.finishedAt, done: state.done[pathId] ?? [] };
}

/** The first day not yet done, or null when every day is. */
export function nextDay(total: number, done: number[]) {
  for (let n = 1; n <= total; n += 1) if (!done.includes(n)) return n;
  return null;
}

export function joinDays(days: PathDay[], find: (id: string) => Sermon | undefined): PathDayWithSermon[] {
  return days.map((d) => ({ ...d, sermon: find(d.youtubeId) }));
}

/**
 * The path someone is on: the most recently started one that isn't
 * finished and still exists, with today's day.
 */
export function activePath(
  state: ProgressState,
  paths: Path[],
  daysByPath: Map<string, PathDay[]>,
  find: (id: string) => Sermon | undefined,
): ActivePath | null {
  const open = Object.entries(state.enrollments)
    .filter(([, e]) => !e.finishedAt)
    .sort((a, b) => b[1].startedAt.localeCompare(a[1].startedAt));
  for (const [pathId, e] of open) {
    const path = paths.find((p) => p.id === pathId);
    const days = daysByPath.get(pathId);
    if (!path || !days?.length) continue;
    const done = state.done[pathId] ?? [];
    const day = nextDay(days.length, done);
    if (day == null) continue;
    const joined = joinDays(days, find);
    return {
      path,
      day,
      done,
      total: days.length,
      days: joined,
      today: joined.find((d) => d.day === day),
      startedAt: e.startedAt,
    };
  }
  return null;
}

/**
 * Paths to suggest for these topics (the viewer's, in the order they're
 * offered): each topic's paths in the order it lists them, the topics
 * taking turns, so every topic's best fit comes before any topic's second.
 * A path that isn't loaded, that the viewer has started or finished, or
 * that this device can't offer (`offered`) is skipped, and one two topics
 * share is suggested once.
 */
export function suggestPaths(
  topics: readonly Pick<Topic, "pathIds">[],
  paths: readonly Path[],
  state: ProgressState,
  offered: (path: Path) => boolean = () => true,
  count = 3,
): Path[] {
  const byId = new Map(paths.map((p) => [p.id, p]));
  return takeTurns(
    topics.map((topic) =>
      topic.pathIds.flatMap((id) => {
        const path = byId.get(id);
        return path && !state.enrollments[id] && offered(path) ? [path] : [];
      }),
    ),
    count,
  );
}
