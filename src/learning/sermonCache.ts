/**
 * Data that belongs to one sermon (its moments, its card), fetched as its
 * page opens. The device's copy shows at once and is fetched again once it's
 * SERMON_STALE_MS old; the device keeps the SERMON_KEEP sermons fetched most
 * recently. When a fetch fails (offline, or a table not deployed yet) any
 * copy stays, and otherwise `none` shows, quietly. Nothing is kept for a
 * failure, so the next visit tries again.
 *
 * Plain code over storage, a clock and a fetcher, so tests can drive it in
 * Node (tests/sermon-cache.spec.ts); LearningProvider's useSermonData shows
 * what it hands over.
 */

/** A sermon's data is fetched again after this long. */
export const SERMON_STALE_MS = 6 * 60 * 60 * 1000;
/** How many sermons' data (moments and, apart, cards) the device keeps. */
export const SERMON_KEEP = 40;

export type Stamped<T> = { at: number; data: T };
/** Each sermon's data with when it was fetched, as the device keeps it. */
export type SermonCopies<T> = Record<string, Stamped<T>>;

type SermonCacheDeps<T> = {
  /** Where the device keeps its copies; null keeps them in memory only (the local test data). */
  storage: { read: () => Promise<SermonCopies<T>>; write: (copies: SermonCopies<T>) => void } | null;
  /** Fetches a sermon's data; throws when it can't. */
  get: (youtubeId: string) => Promise<T>;
  now: () => number;
  /** What shows for a sermon with no copy whose fetch failed. */
  none: T;
  /**
   * Shows a sermon's data: `pick` gets what's showing for it now. `copies`
   * are every sermon's on the device, so later pages open with theirs at once.
   */
  show: (youtubeId: string, pick: (shown: T | undefined) => T, copies: Record<string, T>) => void;
};

export function createSermonCache<T>({ storage, get, now, none, show }: SermonCacheDeps<T>) {
  let copies: SermonCopies<T> = {};
  let saved: Promise<void> | null = null;
  const inflight = new Set<string>();
  const data = () => Object.fromEntries(Object.entries(copies).map(([id, copy]) => [id, copy.data]));

  async function run(youtubeId: string) {
    // The device's copies are read once, by the first sermon opened.
    if (storage)
      saved ??= storage.read().then((copy) => {
        copies = { ...copy, ...copies };
      });
    await saved;
    const cached = copies[youtubeId];
    // The device's copy shows at once; a fresh one isn't fetched again.
    if (cached) show(youtubeId, () => cached.data, data());
    if (cached && now() - cached.at < SERMON_STALE_MS) return;
    try {
      const fetched = await get(youtubeId);
      copies[youtubeId] = { at: now(), data: fetched };
      // Keep the most recently fetched sermons only.
      copies = Object.fromEntries(
        Object.entries(copies)
          .sort((a, b) => b[1].at - a[1].at)
          .slice(0, SERMON_KEEP),
      );
      storage?.write(copies);
      show(youtubeId, () => fetched, data());
    } catch {
      // Offline or not deployed: keep any copy; otherwise none.
      show(youtubeId, (shown) => shown ?? none, data());
    }
  }

  return {
    /**
     * Loads a sermon's data, settling once it shows; while one load of a
     * sermon is under way, another does nothing.
     */
    load(youtubeId: string): Promise<void> {
      if (!youtubeId || inflight.has(youtubeId)) return Promise.resolve();
      inflight.add(youtubeId);
      return run(youtubeId).finally(() => inflight.delete(youtubeId));
    },
  };
}
