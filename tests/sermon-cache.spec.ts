import { expect, test } from "@playwright/test";
import {
  SERMON_KEEP,
  SERMON_STALE_MS,
  createSermonCache,
  type SermonCopies,
} from "../src/learning/sermonCache";

// How a sermon's moments and card are kept on the device
// (src/learning/sermonCache.ts), driven without React or the network: a
// fake AsyncStorage, clock and fetcher, and a screen that shows what it's
// handed as useSermonData does.

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-10-28T12:00:00Z");
const A = "nUW8NT2Pe88";
const B = "H9sRbSUt0YE";

type Card = { summary: string } | null;

function setup(saved: SermonCopies<Card> = {}, { memoryOnly = false } = {}) {
  const clock = { now: NOW };
  const device = { copies: saved, reads: 0, writes: 0 };
  const fetched: string[] = [];
  const answers = new Map<string, () => Promise<Card>>();
  const screen: Record<string, Card> = {};
  const cache = createSermonCache<Card>({
    storage: memoryOnly
      ? null
      : {
          read: async () => {
            device.reads += 1;
            return structuredClone(device.copies);
          },
          write: (copies) => {
            device.writes += 1;
            device.copies = structuredClone(copies);
          },
        },
    get: (id) => {
      fetched.push(id);
      return (answers.get(id) ?? (async () => ({ summary: `${id} from the server` })))();
    },
    now: () => clock.now,
    none: null,
    show: (id, pick, copies) => {
      Object.entries(copies).forEach(([other, data]) => {
        if (!(other in screen)) screen[other] = data;
      });
      screen[id] = pick(screen[id]);
    },
  });
  return { cache, clock, device, fetched, answers, screen };
}

const offline = async (): Promise<Card> => {
  throw new Error("No connection");
};

test("the device's copy shows at once, and is fetched again only once it's 6 hours old", async () => {
  const copy = { summary: "kept" };
  const t = setup({ [A]: { at: NOW - HOUR, data: copy } });
  await t.cache.load(A);
  expect(t.screen[A]).toEqual(copy);
  expect(t.fetched).toEqual([]);

  // Still fresh just before 6 hours…
  t.clock.now = NOW - HOUR + SERMON_STALE_MS - 1;
  await t.cache.load(A);
  expect(t.fetched).toEqual([]);

  // …then the copy shows while the new one is fetched.
  t.clock.now = NOW - HOUR + SERMON_STALE_MS;
  let answer!: (card: Card) => void;
  t.answers.set(A, () => new Promise((resolve) => (answer = resolve)));
  const loading = t.cache.load(A);
  await expect.poll(() => t.fetched).toEqual([A]);
  expect(t.screen[A]).toEqual(copy);
  answer({ summary: "new" });
  await loading;
  expect(t.screen[A]).toEqual({ summary: "new" });
  expect(t.device.copies[A]).toEqual({ at: t.clock.now, data: { summary: "new" } });
  // The device is read once, however many sermons open.
  await t.cache.load(B);
  expect(t.device.reads).toBe(1);
});

test("a failure keeps the copy, saves nothing and tries again on the next visit", async () => {
  const copy = { summary: "kept" };
  const t = setup({ [A]: { at: NOW - SERMON_STALE_MS, data: copy } });
  t.answers.set(A, offline);
  await t.cache.load(A);
  expect(t.screen[A]).toEqual(copy);
  expect(t.device.writes).toBe(0);
  expect(t.device.copies[A].at).toBe(NOW - SERMON_STALE_MS);

  // Without a copy, nothing shows, and nothing is kept for the failure…
  t.answers.set(B, offline);
  await t.cache.load(B);
  expect(t.screen[B]).toBeNull();
  expect(t.device.copies[B]).toBeUndefined();

  // …so the next visit, a moment later, fetches it.
  t.answers.delete(B);
  t.clock.now += 1000;
  await t.cache.load(B);
  expect(t.fetched).toEqual([A, B, B]);
  expect(t.screen[B]).toEqual({ summary: `${B} from the server` });
});

test("a sermon without a card is kept as one, and not asked about again for 6 hours", async () => {
  const t = setup();
  t.answers.set(A, async () => null);
  await t.cache.load(A);
  expect(t.screen[A]).toBeNull();
  expect(t.device.copies[A]).toEqual({ at: NOW, data: null });
  t.clock.now += SERMON_STALE_MS - 1;
  await t.cache.load(A);
  expect(t.fetched).toEqual([A]);
});

test("the device keeps the 40 sermons fetched most recently", async () => {
  const saved: SermonCopies<Card> = {};
  for (let i = 0; i < SERMON_KEEP; i++) saved[`s${i}`] = { at: NOW - (i + 1) * HOUR, data: { summary: `${i}` } };
  const t = setup(saved);
  await t.cache.load(A);
  const kept = Object.keys(t.device.copies);
  expect(kept).toHaveLength(SERMON_KEEP);
  expect(kept[0]).toBe(A);
  // The oldest goes.
  expect(kept).not.toContain(`s${SERMON_KEEP - 1}`);
  expect(kept).toContain(`s${SERMON_KEEP - 2}`);
  // What the device had shows too, so later pages open with theirs at once.
  expect(t.screen.s0).toEqual({ summary: "0" });
});

test("one load of a sermon at a time, and in memory only without storage", async () => {
  const t = setup({}, { memoryOnly: true });
  await Promise.all([t.cache.load(A), t.cache.load(A)]);
  expect(t.fetched).toEqual([A]);
  await t.cache.load(A);
  expect(t.fetched).toEqual([A]);
  expect(t.device.reads).toBe(0);
  expect(t.device.writes).toBe(0);
  expect(t.screen[A]).toEqual({ summary: `${A} from the server` });
});
