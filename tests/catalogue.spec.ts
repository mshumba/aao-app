import { expect, test } from "@playwright/test";
import {
  decodeSnapshot,
  encodeSnapshot,
  type Changes,
  type SermonRecord,
  type Snapshot,
} from "../src/catalogue/records";
import {
  FULL_SYNC_EVERY,
  loadCatalogue,
  type CatalogueSource,
  type Remote,
  type Store,
} from "../src/catalogue/sync";
import { sampleRecords, sampleSnapshot, sermonsFrom } from "../src/data/sermons";

// The library's on-device copy and its sync, driven without React or the
// network: a fake Supabase and a fake AsyncStorage.

const NOW = Date.parse("2026-10-14T12:00:00Z");

function record(id: string, headline: string, publishedAt: string): SermonRecord {
  return {
    ...sampleRecords[0],
    youtube_id: id.padEnd(11, "x"),
    title: headline.toUpperCase(),
    headline,
    preached_on: null,
    published_at: publishedAt,
    thumbnail_url: `https://i.ytimg.com/vi/${id.padEnd(11, "x")}/hqdefault.jpg`,
  };
}

const library: Changes = {
  sermons: [
    record("a", "First Message", "2026-10-01T10:00:00+00:00"),
    record("b", "Second Message", "2026-10-02T10:00:00+00:00"),
  ],
  series: [{ key: "lioness-conference-2026", name: "Lioness Conference 2026" }],
  syncedAt: "2026-10-02T10:00:00.000001+00:00",
};

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

function fakeRemote(behaviour: {
  all?: Changes | Error;
  changes?: Changes | Error;
}) {
  const calls: string[] = [];
  const remote: Remote = {
    fetchAll: async () => {
      calls.push("all");
      if (!behaviour.all || behaviour.all instanceof Error) throw behaviour.all ?? new Error("offline");
      return behaviour.all;
    },
    fetchChanges: async (since) => {
      calls.push(`since ${since}`);
      if (!behaviour.changes || behaviour.changes instanceof Error)
        throw behaviour.changes ?? new Error("offline");
      return behaviour.changes;
    },
  };
  return { remote, calls };
}

async function load(remote: Remote, store: Store) {
  const reports: [CatalogueSource, number][] = [];
  let read = false;
  const result = await loadCatalogue({
    remote,
    store,
    sample: sampleSnapshot,
    now: () => NOW,
    report: (snapshot, source) => reports.push([source, snapshot.sermons.length]),
    onRead: () => (read = true),
  });
  return { ...result, reports, read };
}

test("first launch offline: the bundled sample stands in", async () => {
  const store = memoryStore();
  const { remote } = fakeRemote({});
  const result = await load(remote, store);
  expect(result.online).toBe(false);
  expect(result.read).toBe(true);
  expect(result.reports).toEqual([["sample", 4]]);
  // Nothing is cached from the sample, so the next launch tries again.
  expect(store.raw).toBeNull();
});

test("first launch online: the whole library loads and is kept", async () => {
  const store = memoryStore();
  const { remote, calls } = fakeRemote({ all: library });
  const result = await load(remote, store);
  expect(result.online).toBe(true);
  expect(calls).toEqual(["all"]);
  expect(result.reports).toEqual([["remote", 2]]);
  const saved = decodeSnapshot(store.raw)!;
  expect(saved.sermons.map((s) => s.headline)).toEqual(["First Message", "Second Message"]);
  expect(saved.syncedAt).toBe(library.syncedAt);
  expect(saved.fullAt).toBe(NOW);
});

test("offline with a saved copy: the copy stays, the sample never replaces it", async () => {
  const snapshot: Snapshot = { ...library, fullAt: NOW - 1000 };
  const store = memoryStore(encodeSnapshot(snapshot));
  const { remote } = fakeRemote({});
  const result = await load(remote, store);
  expect(result.online).toBe(false);
  expect(result.reports).toEqual([["cache", 2]]);
});

test("a saved copy asks only for what changed since, and merges it", async () => {
  const snapshot: Snapshot = { ...library, fullAt: NOW - 1000 };
  const store = memoryStore(encodeSnapshot(snapshot));
  const changed = record("b", "Second Message (Renamed)", "2026-10-02T10:00:00+00:00");
  const added = record("c", "Third Message", "2026-10-13T10:00:00+00:00");
  const { remote, calls } = fakeRemote({
    changes: { sermons: [changed, added], series: [], syncedAt: "2026-10-13T10:00:01+00:00" },
  });
  const result = await load(remote, store);
  expect(calls).toEqual([`since ${library.syncedAt}`]);
  expect(result.reports).toEqual([
    ["cache", 2],
    ["remote", 3],
  ]);
  const saved = decodeSnapshot(store.raw)!;
  expect(sermonsFrom(saved).map((s) => s.headline)).toEqual([
    "Third Message",
    "Second Message (Renamed)",
    "First Message",
  ]);
  expect(saved.syncedAt).toBe("2026-10-13T10:00:01+00:00");
});

test("nothing changed: the saved copy isn't rewritten", async () => {
  const store = memoryStore(encodeSnapshot({ ...library, fullAt: NOW - 1000 }));
  const { remote } = fakeRemote({ changes: { sermons: [], series: [], syncedAt: null } });
  await load(remote, store);
  expect(store.writes).toBe(0);
});

test("once a week the whole library is fetched again, so removals leave", async () => {
  const store = memoryStore(encodeSnapshot({ ...library, fullAt: NOW - FULL_SYNC_EVERY - 1 }));
  const smaller: Changes = { ...library, sermons: library.sermons.slice(0, 1) };
  const { remote, calls } = fakeRemote({ all: smaller });
  const result = await load(remote, store);
  expect(calls).toEqual(["all"]);
  expect(result.reports.at(-1)).toEqual(["remote", 1]);
});

test("an empty library (a project without the catalogue) counts as unreachable", async () => {
  const store = memoryStore();
  const { remote } = fakeRemote({ all: { sermons: [], series: [], syncedAt: null } });
  const result = await load(remote, store);
  expect(result.online).toBe(false);
  expect(result.reports).toEqual([["sample", 4]]);
  expect(store.raw).toBeNull();
});

test("a damaged or outdated saved copy is ignored", async () => {
  for (const raw of ["{not json", JSON.stringify({ v: 99, rows: [] }), JSON.stringify({ v: 1 })]) {
    const store = memoryStore(raw);
    const { remote } = fakeRemote({});
    const result = await load(remote, store);
    expect(result.reports).toEqual([["sample", 4]]);
  }
});

test("storage that fails to read or write doesn't stop the library loading", async () => {
  const store: Store = {
    read: () => Promise.reject(new Error("blocked")),
    write: () => Promise.reject(new Error("full")),
  };
  const { remote } = fakeRemote({ all: library });
  const result = await load(remote, store);
  expect(result.online).toBe(true);
  expect(result.reports).toEqual([["remote", 2]]);
});

test("the saved copy round-trips and leaves out the usual thumbnail", () => {
  const snapshot: Snapshot = {
    sermons: [...sampleRecords, ...library.sermons],
    series: library.series,
    syncedAt: library.syncedAt,
    fullAt: NOW,
  };
  const raw = encodeSnapshot(snapshot);
  expect(raw).not.toContain("hqdefault");
  expect(decodeSnapshot(raw)).toEqual(snapshot);
});
