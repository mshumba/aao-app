import {
  decodeSnapshot,
  encodeSnapshot,
  mergeChanges,
  type Changes,
  type Snapshot,
} from "./records";

/**
 * Keeping the on-device copy of the catalogue up to date, apart from React
 * and the network so the tests can drive it.
 *
 * On launch the cached copy shows at once; then only what changed since it
 * was saved is fetched. Once a week the whole catalogue is fetched again, so
 * a sermon taken off the channel leaves the app too. With no network and no
 * cached copy, the bundled sample stands in.
 */

/** Where the catalogue came from: the bundled sample, the device's copy, or Supabase just now. */
export type CatalogueSource = "sample" | "cache" | "remote";

export type Remote = {
  /** Every sermon and series. */
  fetchAll(): Promise<Changes>;
  /** Sermons and series changed after `since` (an updated_at). */
  fetchChanges(since: string): Promise<Changes>;
};

export type Store = {
  read(): Promise<string | null>;
  write(raw: string): Promise<void>;
};

export const FULL_SYNC_EVERY = 7 * 24 * 60 * 60 * 1000;

/** Brings a snapshot up to date and saves it. Throws when the network fails. */
export async function syncSnapshot(
  current: Snapshot | null,
  remote: Remote,
  store: Store,
  now: number,
): Promise<Snapshot> {
  let next: Snapshot;
  if (!current || !current.syncedAt || now - current.fullAt > FULL_SYNC_EVERY) {
    next = { ...(await remote.fetchAll()), fullAt: now };
    // A project without the catalogue loaded: no better than no network.
    if (!next.sermons.length) throw new Error("The sermon catalogue is empty");
  } else {
    const changes = await remote.fetchChanges(current.syncedAt);
    if (!changes.sermons.length && !changes.series.length) return current;
    next = mergeChanges(current, changes);
  }
  // A copy that can't be saved (storage full or blocked) still applies now.
  await store.write(encodeSnapshot(next)).catch(() => {});
  return next;
}

/**
 * Loads the catalogue: the cached copy first (reported straight away), then
 * the synced one. Reports the bundled sample when neither is available.
 * `current` is a copy already showing, for a later sync in the same session.
 * `onRead` is called once the device's copy has been read (or found missing),
 * before the network. Resolves with whether the sync reached Supabase.
 */
export async function loadCatalogue({
  remote,
  store,
  sample,
  now,
  report,
  current,
  onRead,
}: {
  remote: Remote;
  store: Store;
  sample: Snapshot;
  now: () => number;
  report: (snapshot: Snapshot, source: CatalogueSource) => void;
  current?: Snapshot | null;
  onRead?: () => void;
}): Promise<{ online: boolean }> {
  const cached = current ?? decodeSnapshot(await store.read().catch(() => null));
  if (cached && !current) report(cached, "cache");
  onRead?.();
  try {
    const fresh = await syncSnapshot(cached, remote, store, now());
    report(fresh, "remote");
    return { online: true };
  } catch {
    if (!cached) report(sample, "sample");
    return { online: false };
  }
}
