import { expect, test } from "@playwright/test";
import { decodeSnapshot, encodeSnapshot, type SermonRecord, type Snapshot } from "../src/catalogue/records";
import { NEWEST, createRemote } from "../src/catalogue/remote";
import { loadCatalogue, type CatalogueSource, type Store } from "../src/catalogue/sync";
import { sampleRecords, sampleSnapshot } from "../src/data/sermons";

// Where the next sync starts (16 October 2026). A sync's cursor is the
// newest updated_at in Supabase from before its rows were read, never the
// newest among the rows: a sermon corrected on a page already read, followed
// by a change to a row read later, was skipped until the weekly whole fetch.
// Driven through the real createRemote, against a stand-in for Supabase's
// REST API whose rows change between requests.

const NOW = Date.parse("2026-10-16T12:00:00Z");
/** Supabase's timestamps (microseconds, UTC), never the device's clock. */
const at = (minute: number) => `2026-10-16T10:0${minute}:00.000123+00:00`;

type SermonRow = SermonRecord & { updated_at: string };
type SeriesRow = { key: string; name: string; updated_at: string };
type Db = { sermons: SermonRow[]; series: SeriesRow[] };

function record(n: number, updated_at: string): SermonRow {
  const id = `v${String(n).padStart(10, "0")}`;
  return {
    ...sampleRecords[0],
    youtube_id: id,
    title: `MESSAGE ${n}`,
    headline: `Message ${n}`,
    series_key: null,
    published_at: new Date(Date.parse("2026-10-14T10:00:00Z") - n * 86_400_000).toISOString(),
    thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    updated_at,
  };
}

const series = (updated_at: string): SeriesRow => ({
  key: "lioness-conference-2026",
  name: "Lioness Conference 2026",
  updated_at,
});

/**
 * Supabase's REST API over `db`, as much as the catalogue asks of it:
 * select, the updated_at=gt. filter, order, limit, offset and the count.
 * `before` runs as each request is about to be answered, to change rows
 * mid-sync. Every request is logged, and again once answered.
 */
function fakeSupabase(db: Db, before?: (request: string) => void | Promise<void>) {
  const log: string[] = [];
  const answered: string[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop() as keyof Db;
    const params = url.searchParams;
    const since = params.get("updated_at")?.replace(/^gt\./, "");
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit"));
    const request =
      params.get("select") === "updated_at"
        ? `${table} newest change`
        : `${table} ${since ? `changed since ${since}` : "all"} ${offset}+${limit}`;
    log.push(request);
    await before?.(request);
    let rows: Record<string, unknown>[] = db[table];
    if (since) rows = rows.filter((row) => String(row.updated_at) > since);
    const order = params.get("order")!.split(",").map((term) => term.split("."));
    rows = [...rows].sort((a, b) => {
      for (const [column, direction] of order) {
        const [x, y] = [String(a[column]), String(b[column])];
        if (x !== y) return (x < y ? -1 : 1) * (direction === "desc" ? -1 : 1);
      }
      return 0;
    });
    const page = rows.slice(offset, offset + limit);
    const columns = params.get("select")!.split(",");
    const body = page.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
    const counted = (init?.headers as Record<string, string>)?.Prefer === "count=exact";
    const range = page.length ? `${offset}-${offset + page.length - 1}/${rows.length}` : `*/${rows.length}`;
    answered.push(request);
    return new Response(JSON.stringify(body), { headers: counted ? { "content-range": range } : {} });
  };
  return { fetch, log, answered };
}

function memoryStore(initial: string | null = null) {
  const store = {
    raw: initial,
    writes: 0,
    read: async () => store.raw,
    write: async (raw: string) => {
      store.raw = raw;
      store.writes++;
    },
  };
  return store satisfies Store;
}

