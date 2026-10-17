import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import { authMode, supabaseConfig } from "../auth/config";
import { sampleSnapshot, sampleTags, sermonsFrom, type Sermon, type TopicTags } from "../data/sermons";
import { reportFailure } from "../lib/monitoring";
import { keys, readJSON, writeJSON } from "../lib/storage";
import type { Snapshot } from "./records";
import { createRemote } from "./remote";
import { CatalogueError, loadCatalogue, type CatalogueSource, type Store } from "./sync";

/**
 * The full library from Supabase with every sermon's topics, kept on the
 * device and brought up to date at launch and when the app comes back after
 * a while. The on-device account mode (development and the automated tests)
 * and builds without a Supabase project use the four bundled sermons instead.
 */
export const catalogueMode: "remote" | "sample" =
  authMode !== "local" && supabaseConfig.url && supabaseConfig.key ? "remote" : "sample";

// Coming back to the app syncs again once the copy is this old.
const RESYNC_AFTER_MS = 30 * 60 * 1000;
// Sermons' topics are fetched again once the device's copy is this old
// (new sermons are tagged overnight, as they're imported).
const TAGS_STALE_MS = 6 * 60 * 60 * 1000;

export type Catalogue = {
  /** Every sermon with its topics, newest first. */
  sermons: Sermon[];
  find: (id?: string | null) => Sermon | undefined;
  /** A series' name, e.g. "Lioness Conference 2022". */
  seriesName: (key?: string | null) => string | undefined;
  source: CatalogueSource;
  /** False only for the moment at launch before the device's copy is read. */
  hydrated: boolean;
  /**
   * True once this launch's sync has finished or failed, so a sermon that
   * isn't found now really isn't in the library (or can't be reached).
   */
  settled: boolean;
  /** The last sync couldn't reach the library. */
  offline: boolean;
  /** Syncs again, after a failure. */
  retry: () => void;
};

const store: Store = {
  read: () => AsyncStorage.getItem(keys.catalogue),
  write: (raw) => AsyncStorage.setItem(keys.catalogue, raw),
};

type State = {
  snapshot: Snapshot;
  source: CatalogueSource;
  hydrated: boolean;
  settled: boolean;
  offline: boolean;
};

const initial: State =
  catalogueMode === "sample"
    ? { snapshot: sampleSnapshot, source: "sample", hydrated: true, settled: true, offline: false }
    : {
        snapshot: { sermons: [], series: [], syncedAt: null, fullAt: 0 },
        source: "sample",
        hydrated: false,
        settled: false,
        offline: false,
      };

const CatalogueContext = createContext<Catalogue | null>(null);

export function CatalogueProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<State>(initial);
  const syncing = useRef(false);
  const lastSync = useRef(0);
  const current = useRef<Snapshot | null>(null);

  // Every sermon's topics: the device's copy at once, then fetched again
  // when it's old. Offline, the copy stays; with none, sermons have none.
  const [tags, setTags] = useState<TopicTags>(() => (catalogueMode === "sample" ? sampleTags : {}));
  const tagsAt = useRef(0);
  const tagging = useRef(false);
  const refreshTags = useCallback(async () => {
    if (catalogueMode !== "remote" || tagging.current || Date.now() - tagsAt.current < TAGS_STALE_MS) return;
    tagging.current = true;
    try {
      const fresh = await createRemote(supabaseConfig).fetchTags();
      tagsAt.current = Date.now();
      // The same topics (most fetches) leave every sermon as it is.
      setTags((was) => (JSON.stringify(was) === JSON.stringify(fresh) ? was : fresh));
      writeJSON(keys.topicTags, { at: tagsAt.current, data: fresh });
    } catch {
      // Offline: tried again when the app comes back.
    } finally {
      tagging.current = false;
    }
  }, []);

  const sync = useCallback(async () => {
    if (catalogueMode !== "remote" || syncing.current) return;
    syncing.current = true;
    const { online, error } = await loadCatalogue({
      remote: createRemote(supabaseConfig),
      store,
      sample: sampleSnapshot,
      now: Date.now,
      // After the first load, the copy in memory is the newest.
      current: current.current,
      report: (snapshot, source) => {
        if (source !== "sample") current.current = snapshot;
        // A sync that found nothing new hands back the copy already
        // showing, which stays as it is (its source too): nothing re-renders.
        setState((was) => (was.snapshot === snapshot ? was : { ...was, snapshot, source }));
      },
      onRead: () => setState((was) => (was.hydrated ? was : { ...was, hydrated: true })),
    });
    syncing.current = false;
    if (online) lastSync.current = Date.now();
    // The server answered wrongly (not a phone that's offline): the owner
    // hears about it.
    if (error instanceof CatalogueError)
      reportFailure("catalogue_sync", { code: error.reason, status: error.status });
    setState((was) =>
      was.hydrated && was.settled && was.offline === !online
        ? was
        : { ...was, hydrated: true, settled: true, offline: !online },
    );
  }, []);

  useEffect(() => {
    if (catalogueMode !== "remote") return;
    sync();
    readJSON<{ at: number; data: TopicTags } | null>(keys.topicTags, null).then((cached) => {
      if (cached?.data) {
        tagsAt.current = cached.at;
        setTags(cached.data);
      }
      refreshTags();
    });
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (Date.now() - lastSync.current > RESYNC_AFTER_MS) sync();
      refreshTags();
    });
    return () => subscription.remove();
  }, [sync, refreshTags]);

  const sermons = useMemo(() => sermonsFrom(state.snapshot, tags), [state.snapshot, tags]);
  const byId = useMemo(() => new Map(sermons.map((s) => [s.id, s])), [sermons]);
  const names = useMemo(
    () => new Map(state.snapshot.series.map((s) => [s.key, s.name])),
    [state.snapshot],
  );

  // Change only with the library, so what's built from them (a path's days
  // with their sermons, say) isn't rebuilt when the sync settles.
  const find = useCallback((id?: string | null) => (id ? byId.get(id) : undefined), [byId]);
  const seriesName = useCallback(
    (key?: string | null) => (key ? names.get(key) : undefined),
    [names],
  );
  const retry = useCallback(() => {
    sync();
  }, [sync]);

  const value = useMemo<Catalogue>(
    () => ({
      sermons,
      find,
      seriesName,
      source: state.source,
      hydrated: state.hydrated,
      settled: state.settled,
      offline: state.offline,
      retry,
    }),
    [sermons, find, seriesName, state.source, state.hydrated, state.settled, state.offline, retry],
  );

  return <CatalogueContext.Provider value={value}>{children}</CatalogueContext.Provider>;
}

export function useCatalogue() {
  const value = useContext(CatalogueContext);
  if (!value) throw new Error("useCatalogue needs a CatalogueProvider");
  return value;
}
