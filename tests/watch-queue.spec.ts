import { expect, test } from "@playwright/test";
import { AuthError, type ProgressUpdate, type WatchProgress } from "../src/auth/types";
import { createWatchQueue, type QueueOptions, type WaitingSave } from "../src/auth/watchQueue";

// The queue that sends a member's watch positions (src/auth/watchQueue.ts),
// run without React, the device or the network: a stand-in server, storage
// and clock. The on-device test mode has no server to fail against, so its
// rules are tested here (tests/offline-progress.spec.ts runs it in the app).

const MEMBER = "member";
const SERMON = "nUW8NT2Pe88";
const OTHER = "WYiA7rjenVI";
const at = (seconds: number): ProgressUpdate => ({
  sermonId: SERMON,
  positionSeconds: seconds,
  durationSeconds: 7200,
  finished: false,
});

/** A clock the test moves by hand. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const queue = new Map<number, { at: number; run: () => void }>();
  return {
    timers: {
      set: (run: () => void, ms: number) => {
        const id = next++;
        queue.set(id, { at: now + ms, run });
        return id;
      },
      clear: (id: unknown) => void queue.delete(id as number),
    },
    /** Delays of the timers waiting now, soonest first. */
    waiting: () => [...queue.values()].map((t) => t.at - now).sort((a, b) => a - b),
    async advance(ms: number) {
      now += ms;
      for (const [id, t] of [...queue.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at > now) continue;
        queue.delete(id);
        t.run();
      }
      await settled();
    },
  };
}

/** Lets every pending promise callback run. */
async function settled() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

/** A deferred promise the test resolves or rejects. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/**
 * A stand-in server holding each account's rows (updated when a send
 * lands), a device's storage, and what the queue told the app.
 */
function world(options: QueueOptions = {}) {
  const clock = fakeTimers();
  const rows = new Map<string, WatchProgress>();
  const stored = new Map<string, WaitingSave[]>();
  const sent: ProgressUpdate[] = [];
  const shown: WatchProgress[][] = [];
  const failed: { error: unknown; dropped: boolean }[] = [];
  const net = {
    online: true,
    /** When set, the next send waits for the test to settle it. */
    hold: null as ReturnType<typeof later<void>> | null,
    reads: 0,
    /** The server's clock for rows written by a send. */
    serverNow: "2026-10-17T12:00:00.000Z",
  };
  const offline = () => new AuthError("network", "Network request failed");
  const queue = (opts: QueueOptions = {}) =>
    createWatchQueue(
      {
        async send(_owner, update) {
          const held = net.hold;
          net.hold = null;
          if (held) await held.promise;
          if (!net.online) throw offline();
          sent.push(update);
          rows.set(update.sermonId, { ...update, updatedAt: net.serverNow });
        },
        async read() {
          net.reads++;
          if (!net.online) throw offline();
          return [...rows.values()];
        },
        isPermanent: (error) => error instanceof AuthError && error.status === 400,
      },
      {
        load: async (owner) => stored.get(owner) ?? [],
        save: async (owner, waiting) => void stored.set(owner, waiting),
      },
      {
        read: (_owner, items) => void shown.push(items),
        failed: (_owner, error, dropped) => void failed.push({ error, dropped }),
      },
      { timers: clock.timers, ...options, ...opts },
    );
  return { clock, rows, stored, sent, shown, failed, net, queue };
}