/** One sync, as the app runs it at launch, over `supabase`. */
async function sync(supabase: ReturnType<typeof fakeSupabase>, store: Store, now = NOW) {
  const reports: [CatalogueSource, number][] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = supabase.fetch as typeof fetch;
  try {
    const { online } = await loadCatalogue({
      remote: createRemote({ url: "https://example.supabase.co", key: "public" }),
      store,
      sample: sampleSnapshot,
      now: () => now,
      report: (snapshot, source) => reports.push([source, snapshot.sermons.length]),
    });
    return { online, reports };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const titleOf = (snapshot: Snapshot, n: number) =>
  snapshot.sermons.find((s) => s.youtube_id === `v${String(n).padStart(10, "0")}`)?.title;

test("a sermon corrected while the whole library is read comes in the next sync", async () => {
  // 450 sermons: the newest 200 alone, then the rest in one page. The
  // newest change before the sync is a sermon on that later page.
  const db: Db = {
    sermons: Array.from({ length: 450 }, (_, n) => record(n, n === 300 ? at(0) : "2026-10-09T08:00:00+00:00")),
    series: [series("2026-10-01T00:00:00+00:00")],
  };
  let corrected = false;
  const supabase = fakeSupabase(db, (request) => {
    if (request !== `sermons all ${NEWEST}+1000` || corrected) return;
    // The newest 200 are in; before the rest are read, the newest sermon's
    // title is corrected, then a sermon on the page still to come changes.
    corrected = true;
    db.sermons[0] = { ...db.sermons[0], title: "Corrected title", updated_at: at(1) };
    db.sermons[400] = { ...db.sermons[400], headline: "Message 400 (renamed)", updated_at: at(2) };
  });
  const store = memoryStore();

  // A first visit: the newest first, then the whole library, as before.
  const first = await sync(supabase, store);
  expect(first.online).toBe(true);
  expect(first.reports).toEqual([
    ["newest", NEWEST],
    ["remote", 450],
  ]);
  let saved = decodeSnapshot(store.raw)!;
  // The newest were read before the correction, the later page after its change.
  expect(titleOf(saved, 0)).toBe("MESSAGE 0");
  expect(saved.sermons.find((s) => s.headline === "Message 400 (renamed)")).toBeTruthy();
  // The cursor is the newest change before the rows (10:00), not the newest
  // row read (10:02); it was asked for before any rows.
  expect(saved.syncedAt).toBe(at(0));
  expect(supabase.log.slice(0, 2).sort()).toEqual(["series newest change", "sermons newest change"]);
  expect(supabase.log.slice(2)).toContain(`sermons all 0+${NEWEST}`);

  // The next launch asks for what changed since then: the correction too.
  supabase.log.length = 0;
  const second = await sync(supabase, store, NOW + 60 * 60 * 1000);
  expect(second.reports).toEqual([
    ["cache", 450],
    ["remote", 450],
  ]);
  expect(supabase.log.slice(2).sort()).toEqual([
    `series changed since ${at(0)} 0+1000`,
    `sermons changed since ${at(0)} 0+1000`,
  ]);
  saved = decodeSnapshot(store.raw)!;
  expect(titleOf(saved, 0)).toBe("Corrected title");
  expect(saved.sermons).toHaveLength(450);
  expect(saved.syncedAt).toBe(at(2));

  // Then nothing is newer: only the newest change is asked for, nothing saved.
  supabase.log.length = 0;
  const writes = store.writes;
  const third = await sync(supabase, store, NOW + 2 * 60 * 60 * 1000);
  expect(third.online).toBe(true);
  expect(supabase.log.sort()).toEqual(["series newest change", "sermons newest change"]);
  expect(store.writes).toBe(writes);
});

test("a sermon corrected while the changes are read comes in the next sync", async () => {
  const sermons = [0, 1, 2].map((n) => record(n, at(0)));
  const db: Db = { sermons: sermons.map((s) => ({ ...s })), series: [series(at(0))] };
  const strip = ({ updated_at: _u, ...rest }: SermonRow) => rest as SermonRecord;
  const copy: Snapshot = {
    sermons: sermons.map(strip),
    series: [{ key: "lioness-conference-2026", name: "Lioness Conference 2026" }],
    syncedAt: at(0),
    fullAt: NOW - 1000,
  };
  const store = memoryStore(encodeSnapshot(copy));
  // Something changed since the copy, so the changes are read.
  db.sermons[1] = { ...db.sermons[1], title: "MESSAGE 1 (RENAMED)", updated_at: at(1) };
  let corrected = false;
  const supabase = fakeSupabase(db, async (request) => {
    if (!request.startsWith("series changed since") || corrected) return;
    // Once the changed sermons are in, and before the changed series are
    // read, a sermon is corrected and then a series renamed.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(supabase.answered).toContain(`sermons changed since ${at(0)} 0+1000`);
    corrected = true;
    db.sermons[2] = { ...db.sermons[2], title: "Corrected title", updated_at: at(2) };
    db.series[0] = { ...db.series[0], name: "Lioness Conference 2026 (Abuja)", updated_at: at(3) };
  });

  await sync(supabase, store);
  let saved = decodeSnapshot(store.raw)!;
  expect(titleOf(saved, 1)).toBe("MESSAGE 1 (RENAMED)");
  expect(titleOf(saved, 2)).toBe("MESSAGE 2");
  expect(saved.series[0].name).toBe("Lioness Conference 2026 (Abuja)");
  // Not the renamed series' 10:03, which would skip the 10:02 correction.
  expect(saved.syncedAt).toBe(at(1));

  await sync(supabase, store, NOW + 60 * 60 * 1000);
  saved = decodeSnapshot(store.raw)!;
  expect(titleOf(saved, 2)).toBe("Corrected title");
  expect(saved.syncedAt).toBe(at(3));
});
