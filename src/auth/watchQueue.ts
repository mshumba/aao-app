import type { ProgressUpdate, WatchProgress } from "./types";

/**
 * Sends the signed-in account's watch positions to the server, keeping each
 * one on the device until it's there. Plain code (no React, no storage of
 * its own), so its rules can be tested on their own
 * (tests/watch-queue.spec.ts). It works as path progress's sync does
 * (src/learning/progressSync.ts):
 *
 * - Only the latest position for each sermon is kept, and positions go out
 *   one request at a time, so an older one never lands after a newer one. A
 *   position whose send failed is kept only if no newer one has replaced it.
 * - What waits is written to the device (`store`), for each account, so
 *   closing the app or losing the connection loses nothing.
 * - A send that fails is tried again after 2s, 4s, 8s … (at most `maxDelay`
 *   apart) for as long as anything waits. `wake()` (the app came back, the
 *   connection returned) tries again at once.
 * - The account's list is read from the server when the account is chosen
 *   (`use`), and again before sending positions that had to wait (from an
 *   earlier launch, or after a failed send): a position saved later on
 *   another device wins, and the waiting one is dropped.
 * - `use(owner)` changes account: the previous one's run and retry stop,
 *   and its waiting positions stay on the device for when it's back.
 */

/** A position waiting to be sent. */
export type WaitingSave = ProgressUpdate & {
  /** When it was saved, by this device's clock (ISO). */
  savedAt: string;
};

export type QueueTransport = {
  send: (owner: string, update: ProgressUpdate) => Promise<void>;
  /** The account's positions on the server, most recent first. */
  read: (owner: string) => Promise<WatchProgress[]>;
  /** Refused for good: drop the position rather than retry it. */
  isPermanent: (error: unknown) => boolean;
};

/** Where each account's waiting positions are kept between launches. */
export type QueueStore = {
  load: (owner: string) => Promise<WaitingSave[]>;
  save: (owner: string, waiting: WaitingSave[]) => Promise<void>;
};

export type QueueHost = {
  /** `owner`'s list was read from the server: this is it, with what still waits laid over it. */
  read: (owner: string, items: WatchProgress[]) => void;
  /** Reading `owner`'s list failed (offline, signed out, refused). */
  unread?: (owner: string, error: unknown) => void;
  /** Sending one of `owner`'s positions failed; `dropped` when it was refused for good. */
  failed?: (owner: string, error: unknown, dropped: boolean) => void;
};