test.describe("saving watch positions", () => {
  test("a failed save is kept on the device and retried with backoff until it lands", async () => {
    const w = world();
    const queue = w.queue();
    await queue.use(MEMBER);
    w.net.online = false;

    queue.add(MEMBER, at(600), "2026-10-17T12:00:00.000Z");
    await settled();
    // Not sent, not dropped: kept, on the device too.
    expect(w.sent).toEqual([]);
    expect(w.stored.get(MEMBER)).toEqual([{ ...at(600), savedAt: "2026-10-17T12:00:00.000Z" }]);
    expect(w.clock.waiting()).toEqual([2000]);

    // Still offline: each retry waits twice as long.
    await w.clock.advance(2000);
    expect(w.clock.waiting()).toEqual([4000]);
    await w.clock.advance(4000);
    expect(w.clock.waiting()).toEqual([8000]);

    // Back online: the next retry reads the server's list first (the
    // position waited), then sends it, and the device forgets it.
    w.net.online = true;
    const reads = w.net.reads;
    await w.clock.advance(8000);
    expect(w.net.reads).toBe(reads + 1);
    expect(w.sent).toEqual([at(600)]);
    expect(w.stored.get(MEMBER)).toEqual([]);
    expect(w.clock.waiting()).toEqual([]);
    // Failures caused by the connection are never refused for good.
    expect(w.failed.every(({ dropped }) => !dropped)).toBe(true);
  });

  test("retries are never further apart than the cap, and wake tries at once", async () => {
    const w = world({ maxDelay: 10_000 });
    const queue = w.queue();
    await queue.use(MEMBER);
    w.net.online = false;
    queue.add(MEMBER, at(600));
    await settled();
    for (const delay of [2000, 4000, 8000]) await w.clock.advance(delay);
    expect(w.clock.waiting()).toEqual([10_000]);
    await w.clock.advance(10_000);
    expect(w.clock.waiting()).toEqual([10_000]);

    // The app came back to the foreground with the connection.
    w.net.online = true;
    queue.wake();
    await settled();
    expect(w.sent).toEqual([at(600)]);
    expect(w.clock.waiting()).toEqual([]);
  });

  test("closing the app loses nothing: the next launch sends what waited", async () => {
    const w = world();
    const first = w.queue();
    await first.use(MEMBER);
    w.net.online = false;
    first.add(MEMBER, at(4200), "2026-10-17T12:00:00.000Z");
    await settled();
    first.dispose();

    // Relaunched, online. The server still has the older place.
    w.rows.set(SERMON, { ...at(600), updatedAt: "2026-10-17T11:00:00.000000+00:00" });
    w.net.online = true;
    const next = w.queue();
    await next.use(MEMBER);
    expect(next.waiting()).toEqual([{ ...at(4200), savedAt: "2026-10-17T12:00:00.000Z" }]);
    next.wake();
    await settled();
    expect(w.sent).toEqual([at(4200)]);
    // What the app was told to show had the waiting place laid over the server's.
    expect(w.shown[0]).toEqual([{ ...at(4200), updatedAt: "2026-10-17T12:00:00.000Z" }]);
    expect(w.stored.get(MEMBER)).toEqual([]);
  });
});

test("a save made while the device's waiting places are still being read keeps them all", async () => {
  const w = world();
  w.stored.set(MEMBER, [{ ...at(300), sermonId: OTHER, savedAt: "2026-10-16T09:00:00.000Z" }]);
  w.net.online = false;
  const queue = w.queue();
  const loading = queue.use(MEMBER);
  // The viewer saves before the device has answered.
  queue.add(MEMBER, at(600), "2026-10-17T12:00:00.000Z");
  await loading;
  await settled();
  expect(w.stored.get(MEMBER)?.map((save) => save.sermonId).sort()).toEqual([OTHER, SERMON].sort());
});

