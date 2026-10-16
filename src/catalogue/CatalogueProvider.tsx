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
import { sampleSnapshot, sermonsFrom, type Sermon } from "../data/sermons";
import { keys } from "../lib/storage";
import type { Snapshot } from "./records";
import { createRemote } from "./remote";
import { loadCatalogue, type CatalogueSource, type Store } from "./sync";

/**
 * The full library from Supabase, kept on the device and brought up to date
 * at launch and when the app comes back after a while. The on-device
 * account mode (development and the automated tests) and builds without a
 * Supabase project use the four bundled sermons instead.
 */
export const catalogueMode: "remote" | "sample" =
  authMode !== "local" && supabaseConfig.url && supabaseConfig.key ? "remote" : "sample";

// Coming back to the app syncs again once the copy is this old.
const RESYNC_AFTER_MS = 30 * 60 * 1000;

export type Catalogue = {
  /** Every sermon, newest first. */
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

  const sync = useCallback(async () => {
    if (catalogueMode !== "remote" || syncing.current) return;
    syncing.current = true;
    const { online } = await loadCatalogue({
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
    setState((was) =>
      was.hydrated && was.settled && was.offline === !online
        ? was
        : { ...was, hydrated: true, settled: true, offline: !online },
    );
  }, []);

  useEffect(() => {
    if (catalogueMode !== "remote") return;
    sync();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && Date.now() - lastSync.current > RESYNC_AFTER_MS) sync();
    });
    return () => subscription.remove();
  }, [sync]);

  const sermons = useMemo(() => sermonsFrom(state.snapshot), [state.snapshot]);
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
