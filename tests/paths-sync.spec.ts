import { expect, test } from "@playwright/test";
import type { ProgressOp } from "../src/learning/progress";
import { createProgressSync, type SyncHost, type SyncTransport } from "../src/learning/progressSync";
import type { RemoteProgress } from "../src/learning/queries";

// The sync engine that sends a member's path progress (src/learning/
// progressSync.ts), run without React or the network. The on-device test
// mode never syncs (it has no server), so its rules are tested here with a
// stand-in server and clock.

const HABIT = "breaking-free-from-habitual-sin";
const EMPTY: RemoteProgress = { enrollments: [], done: [] };
const done = (day: number): ProgressOp => ({ kind: "done", pathId: HABIT, day, at: `2026-10-1${day}T08:00:00.000Z` });

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
  for (let i = 0; i < 20; i++) await Promise.resolve();
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

/** The provider's side, reduced to what the engine sees: whose progress shows, and its unsent changes. */
function fakeHost(owner: string, pending: ProgressOp[] = []) {
  const slot = { owner: owner as string | null, pending: [...pending] };
  const settledFor: { owner: string; sent: ProgressOp[]; remote: RemoteProgress | null }[] = [];
  const failed: string[] = [];
  const host: SyncHost = {
    owner: () => slot.owner,
    pending: () => slot.pending,
    settle: (who, sent, remote) => {
      settledFor.push({ owner: who, sent: [...sent], remote });
      if (slot.owner === who) slot.pending = slot.pending.filter((op) => !sent.has(op));
    },
    failed: (who) => void failed.push(who),
  };
  return { host, slot, settledFor, failed };
}

test.describe("syncing path progress", () => {
  test("a day that fails to send retries with bounded backoff while it waits", async () => {
    const clock = fakeTimers();
    const { host, slot, settledFor } = fakeHost("user-a", [done(3)]);
    let online = false;
    const sends: string[] = [];
    const transport: SyncTransport = {
      token: async (owner) => `token-${owner}`,
      send: async (token) => {
        sends.push(token);
        if (!online) throw new TypeError("Network request failed");
      },
      fetch: async () => {
        if (!online) throw new TypeError("Network request failed");
        return EMPTY;
      },
      isPermanent: () => false,
    };
    const sync = createProgressSync(transport, host, { timers: clock.timers, base: 2000, maxDelay: 16_000, tries: 3 });
    sync.request("user-a");
    await settled();
    expect(sends).toHaveLength(1);
    expect(slot.pending).toHaveLength(1);
    // 2s, 4s, 8s, 16s, then every 16s while the day still waits (past `tries`).
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      delays.push(clock.waiting()[0]);
      await clock.advance(clock.waiting()[0]);
    }
    expect(delays).toEqual([2000, 4000, 8000, 16_000, 16_000, 16_000]);
    expect(sends).toHaveLength(7);
    expect(slot.pending).toHaveLength(1);
    // Back online: the next retry delivers it and the retries stop.
    online = true;
    await clock.advance(clock.waiting()[0]);
    expect(slot.pending).toEqual([]);
    expect(settledFor.at(-1)).toMatchObject({ owner: "user-a", remote: EMPTY });
    expect(clock.waiting()).toEqual([]);
  });

  test("the connection returning sends a waiting day at once", async () => {
    const clock = fakeTimers();
    const { host, slot } = fakeHost("user-a", [done(3)]);
    let online = false;
    const transport: SyncTransport = {
      token: async (owner) => `token-${owner}`,
      send: async () => {
        if (!online) throw new TypeError("Network request failed");
      },
      fetch: async () => EMPTY,
      isPermanent: () => false,
    };
    const sync = createProgressSync(transport, host, { timers: clock.timers });
    sync.request("user-a");
    await settled();
    expect(clock.waiting()).toEqual([2000]);
    online = true;
    sync.wake();
    await settled();
    expect(slot.pending).toEqual([]);
    expect(clock.waiting()).toEqual([]);
  });

  test("with nothing to send, a failed read gives up after its tries", async () => {
    const clock = fakeTimers();
    const { host, failed } = fakeHost("user-a");
    const transport: SyncTransport = {
      token: async () => null, // the session is still being restored
      send: async () => {},
      fetch: async () => EMPTY,
      isPermanent: () => false,
    };
    const sync = createProgressSync(transport, host, { timers: clock.timers, base: 1000, maxDelay: 60_000, tries: 3 });
    sync.request("user-a");
    await settled();
    for (let i = 0; i < 3; i++) await clock.advance(clock.waiting()[0]);
    expect(failed).toEqual(["user-a", "user-a", "user-a", "user-a"]);
    expect(clock.waiting()).toEqual([]);
  });

  test("a change refused for good is dropped; the ones after it still go", async () => {
    const { host, slot } = fakeHost("user-a", [done(2), done(3)]);
    const transport: SyncTransport = {
      token: async (owner) => `token-${owner}`,
      send: async (_token, op) => {
        if (op.kind === "done" && op.day === 2) throw Object.assign(new Error("gone"), { gone: true });
      },
      fetch: async () => EMPTY,
      isPermanent: (error) => !!(error as { gone?: boolean }).gone,
    };
    createProgressSync(transport, host).request("user-a");
    await settled();
    expect(slot.pending).toEqual([]);
  });

  test("switching accounts mid-sync doesn't drop the new account's first sync", async () => {
    const { host, slot, settledFor } = fakeHost("user-a", [done(3)]);
    const fetchA = later<RemoteProgress>();
    const remoteB: RemoteProgress = {
      enrollments: [{ path_id: HABIT, started_at: "2026-10-01T08:00:00.000Z", finished_at: null }],
      done: [{ path_id: HABIT, day: 1, done_at: "2026-10-01T09:00:00.000Z" }],
    };
    const sentWith: string[] = [];
    const transport: SyncTransport = {
      token: async (owner) => `token-${owner}`,
      send: async (token) => void sentWith.push(token),
      fetch: (token) => (token === "token-user-a" ? fetchA.promise : Promise.resolve(remoteB)),
      isPermanent: () => false,
    };
    const sync = createProgressSync(transport, host);
    sync.request("user-a");
    await settled();
    // A's run is reading back when the account changes to B, whose own
    // first sync is asked for while A's is still in flight.
    sync.reset();
    slot.owner = "user-b";
    slot.pending = [];
    sync.request("user-b");
    await settled();
    expect(settledFor).toEqual([]);
    fetchA.resolve(EMPTY);
    await settled();
    // A's late answer is dropped; B's sync still ran, with B's token.
    expect(settledFor).toEqual([{ owner: "user-b", sent: [], remote: remoteB }]);
    expect(sentWith).toEqual(["token-user-a"]);
  });

  test("a retry waiting for one account never runs for the next", async () => {
    const clock = fakeTimers();
    const { host, slot } = fakeHost("user-a", [done(3)]);
    const tokens: string[] = [];
    const transport: SyncTransport = {
      token: async (owner) => {
        tokens.push(owner);
        return `token-${owner}`;
      },
      send: async () => {
        throw new TypeError("Network request failed");
      },
      fetch: async () => EMPTY,
      isPermanent: () => false,
    };
    const sync = createProgressSync(transport, host, { timers: clock.timers });
    sync.request("user-a");
    await settled();
    expect(clock.waiting()).toEqual([2000]);
    sync.reset();
    slot.owner = "user-b";
    slot.pending = [];
    expect(clock.waiting()).toEqual([]);
    await clock.advance(60_000);
    expect(tokens).toEqual(["user-a"]);
  });
});