export type QueueTimers = {
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

export type QueueOptions = {
  /** First retry after this long (ms); each next one waits twice as long. */
  base?: number;
  /** Retries are never further apart than this (ms). */
  maxDelay?: number;
  /** With nothing waiting to be sent, stop retrying the read after this many. */
  tries?: number;
  /**
   * A waiting position gives way only to one saved on the server more than
   * this much later (ms), so a phone clock a little behind the server's
   * can't make this device's own newest position look older.
   */
  margin?: number;
  timers?: QueueTimers;
};

export type WatchQueue = {
  /** The account whose positions this sends (null: none); loads what waits for it. */
  use: (owner: string | null) => Promise<void>;
  /** Records `owner`'s latest position in a sermon and sends it. */
  add: (owner: string, update: ProgressUpdate, savedAt?: string) => void;
  /** `items` (the device's copy of the list) with the positions still waiting laid over it. */
  overlay: (items: WatchProgress[]) => WatchProgress[];
  /** What waits for the current account. */
  waiting: () => WaitingSave[];
  /** Start the backoff over and read or send now. */
  wake: () => void;
  dispose: () => void;
};

type Entry = WaitingSave & {
  /** Known not to be older than the server's copy: made since the last read, or checked by it. */
  checked: boolean;
};

const defaultTimers: QueueTimers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Milliseconds since 1970 for a timestamp from the device or the server (microseconds and all). */
export function timeOf(iso: string) {
  const time = Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isFinite(time) ? time : 0;
}

/** A position read back from storage, or null when it isn't one. */
function validSave(value: unknown): WaitingSave | null {
  const save = value as Partial<WaitingSave> | null;
  if (
    !save ||
    typeof save.sermonId !== "string" ||
    typeof save.positionSeconds !== "number" ||
    typeof save.durationSeconds !== "number" ||
    typeof save.finished !== "boolean" ||
    typeof save.savedAt !== "string" ||
    !timeOf(save.savedAt)
  )
    return null;
  const { sermonId, positionSeconds, durationSeconds, finished, savedAt } = save;
  return { sermonId, positionSeconds, durationSeconds, finished, savedAt };
}

const update = ({ sermonId, positionSeconds, durationSeconds, finished }: ProgressUpdate): ProgressUpdate => ({
  sermonId,
  positionSeconds,
  durationSeconds,
  finished,
});

export function createWatchQueue(
  transport: QueueTransport,
  store: QueueStore,
  host: QueueHost,
  options: QueueOptions = {},
): WatchQueue {
  const {
    base = 2000,
    maxDelay = 60_000,
    tries = 6,
    margin = 2 * 60_000,
    timers = defaultTimers,
  } = options;
  let owner: string | null = null;
  let waiting = new Map<string, Entry>();
  // The account's list hasn't been read from the server since it was chosen.
  let needsRead = false;
  // The account's waiting positions from earlier launches have been loaded.
  let loaded: Promise<void> = Promise.resolve();
  let generation = 0;
  let wanted = false;
  let draining = false;
  let failures = 0;
  let timer: unknown = null;
  let disposed = false;
  let writes: Promise<void> = Promise.resolve();

  const cancelRetry = () => {
    if (timer != null) timers.clear(timer);
    timer = null;
  };

  /** Writes what waits for the current account, after any earlier write. */
  function persist() {
    const who = owner;
    if (!who) return;
    const list = [...waiting.values()].map(({ checked: _checked, ...save }) => save);
    writes = writes.then(() => store.save(who, list)).catch(() => {});
  }

  function retryLater() {
    if (disposed) return;
    if (failures >= tries && !waiting.size) return;
    const delay = Math.min(maxDelay, base * 2 ** Math.min(failures, 16));
    failures += 1;
    cancelRetry();
    const gen = generation;
    timer = timers.set(() => {
      timer = null;
      // Only for the account it was set for.
      if (gen === generation) request();
    }, delay);
  }

  /**
   * Lays what waits over the server's list. A position saved there later
   * (by more than `margin`) is newer than the waiting one, which is dropped;
   * the rest have now been checked.
   */
  function merge(items: WatchProgress[]) {
    const server = new Map(items.map((item) => [item.sermonId, item]));
    let dropped = false;
    for (const [id, entry] of waiting) {
      const there = server.get(id);
      if (there && timeOf(there.updatedAt) > timeOf(entry.savedAt) + margin) {
        waiting.delete(id);
        dropped = true;
      } else if (!entry.checked) waiting.set(id, { ...entry, checked: true });
    }
    needsRead = false;
    if (dropped) persist();
    return overlay(items);
  }

  function overlay(items: WatchProgress[]) {
    if (!waiting.size) return items;
    const byId = new Map(items.map((item) => [item.sermonId, item]));
    for (const entry of waiting.values()) {
      const there = byId.get(entry.sermonId);
      if (there && timeOf(there.updatedAt) > timeOf(entry.savedAt) + margin) continue;
      byId.set(entry.sermonId, { ...update(entry), updatedAt: entry.savedAt });
    }
    return [...byId.values()].sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt));
  }

  async function runOnce() {
    const who = owner;
    const gen = generation;
    const obsolete = () => disposed || gen !== generation || owner !== who;
    if (!who) return;
    await loaded;
    if (obsolete()) return;

    if (needsRead || [...waiting.values()].some((entry) => !entry.checked)) {
      let items: WatchProgress[];
      try {
        items = await transport.read(who);
      } catch (error) {
        if (obsolete()) return;
        host.unread?.(who, error);
        return retryLater();
      }
      if (obsolete()) return;
      host.read(who, merge(items));
    }

    for (const id of [...waiting.keys()]) {
      // The latest position for this sermon now, which may have replaced
      // the one there when the run began.
      const entry = waiting.get(id);
      if (!entry) continue;
      try {
        await transport.send(who, update(entry));
      } catch (error) {
        if (obsolete()) return;
        const dropped = transport.isPermanent(error);
        host.failed?.(who, error, dropped);
        if (dropped) {
          if (waiting.get(id) === entry) {
            waiting.delete(id);
            persist();
          }
          continue;
        }
        // Everything waiting has now waited: the server may have newer
        // positions from another device by the next try, so read first.
        for (const [key, waited] of waiting) waiting.set(key, { ...waited, checked: false });
        return retryLater();
      }
      if (obsolete()) return;
      // Sent; unless a newer position came meanwhile, which goes next.
      if (waiting.get(id) === entry) {
        waiting.delete(id);
        persist();
      }
    }
    failures = 0;
    cancelRetry();
  }

  async function drain() {
    try {
      while (wanted && !disposed) {
        wanted = false;
        try {
          await runOnce();
        } catch {
          // runOnce reports its own failures; the next request goes ahead.
        }
      }
    } finally {
      draining = false;
    }
  }

  function request() {
    if (disposed || !owner) return;
    wanted = true;
    if (draining) return;
    draining = true;
    void drain();
  }

  return {
    use(next) {
      if (disposed || next === owner) return loaded;
      generation += 1;
      wanted = false;
      failures = 0;
      cancelRetry();
      owner = next;
      waiting = new Map();
      needsRead = next != null;
      if (!next) return (loaded = Promise.resolve());
      const gen = generation;
      loaded = store
        .load(next)
        .catch(() => [])
        .then((stored) => {
          if (gen !== generation || !Array.isArray(stored)) return;
          // Saved while this was read: written without what was stored.
          const savedMeanwhile = waiting.size > 0;
          for (const value of stored) {
            const save = validSave(value);
            // A position saved since the account was chosen is newer.
            if (save && !waiting.has(save.sermonId)) waiting.set(save.sermonId, { ...save, checked: false });
          }
          if (savedMeanwhile) persist();
        });
      return loaded;
    },
    add(forOwner, change, savedAt = new Date().toISOString()) {
      if (disposed || forOwner !== owner) return;
      waiting.set(change.sermonId, { ...update(change), savedAt, checked: true });
      persist();
      request();
    },
    overlay,
    waiting: () => [...waiting.values()].map(({ checked: _checked, ...save }) => save),
    wake() {
      if (disposed || !owner) return;
      failures = 0;
      cancelRetry();
      request();
    },
    dispose() {
      disposed = true;
      generation += 1;
      wanted = false;
      cancelRetry();
    },
  };
}
