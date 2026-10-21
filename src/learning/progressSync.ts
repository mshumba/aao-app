import type { ProgressOp } from "./progress";
import type { RemoteProgress } from "./queries";

/**
 * Sends a member's path progress to the server and reads it back, for
 * whichever account is on the device now. Plain code (no React), so its
 * rules can be tested on their own (tests/paths-sync.spec.ts).
 *
 * - One run at a time. A request made while one runs is remembered (the
 *   latest account's) and carried out when that run ends, however it
 *   ended: an early return can't drop it.
 * - `reset()` (the account changed) makes the run in flight obsolete: it
 *   neither commits nor retries, and a retry waiting for the previous
 *   account is cancelled. Tokens are asked for by account
 *   (`token(owner)`), so one account's token never carries another's
 *   changes.
 * - A run that couldn't send everything, or couldn't read back, tries
 *   again after 2s, 4s, 8s … (at most `maxDelay` apart). While changes are
 *   waiting it keeps trying at that pace for as long as the app is open;
 *   with nothing to send it gives up after `tries`. `wake()` (the app came
 *   back, the connection returned) tries again at once.
 */

export type SyncTransport = {
  /** A token for this account, or null (signed out, renewing, another account's). */
  token: (owner: string) => Promise<string | null>;
  send: (token: string, op: ProgressOp) => Promise<void>;
  fetch: (token: string) => Promise<RemoteProgress>;
  /** Refused for good (the path was removed): drop the change rather than retry it. */
  isPermanent: (error: unknown) => boolean;
};

export type SyncHost = {
  /** The account whose progress the device shows now; null when it doesn't sync (a guest). */
  owner: () => string | null;
  /** That account's changes the server hasn't confirmed, oldest first. */
  pending: () => readonly ProgressOp[];
  /**
   * A run for `owner` ended: `sent` reached the server (or were refused for
   * good), and `remote` is what the server holds now (null when it couldn't
   * be read back).
   */
  settle: (owner: string, sent: ReadonlySet<ProgressOp>, remote: RemoteProgress | null) => void;
  /** A run for `owner` couldn't finish (offline, no token yet). */
  failed: (owner: string) => void;
};

export type SyncTimers = {
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

export type SyncOptions = {
  /** First retry after this long (ms); each next one waits twice as long. */
  base?: number;
  /** Retries are never further apart than this (ms). */
  maxDelay?: number;
  /** With nothing waiting to be sent, stop retrying after this many. */
  tries?: number;
  timers?: SyncTimers;
};

export type ProgressSync = {
  /** Sync this account now (or as soon as the run in flight ends). */
  request: (owner: string) => void;
  /** The app came back or the connection returned: start the backoff over and sync now. */
  wake: () => void;
  /** The account changed: forget the previous one's run, retry and queued request. */
  reset: () => void;
  dispose: () => void;
};

const defaultTimers: SyncTimers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createProgressSync(
  transport: SyncTransport,
  host: SyncHost,
  options: SyncOptions = {},
): ProgressSync {
  const { base = 2000, maxDelay = 60_000, tries = 6, timers = defaultTimers } = options;
  let wanted: string | null = null;
  let draining = false;
  let generation = 0;
  let failures = 0;
  let timer: unknown = null;
  let disposed = false;

  const cancelRetry = () => {
    if (timer != null) timers.clear(timer);
    timer = null;
  };

  function retryLater(owner: string) {
    host.failed(owner);
    if (disposed) return;
    // Completed days must reach the server: keep trying while any wait.
    if (failures >= tries && host.pending().length === 0) return;
    const delay = Math.min(maxDelay, base * 2 ** Math.min(failures, 16));
    failures += 1;
    cancelRetry();
    const gen = generation;
    timer = timers.set(() => {
      timer = null;
      // Only for the account it was set for.
      if (gen === generation && host.owner() === owner) request(owner);
    }, delay);
  }

  async function runOnce(owner: string) {
    const gen = generation;
    const obsolete = () => disposed || gen !== generation || host.owner() !== owner;
    if (obsolete()) return;
    let token: string | null = null;
    try {
      token = await transport.token(owner);
    } catch {
      token = null;
    }
    if (obsolete()) return;
    // Still restoring or renewing the session: try again shortly.
    if (!token) return retryLater(owner);

    const sent = new Set<ProgressOp>();
    let complete = true;
    for (const op of [...host.pending()]) {
      try {
        await transport.send(token, op);
        sent.add(op);
      } catch (error) {
        // Refused for good: drop it. Otherwise keep it, and everything
        // after it (order matters), for the next run.
        if (transport.isPermanent(error)) sent.add(op);
        else {
          complete = false;
          break;
        }
      }
      if (obsolete()) return;
    }

    let remote: RemoteProgress | null = null;
    try {
      remote = await transport.fetch(token);
    } catch {
      complete = false;
    }
    if (obsolete()) return;
    host.settle(owner, sent, remote);
    if (complete) {
      failures = 0;
      cancelRetry();
    } else retryLater(owner);
  }

  async function drain() {
    try {
      while (wanted != null && !disposed) {
        const owner = wanted;
        wanted = null;
        try {
          await runOnce(owner);
        } catch {
          // runOnce reports its own failures; the next request goes ahead.
        }
      }
    } finally {
      draining = false;
    }
  }

  function request(owner: string) {
    if (disposed) return;
    wanted = owner;
    if (draining) return;
    draining = true;
    void drain();
  }

  return {
    request,
    wake: () => {
      const owner = host.owner();
      if (!owner || disposed) return;
      failures = 0;
      cancelRetry();
      request(owner);
    },
    reset: () => {
      generation += 1;
      wanted = null;
      failures = 0;
      cancelRetry();
    },
    dispose: () => {
      disposed = true;
      generation += 1;
      wanted = null;
      cancelRetry();
    },
  };
}
