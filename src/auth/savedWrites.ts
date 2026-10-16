/**
 * Saves and unsaves on their way to the account service, and what the
 * screen shows meanwhile. Plain code (no React), so its rules can be tested
 * on their own (tests/saved-order.spec.ts). AccountProvider keeps one, and
 * every Save control (the sermon page, Home, search, a save made after
 * signing up) goes through it, so a tap on one screen and a tap on another
 * wait for each other.
 *
 * - One write at a time for each account and sermon. A tap made while one
 *   is on its way waits for it; then only the latest state is sent, unless
 *   that write already sent it. So the service ends with the last tap,
 *   whichever screen made it, and a burst (save, unsave, save) sends no
 *   more than it needs.
 * - The screen shows each tap at once (`show`). When the write carrying the
 *   latest tap fails, it shows what the service holds again: the state
 *   before the taps, or the last one written.
 * - A tap's promise settles with the write that carries it: it resolves
 *   once that write reached the service (or, when the write before it
 *   already sent the latest state, with that one), and rejects with its
 *   error.
 * - Reads of the saved list (`read`) have the latest taps laid over them
 *   until one read begins after they reached the service: an older read
 *   would otherwise undo them.
 * - A write still waiting when its account signs out isn't sent (it would
 *   go out under the next account's session); its taps fail instead.
 */

export type SavedService = {
  /** Saves (true) or unsaves the sermon for the account. */
  write: (userId: string, sermonId: string, saved: boolean) => Promise<void>;
  /** Shows the sermon in the account's saved list, or not. */
  show: (userId: string, sermonId: string, saved: boolean) => void;
};

export type SavedWrites = {
  /**
   * Shows the sermon saved (or not) at once and writes it after any write
   * of it already on its way. `showing` is what the screen shows for it
   * before this tap.
   */
  set: (userId: string, sermonId: string, saved: boolean, showing: boolean) => Promise<void>;
  /** The account's saved list, from `list`, with the latest taps laid over it. */
  read: (userId: string, list: () => Promise<string[]>) => Promise<string[]>;
  /** The account signed in now (null when none): only its writes are sent. */
  signedIn: (userId: string | null) => void;
};

/** The latest state asked for, and when it reached the service (null until then). */
type Edit = { saved: boolean; settled: number | null };

type Tap = { resolve: () => void; reject: (error: unknown) => void };

/** A sermon's writes, from the first tap until the service has the last. */
type Run = {
  edit: Edit;
  /** The edit this run took the place of, put back when it all fails. */
  prior: Edit | undefined;
  /** What the service holds as far as is known, and when a write here set it. */
  known: boolean;
  knownAt: number | null;
  /** Taps the next write carries. */
  waiting: Tap[];
};

export function createSavedWrites(service: SavedService): SavedWrites {
  // Counts writes that reached the service, so a read knows which it has.
  let seq = 0;
  // Each account's latest taps, by sermon; another account's never show.
  const edits = new Map<string, Map<string, Edit>>();
  const runs = new Map<string, Run>();
  // Unknown until the provider says, so writes go out as before.
  let current: string | null | undefined;

  const editsOf = (userId: string) => {
    let mine = edits.get(userId);
    if (!mine) edits.set(userId, (mine = new Map()));
    return mine;
  };

  async function drain(userId: string, sermonId: string, run: Run) {
    for (;;) {
      const sent = run.edit.saved;
      const carried = run.waiting.splice(0);
      let failure: { error: unknown } | null = null;
      try {
        if (current !== undefined && current !== userId) throw new Error("Signed out before saving");
        await service.write(userId, sermonId, sent);
      } catch (error) {
        failure = { error };
      }
      // Taps made while it was on its way.
      const latest = run.edit.saved;
      if (!failure) {
        run.known = sent;
        run.knownAt = ++seq;
        carried.forEach((tap) => tap.resolve());
        if (latest !== sent) continue;
        run.edit.settled = run.knownAt;
        run.waiting.splice(0).forEach((tap) => tap.resolve());
        break;
      }
      const { error } = failure;
      carried.forEach((tap) => tap.reject(error));
      // A later tap asked for the other state: it's sent next, even when
      // that's what the service held (the failed write may have landed).
      if (latest !== sent) continue;
      // Nothing newer: back to what the service holds.
      service.show(userId, sermonId, run.known);
      const mine = editsOf(userId);
      if (run.knownAt !== null) {
        run.edit.saved = run.known;
        run.edit.settled = run.knownAt;
      } else if (run.prior) mine.set(sermonId, run.prior);
      else mine.delete(sermonId);
      run.waiting.splice(0).forEach((tap) => tap.reject(error));
      break;
    }
    runs.delete(`${userId}\n${sermonId}`);
  }

  return {
    set(userId, sermonId, saved, showing) {
      service.show(userId, sermonId, saved);
      const key = `${userId}\n${sermonId}`;
      const current = runs.get(key);
      if (current) current.edit.saved = saved;
      const run: Run = current ?? {
        edit: { saved, settled: null },
        prior: editsOf(userId).get(sermonId),
        known: showing,
        knownAt: null,
        waiting: [],
      };
      const done = new Promise<void>((resolve, reject) => run.waiting.push({ resolve, reject }));
      if (!current) {
        runs.set(key, run);
        editsOf(userId).set(sermonId, run.edit);
        drain(userId, sermonId, run);
      }
      return done;
    },

    signedIn(userId) {
      current = userId;
    },

    async read(userId, list) {
      const since = seq;
      let ids = await list();
      const mine = editsOf(userId);
      mine.forEach((edit, sermonId) => {
        // It reached the service before this read began, so the list has it.
        if (edit.settled !== null && edit.settled <= since) {
          mine.delete(sermonId);
          return;
        }
        const rest = ids.filter((id) => id !== sermonId);
        ids = edit.saved ? [sermonId, ...rest] : rest;
      });
      return ids;
    },
  };
}