test.describe("a newer position is never overwritten", () => {
  test("a save that fails after a newer one was made is never sent again", async () => {
    const w = world();
    const queue = w.queue();
    await queue.use(MEMBER);
    // The first save is on its way, slowly, and then fails…
    const first = later<void>();
    w.net.hold = first;
    queue.add(MEMBER, at(600));
    await settled();
    // …while the viewer watches on and a newer place is saved.
    queue.add(MEMBER, at(615));
    w.net.online = false;
    first.resolve();
    await settled();
    expect(w.sent).toEqual([]);
    // Only the newest is kept.
    expect(w.stored.get(MEMBER)?.map((save) => save.positionSeconds)).toEqual([615]);

    w.net.online = true;
    await w.clock.advance(w.clock.waiting()[0]);
    expect(w.sent).toEqual([at(615)]);
    expect(w.rows.get(SERMON)?.positionSeconds).toBe(615);
  });

  test("saves go out one at a time, so a slow older one lands before the newer one", async () => {
    const w = world();
    const queue = w.queue();
    await queue.use(MEMBER);
    const first = later<void>();
    w.net.hold = first;
    queue.add(MEMBER, at(600));
    await settled();
    queue.add(MEMBER, at(615));
    queue.add(MEMBER, at(630));
    await settled();
    // Nothing overtakes the request in flight.
    expect(w.sent).toEqual([]);
    first.resolve();
    await settled();
    // The one in flight lands, then only the latest of the two behind it.
    expect(w.sent.map((save) => save.positionSeconds)).toEqual([600, 630]);
    expect(w.rows.get(SERMON)?.positionSeconds).toBe(630);
  });

  test("a waiting place gives way to one saved later on another device", async () => {
    const w = world();
    // Saved offline yesterday on this phone, never sent.
    w.stored.set(MEMBER, [
      { ...at(600), savedAt: "2026-10-16T09:00:00.000Z" },
      { ...at(300), sermonId: OTHER, savedAt: "2026-10-16T09:00:00.000Z" },
    ]);
    // Since then, the same sermon was watched further on an iPad.
    w.rows.set(SERMON, { ...at(5400), updatedAt: "2026-10-16T20:00:00.123456+00:00" });

    const queue = w.queue();
    await queue.use(MEMBER);
    queue.wake();
    await settled();
    // The iPad's place stays; the other sermon's waiting place goes out.
    expect(w.rows.get(SERMON)?.positionSeconds).toBe(5400);
    expect(w.sent.map((save) => save.sermonId)).toEqual([OTHER]);
    expect(w.stored.get(MEMBER)).toEqual([]);
    expect(w.shown[0].find((item) => item.sermonId === SERMON)?.positionSeconds).toBe(5400);
  });

  test("a phone clock a little behind the server's doesn't make its own newest place look older", async () => {
    const w = world();
    const queue = w.queue();
    await queue.use(MEMBER);
    // Saved through the server a moment ago (by the server's clock)…
    w.net.serverNow = "2026-10-17T12:00:45.000Z";
    queue.add(MEMBER, at(600), "2026-10-17T12:00:15.000Z");
    await settled();
    // …then the next save, by a phone clock 30 seconds behind, fails and waits.
    w.net.online = false;
    queue.add(MEMBER, at(615), "2026-10-17T12:00:30.000Z");
    await settled();
    w.net.online = true;
    await w.clock.advance(2000);
    expect(w.rows.get(SERMON)?.positionSeconds).toBe(615);
  });
});

test.describe("accounts and refusals", () => {
  test("changing account stops the previous one's sends and keeps its places for it", async () => {
    const w = world();
    const queue = w.queue();
    await queue.use(MEMBER);
    w.net.online = false;
    queue.add(MEMBER, at(600));
    await settled();
    expect(w.clock.waiting()).toEqual([2000]);

    await queue.use("someone-else");
    w.net.online = true;
    await w.clock.advance(60_000);
    // Nothing of the first account went out with the second signed in…
    expect(w.sent).toEqual([]);
    // …and its place is still on the device for when it's back.
    expect(w.stored.get(MEMBER)?.map((save) => save.positionSeconds)).toEqual([600]);
    expect(queue.waiting()).toEqual([]);

    await queue.use(MEMBER);
    queue.wake();
    await settled();
    expect(w.sent).toEqual([at(600)]);
  });

  test("a place the server refuses for good is dropped, not retried", async () => {
    const w = world();
    const queue = createWatchQueue(
      {
        send: async () => {
          throw new AuthError("unknown", "invalid input", 400);
        },
        read: async () => [],
        isPermanent: (error) => error instanceof AuthError && error.status === 400,
      },
      { load: async () => [], save: async (owner, waiting) => void w.stored.set(owner, waiting) },
      { read: () => {}, failed: (_owner, error, dropped) => void w.failed.push({ error, dropped }) },
      { timers: w.clock.timers },
    );
    await queue.use(MEMBER);
    queue.add(MEMBER, at(600));
    await settled();
    expect(w.failed.map(({ dropped }) => dropped)).toEqual([true]);
    expect(w.stored.get(MEMBER)).toEqual([]);
    expect(w.clock.waiting()).toEqual([]);
  });

  test("an account's list that can't be read is tried again a few times, then on wake", async () => {
    const w = world();
    w.net.online = false;
    const queue = w.queue({ tries: 3 });
    await queue.use(MEMBER);
    queue.wake();
    await settled();
    for (const delay of [2000, 4000, 8000]) await w.clock.advance(delay);
    // Nothing waits to be sent, so it stops after three retries…
    expect(w.clock.waiting()).toEqual([]);
    expect(w.net.reads).toBe(4);
    // …until the app comes back.
    w.net.online = true;
    queue.wake();
    await settled();
    expect(w.net.reads).toBe(5);
    expect(w.shown).toHaveLength(1);
  });
});
