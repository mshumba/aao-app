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
import { AppState, Platform } from "react-native";
import { useAccount } from "../auth/AccountProvider";
import { useGate } from "../auth/gate";
import { registerPathStarter } from "../auth/intent";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { readJSON, writeJSON } from "../lib/storage";
import { noteDayDone } from "../paths/seen";
import { NATIVE_VIDEO } from "../player/videoPlatform";
import { namedTopics } from "../topics";
import { CompleteDayContext } from "./completeDay";
import { fakeCard, fakeMoments, fixtureDays, fixtureNeeds, fixturePaths, fixtureTopics } from "./fixtures";
import {
  activePath,
  applyOp,
  emptyProgress,
  enrollmentOf,
  fromRemote,
  joinDays,
  nextDay,
  suggestPaths,
  type ProgressOp,
  type ProgressState,
} from "./progress";
import { createProgressSync, type ProgressSync } from "./progressSync";
import {
  deleteDayDone,
  deleteEnrollment,
  fetchCard,
  fetchMoments,
  fetchNeeds,
  fetchPaths,
  fetchProgress,
  fetchTopics,
  isPermanent,
  patchEnrollment,
  postDayDone,
  postEnrollment,
} from "./queries";
import { createSermonCache, type SermonCopies, type Stamped } from "./sermonCache";
import { accessTokenFor, learningMode } from "./session";
import type { Moment, Need, Path, PathDay, SermonCardData, Topic } from "./types";

/**
 * Needs, topics, paths, a sermon's moments and card, and the viewer's
 * progress through paths. Shown at
 * once from the device's copy (stale-while-revalidate), so screens render
 * instantly on later launches and offline, then brought up to date.
 *
 * - remote: Supabase tables (needs, topics, moments, sermon_cards, paths, path_days; the viewer's
 *   own path_enrollments and path_day_done when signed in).
 * - local (EXPO_PUBLIC_AUTH_MODE=local): the test data in fixtures.ts, with
 *   progress kept on the device per local user.
 *
 * Guests' progress stays on this device. Starting a path as a guest goes
 * through the sign-up gate first (useEnrollment), and starts once they have
 * an account.
 */

const KEYS = {
  needs: "aao.learning.needs.v1",
  topics: "aao.learning.topics.v1",
  // v2: paths carry their kind (guided path or teaching series).
  paths: "aao.learning.paths.v2",
  moments: "aao.learning.moments.v1",
  cards: "aao.learning.cards.v1",
  progress: (owner: string) => `aao.learning.progress.v1.${owner}`,
  recent: (owner: string) => `aao.learning.recent.v1.${owner}`,
};

/** Needs, topics and paths are fetched again when the app returns after this long. */
const STALE_MS = 30 * 60 * 1000;
/** Progress is re-read from the server when the app returns after this long. */
const PROGRESS_STALE_MS = 5 * 60 * 1000;
const RECENT_MAX = 5;

const local = learningMode === "local";
const EMPTY_MOMENTS: Moment[] = [];
const EMPTY_RECENT: string[] = [];
const EMPTY_DAYS: PathDay[] = [];

/**
 * The same data, compared as the device stores it, so an answer that
 * changes nothing (most launches) doesn't re-render what shows it.
 */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- Contexts ------------------------------------------------------------------

type NeedsValue = { needs: Need[]; loading: boolean };
type TopicsState = { topics: Topic[]; loading: boolean };
type TopicsValue = TopicsState & {
  /** Fetches them again (with needs and paths): Try again, after a failure. */
  refresh: () => void;
};
type PathsValue = {
  paths: Path[];
  days: PathDay[];
  daysByPath: Map<string, PathDay[]>;
  /** A path's days in order (without sermons); changes only with the days. */
  daysOf: (pathId: string) => PathDay[];
  loading: boolean;
  /** Nothing could be loaded (no copy on the device either). */
  error: boolean;
  refresh: () => void;
};
/** One kind of a sermon's data: what's showing for each sermon, and a way to load one. */
type SermonValue<T> = { byId: Record<string, T>; load: (youtubeId: string) => void };
type ProgressValue = {
  owner: string;
  state: ProgressState;
  loading: boolean;
  /** This viewer's progress is known (read from the device, or the server). */
  read: boolean;
  apply: (ops: ProgressOp[]) => void;
  complete: (pathId: string, day: number) => boolean;
};
type RecentValue = {
  recent: string[];
  add: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
};

const NeedsContext = createContext<NeedsValue | null>(null);
const TopicsContext = createContext<TopicsValue | null>(null);
const PathsContext = createContext<PathsValue | null>(null);
const MomentsContext = createContext<SermonValue<Moment[]> | null>(null);
const CardsContext = createContext<SermonValue<SermonCardData | null> | null>(null);
const ProgressContext = createContext<ProgressValue | null>(null);
const RecentContext = createContext<RecentValue | null>(null);

function need<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} needs LearningProvider (src/learning).`);
  return value;
}

function byPath(days: PathDay[]) {
  const map = new Map<string, PathDay[]>();
  days.forEach((d) => {
    const list = map.get(d.pathId) ?? [];
    list.push(d);
    map.set(d.pathId, list);
  });
  map.forEach((list) => list.sort((a, b) => a.day - b.day));
  return map;
}

/**
 * What shows of one kind of a sermon's data (its moments, its card), loaded
 * as its page opens and kept on the device (sermonCache.ts). With `key` null
 * it's kept in memory only (the local test data). `key`, `get` and `none`
 * stay the same for the provider's life.
 */
function useSermonData<T>(key: string | null, get: (youtubeId: string) => Promise<T>, none: T) {
  const [byId, setById] = useState<Record<string, T>>({});
  const [cache] = useState(() =>
    createSermonCache<T>({
      storage: key
        ? { read: () => readJSON<SermonCopies<T>>(key, {}), write: (copies) => writeJSON(key, copies) }
        : null,
      get,
      now: Date.now,
      none,
      // One update, with the device's copies not shown yet, and none when
      // nothing has changed.
      show: (youtubeId, pick, copies) =>
        setById((was) => {
          const add: Record<string, T> = {};
          Object.entries(copies).forEach(([id, data]) => {
            if (!(id in was)) add[id] = data;
          });
          const next = pick(was[youtubeId]);
          if (!same(was[youtubeId], next)) add[youtubeId] = next;
          return Object.keys(add).length ? { ...was, ...add } : was;
        }),
    }),
  );
  const load = useCallback((youtubeId: string) => void cache.load(youtubeId), [cache]);
  return useMemo<SermonValue<T>>(() => ({ byId, load }), [byId, load]);
}

async function send(token: string, op: ProgressOp) {
  switch (op.kind) {
    case "start":
      return postEnrollment(token, op.pathId, op.at);
    case "done":
      return postDayDone(token, op.pathId, op.day, op.at);
    case "undone":
      return deleteDayDone(token, op.pathId, op.day);
    case "finish":
      return patchEnrollment(token, op.pathId, op.at);
    case "leave":
      return deleteEnrollment(token, op.pathId);
  }
}

/** `read`: this owner's copy on the device has been read (so "not started" is known). */
type ProgressSlot = { owner: string; state: ProgressState; loading: boolean; read?: boolean };

export function LearningProvider({ children }: PropsWithChildren) {
  const account = useAccount();
  const owner = account.user?.id ?? "guest";
  const member = learningMode === "remote" && !!account.user;

  // ---- Needs, topics and paths ---------------------------------------------------

  const [needs, setNeeds] = useState<NeedsValue>(() =>
    local ? { needs: fixtureNeeds, loading: false } : { needs: [], loading: true },
  );
  const [topics, setTopics] = useState<TopicsState>(() =>
    local ? { topics: fixtureTopics, loading: false } : { topics: [], loading: true },
  );
  const noTopics = useRef(!topics.topics.length);
  useEffect(() => {
    noTopics.current = !topics.topics.length;
  }, [topics.topics]);
  const [pathData, setPathData] = useState(() =>
    local
      ? { paths: fixturePaths, days: fixtureDays, loading: false, error: false }
      : { paths: [] as Path[], days: [] as PathDay[], loading: true, error: false },
  );
  const lastFetch = useRef(0);

  // A guest's topics are kept on this device: once the topics are known,
  // replaced ids move onto the topics that replaced them (the old sample
  // topics' ids, say) and any others no longer offered are dropped, as the
  // server does for accounts (20261021000200_topics_interests.sql).
  // An account's are left as they are; screens show them the same way
  // (useMyTopics), and saving them in Account writes that.
  const { ready, user, interests, setInterests } = account;
  useEffect(() => {
    if (!ready || user || !topics.topics.length) return;
    const now = namedTopics(topics.topics, interests).map((topic) => topic.id);
    if (!same(now, interests)) setInterests(now).catch(() => {});
  }, [ready, user, interests, topics.topics, setInterests]);

  const revalidate = useCallback(async () => {
    if (local) return;
    lastFetch.current = Date.now();
    // With none to show (offline at first launch), Try again shows them
    // loading rather than offline.
    setTopics((was) => (was.topics.length || was.loading ? was : { ...was, loading: true }));
    // These resources are independent: show each as soon as it arrives.
    // Paths and their days still publish together as one consistent result.
    await Promise.all([
      fetchNeeds().then(
        (fresh) => {
          setNeeds((was) => (!was.loading && same(was.needs, fresh) ? was : { needs: fresh, loading: false }));
          writeJSON(KEYS.needs, { at: Date.now(), data: fresh } satisfies Stamped<Need[]>);
        },
        () => setNeeds((was) => (was.loading ? { ...was, loading: false } : was)),
      ),
      fetchTopics().then(
        (fresh) => {
          setTopics((was) => (!was.loading && same(was.topics, fresh) ? was : { topics: fresh, loading: false }));
          writeJSON(KEYS.topics, { at: Date.now(), data: fresh } satisfies Stamped<Topic[]>);
        },
        () => setTopics((was) => (was.loading ? { ...was, loading: false } : was)),
      ),
      fetchPaths().then(
        (fresh) => {
          setPathData((was) =>
            !was.loading && !was.error && same(was.paths, fresh.paths) && same(was.days, fresh.days)
              ? was
              : { ...fresh, loading: false, error: false },
          );
          writeJSON(KEYS.paths, { at: Date.now(), data: fresh });
        },
        () =>
          setPathData((was) => {
            const error = was.paths.length === 0;
            return !was.loading && was.error === error ? was : { ...was, loading: false, error };
          }),
      ),
    ]);
  }, []);

  useEffect(() => {
    if (local) return;
    let alive = true;
    Promise.all([
      readJSON<Stamped<Need[]> | null>(KEYS.needs, null),
      readJSON<Stamped<Topic[]> | null>(KEYS.topics, null),
      readJSON<Stamped<{ paths: Path[]; days: PathDay[] }> | null>(KEYS.paths, null),
    ]).then(([cachedNeeds, cachedTopics, cachedPaths]) => {
      if (!alive) return;
      if (cachedNeeds?.data?.length) setNeeds({ needs: cachedNeeds.data, loading: false });
      if (cachedTopics?.data?.length) setTopics({ topics: cachedTopics.data, loading: false });
      if (cachedPaths?.data?.paths?.length) {
        // Days kept from before teaching_start read as not known (from the beginning).
        const days = cachedPaths.data.days.map((d) => ({ ...d, teachingStart: d.teachingStart ?? null }));
        setPathData({ paths: cachedPaths.data.paths, days, loading: false, error: false });
      }
      revalidate();
    });
    // Fetched again when the app comes back after a while, and at once,
    // however recently it tried, while there are no topics to pick from (a
    // first launch offline), or when the connection returns on the web.
    const wake = () => {
      if (noTopics.current || Date.now() - lastFetch.current > STALE_MS) revalidate();
    };
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") wake();
    });
    const web = Platform.OS === "web" && typeof window !== "undefined" && !!window.addEventListener;
    if (web) window.addEventListener("online", wake);
    return () => {
      alive = false;
      subscription.remove();
      if (web) window.removeEventListener("online", wake);
    };
  }, [revalidate]);

  // Sermons' topics kept on the device from before a topic was renamed
  // (Comfort & Healing becoming Healing, say) would leave the new one
  // empty until the copy is old: fetched again at once instead, once for
  // each set of topics.
  const { all: library, refreshTags } = useCatalogue();
  const tagsCheckedFor = useRef("");
  useEffect(() => {
    if (local || topics.loading || !topics.topics.length) return;
    const ids = new Set(topics.topics.map((topic) => topic.id));
    const key = [...ids].join(" ");
    if (tagsCheckedFor.current === key) return;
    if (library.some((sermon) => sermon.topic && !ids.has(sermon.topic.id))) {
      tagsCheckedFor.current = key;
      refreshTags({ force: true });
    }
  }, [topics, library, refreshTags]);

  const topicsValue = useMemo<TopicsValue>(
    () => ({ ...topics, refresh: () => void revalidate() }),
    [topics, revalidate],
  );

  const daysByPath = useMemo(() => byPath(pathData.days), [pathData.days]);
  const daysOf = useCallback(
    (pathId: string) => daysByPath.get(pathId) ?? EMPTY_DAYS,
    [daysByPath],
  );
  const pathsValue = useMemo<PathsValue>(
    () => ({ ...pathData, daysByPath, daysOf, refresh: () => void revalidate() }),
    [pathData, daysByPath, daysOf, revalidate],
  );

  // ---- A sermon's moments and card --------------------------------------------------

  const momentsValue = useSermonData(local ? null : KEYS.moments, local ? fakeMoments : fetchMoments, EMPTY_MOMENTS);
  const cardsValue = useSermonData(local ? null : KEYS.cards, local ? fakeCard : fetchCard, null);

  // ---- Progress -----------------------------------------------------------------------

  const [progress, setProgress] = useState<ProgressSlot>({
    owner,
    state: emptyProgress,
    loading: true,
  });
  const current = useRef<ProgressSlot>(progress);
  const memberRef = useRef(member);
  const lastSync = useRef(0);
  const daysRef = useRef(daysByPath);

  useEffect(() => {
    memberRef.current = member;
  }, [member]);
  useEffect(() => {
    daysRef.current = daysByPath;
  }, [daysByPath]);

  const commit = useCallback((next: ProgressSlot) => {
    current.current = next;
    setProgress(next);
    writeJSON(KEYS.progress(next.owner), next.state);
  }, []);

  // Members' changes go to the server one run at a time, for the account on
  // the device now; failures retry with backoff (progressSync.ts). Made
  // before the effects below use it (effects run in order).
  const sync = useRef<ProgressSync | null>(null);
  useEffect(() => {
    const engine = createProgressSync(
      { token: accessTokenFor, send, fetch: fetchProgress, isPermanent },
      {
        owner: () => {
          const slot = current.current;
          return memberRef.current && slot.owner !== "guest" ? slot.owner : null;
        },
        pending: () => current.current.state.pending,
        settle: (forOwner, sent, remote) => {
          const slot = current.current;
          if (slot.owner !== forOwner) return;
          const remaining = slot.state.pending.filter((op) => !sent.has(op));
          if (remote) {
            commit({ owner: forOwner, state: fromRemote(remote, remaining), loading: false, read: true });
            lastSync.current = Date.now();
          } else commit({ ...slot, state: { ...slot.state, pending: remaining } });
        },
        // Offline, or the session is still being restored: show the
        // device's copy meanwhile.
        failed: (forOwner) => {
          const slot = current.current;
          if (slot.owner === forOwner && slot.loading) commit({ ...slot, loading: false });
        },
      },
    );
    sync.current = engine;
    return () => {
      engine.dispose();
      if (sync.current === engine) sync.current = null;
    };
  }, [commit]);

  const apply = useCallback(
    (ops: ProgressOp[]) => {
      if (!ops.length) return;
      const was = current.current;
      let state = was.state;
      ops.forEach((op) => {
        state = applyOp(state, op);
      });
      if (memberRef.current) state = { ...state, pending: [...was.state.pending, ...ops] };
      commit({ ...was, state });
      if (memberRef.current) sync.current?.request(was.owner);
    },
    [commit],
  );

  // A day is done when its sermon has been watched (the player calls this)
  // or the viewer says so: only the next day due on a path they're on, so
  // finishing a sermon never skips ahead or re-marks a day.
  const complete = useCallback(
    (pathId: string, day: number) => {
      const slot = current.current;
      if (!slot.read || !slot.state.enrollments[pathId]) return false;
      const total = daysRef.current.get(pathId)?.length ?? 0;
      const done = slot.state.done[pathId] ?? [];
      if (!total || nextDay(total, done) !== day) return false;
      const at = new Date().toISOString();
      const ops: ProgressOp[] = [{ kind: "done", pathId, day, at }];
      if (done.length + 1 >= total) ops.push({ kind: "finish", pathId, at });
      // So the path's page says "Day 3 done." even if it was never open here.
      void noteDayDone(slot.owner, pathId, done);
      apply(ops);
      return true;
    },
    [apply],
  );

  // A path a guest asked to start before creating this account: the
  // sign-up's intent starts it (registerPathStarter), once this account's
  // own progress has been read, so it lands in the right place.
  const readFor = useRef<string | null>(null);
  const queued = useRef<string | null>(null);
  const runQueued = useCallback(() => {
    const pathId = queued.current;
    const slot = current.current;
    if (!pathId || slot.owner === "guest" || readFor.current !== slot.owner) return;
    queued.current = null;
    if (slot.state.enrollments[pathId]) return;
    apply([{ kind: "start", pathId, at: new Date().toISOString() }]);
  }, [apply]);
  useEffect(() => {
    registerPathStarter((pathId) => {
      queued.current = pathId;
      runQueued();
    });
    return () => registerPathStarter(null);
  }, [runQueued]);

  useEffect(() => {
    let alive = true;
    // The previous account's sync (in flight or waiting to retry) ends
    // here; its late answer is never shown to this one.
    sync.current?.reset();
    // Until this account's copy is read, nothing of another account shows
    // (see `shown` below).
    current.current = { owner, state: emptyProgress, loading: true };
    readFor.current = null;
    readJSON<ProgressState>(KEYS.progress(owner), emptyProgress).then((cached) => {
      if (!alive || current.current.owner !== owner) return;
      commit({
        owner,
        state: { ...emptyProgress, ...cached, pending: member ? (cached.pending ?? []) : [] },
        loading: member,
        read: true,
      });
      readFor.current = owner;
      if (member) sync.current?.request(owner);
      runQueued();
    });
    return () => {
      alive = false;
    };
  }, [owner, member, commit, runQueued]);

  // Coming back to the app, or the connection returning (web), sends what's
  // waiting at once and reads again when the copy is old.
  useEffect(() => {
    if (!member) return;
    const wake = () => {
      if (current.current.state.pending.length || Date.now() - lastSync.current > PROGRESS_STALE_MS)
        sync.current?.wake();
    };
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") wake();
    });
    const web = Platform.OS === "web" && typeof window !== "undefined" && !!window.addEventListener;
    if (web) window.addEventListener("online", wake);
    return () => {
      subscription.remove();
      if (web) window.removeEventListener("online", wake);
    };
  }, [member]);

  // Right after signing in or out, the slot still holds the previous
  // owner's progress for a moment: show this owner's empty state instead.
  const shown = progress.owner === owner ? progress : null;
  const progressValue = useMemo<ProgressValue>(
    () => ({
      owner,
      state: shown?.state ?? emptyProgress,
      loading: shown?.loading ?? true,
      read: !!shown?.read,
      apply,
      complete,
    }),
    [owner, shown, apply, complete],
  );

  // ---- Recent searches ---------------------------------------------------------------

  const [recentSlot, setRecent] = useState<{ owner: string; list: string[] }>({ owner, list: [] });
  useEffect(() => {
    let alive = true;
    readJSON<string[]>(KEYS.recent(owner), []).then((list) => {
      if (alive) setRecent({ owner, list: Array.isArray(list) ? list.slice(0, RECENT_MAX) : [] });
    });
    return () => {
      alive = false;
    };
  }, [owner]);
  const recent = recentSlot.owner === owner ? recentSlot.list : EMPTY_RECENT;

  const recentValue = useMemo<RecentValue>(() => {
    const save = (update: (list: string[]) => string[]) =>
      setRecent((was) => {
        const next = update(was.owner === owner ? was.list : []).slice(0, RECENT_MAX);
        writeJSON(KEYS.recent(owner), next);
        return { owner, list: next };
      });
    const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
    return {
      recent,
      add: (query) => {
        const q = query.trim().replace(/\s+/g, " ");
        if (q) save((list) => [q, ...list.filter((x) => !same(x, q))]);
      },
      remove: (query) => save((list) => list.filter((x) => !same(x, query))),
      clear: () => save(() => []),
    };
  }, [recent, owner]);

  return (
    <NeedsContext.Provider value={needs}>
      <TopicsContext.Provider value={topicsValue}>
        <PathsContext.Provider value={pathsValue}>
          <MomentsContext.Provider value={momentsValue}>
            <CardsContext.Provider value={cardsValue}>
              <ProgressContext.Provider value={progressValue}>
                <CompleteDayContext.Provider value={complete}>
                  <RecentContext.Provider value={recentValue}>{children}</RecentContext.Provider>
                </CompleteDayContext.Provider>
              </ProgressContext.Provider>
            </CardsContext.Provider>
          </MomentsContext.Provider>
        </PathsContext.Provider>
      </TopicsContext.Provider>
    </NeedsContext.Provider>
  );
}

// ---- Hooks ---------------------------------------------------------------------------

/** Published needs in editorial order. Empty: hide the chips. */
export function useNeeds() {
  return need(useContext(NeedsContext), "useNeeds");
}

/** The topics people pick, in the order they're offered. Empty until loaded. */
export function useTopics() {
  return need(useContext(TopicsContext), "useTopics");
}

/**
 * The topics the viewer picked (in onboarding or Account), in the order
 * they're offered. A picked id that's been replaced counts as the topic
 * that replaced it (namedTopics), and any other that's no longer a topic
 * is left out: an account saved on an older build shows what it holds now.
 */
export function useMyTopics() {
  const { topics } = useTopics();
  const { interests } = useAccount();
  return useMemo(() => namedTopics(topics, interests), [topics, interests]);
}

/**
 * Up to three paths for the viewer's topics (see suggestPaths), once their
 * progress is known: until then none, so a path they're on never shows.
 * The phones list only sermons whose video is on R2 (CatalogueProvider), so
 * they suggest only paths whose sermons all are; the Paths tab still lists
 * every path.
 */
export function usePathSuggestions() {
  const mine = useMyTopics();
  const progress = need(useContext(ProgressContext), "usePathSuggestions");
  const { paths, daysByPath } = need(useContext(PathsContext), "usePathSuggestions");
  const { find } = useCatalogue();
  const { read, state } = progress;
  return useMemo(() => {
    if (!read) return [];
    const offered = (path: Path) =>
      !NATIVE_VIDEO || (daysByPath.get(path.id) ?? []).every((day) => !!find(day.youtubeId)?.videoReady);
    return suggestPaths(mine, paths, state, offered);
  }, [read, mine, paths, state, daysByPath, find]);
}

/**
 * Every path (drafts included, in editorial order). Use TrustLine for who set
 * the order: it shows only on a published path, never a "Draft" label.
 */
export function usePaths() {
  const value = need(useContext(PathsContext), "usePaths");
  return {
    paths: value.paths,
    loading: value.loading,
    error: value.error,
    refresh: value.refresh,
    /** A path's days in order (without sermons). */
    daysOf: value.daysOf,
  };
}

/**
 * One path and its days joined with their sermons from the catalogue (a
 * sermon is undefined while the catalogue syncs). `missing` once loading has
 * finished and no such path exists.
 */
export function usePath(id?: string | null) {
  const value = need(useContext(PathsContext), "usePath");
  const { find } = useCatalogue();
  const path = id ? value.paths.find((p) => p.id === id) : undefined;
  const raw = id ? value.daysByPath.get(id) : undefined;
  const days = useMemo(() => joinDays(raw ?? [], find), [raw, find]);
  return {
    path,
    days,
    loading: value.loading && !path,
    missing: !value.loading && !path,
    error: value.error,
  };
}

/**
 * A sermon's card (its summary, main points, scriptures and who it's for),
 * fetched as its page opens: null while it loads, and when it has none or
 * it couldn't be loaded.
 */
export function useSermonCard(youtubeId?: string | null) {
  const { byId, load } = need(useContext(CardsContext), "useSermonCard");
  useEffect(() => {
    if (youtubeId) load(youtubeId);
  }, [youtubeId, load]);
  return (youtubeId ? byId[youtubeId] : null) ?? null;
}

/** A sermon's verified moments in playing order; empty when it has none. */
export function useMoments(youtubeId?: string | null) {
  const value = need(useContext(MomentsContext), "useMoments");
  const { load } = value;
  useEffect(() => {
    if (youtubeId) load(youtubeId);
  }, [youtubeId, load]);
  const list = youtubeId ? value.byId[youtubeId] : undefined;
  return { moments: list ?? EMPTY_MOMENTS, loading: !!youtubeId && list === undefined };
}

/**
 * The path the viewer is on and today's day, without the gate (safe outside
 * screens). Use useEnrollment() in screens to start paths and mark days.
 * With `kind`, only paths of that kind count: "path" is the guided path
 * they're on, even with a teaching series started since (the daily
 * reminder, src/reminders).
 */
export function useActivePath(kind?: Path["kind"]) {
  const progress = need(useContext(ProgressContext), "useActivePath");
  const paths = need(useContext(PathsContext), "useActivePath");
  const { find } = useCatalogue();
  const active = useMemo(
    () =>
      activePath(
        progress.state,
        kind ? paths.paths.filter((p) => p.kind === kind) : paths.paths,
        paths.daysByPath,
        find,
      ),
    [progress.state, paths.paths, paths.daysByPath, find, kind],
  );
  return { active, loading: progress.loading || paths.loading };
}

/**
 * Progress through paths, for screens (it uses the sign-up gate, so call it
 * inside a screen). Members' progress lives in Supabase; guests' on this
 * device. `start` asks a guest to create a free account first (the gate's
 * "watch" intent for Day 1; after signing up Day 1 plays and the path
 * starts) and resolves "gated" then, or "started".
 */
export function useEnrollment() {
  const progress = need(useContext(ProgressContext), "useEnrollment");
  const paths = need(useContext(PathsContext), "useEnrollment");
  const { find } = useCatalogue();
  const account = useAccount();
  const gate = useGate();
  const { state, apply } = progress;
  const { daysByPath } = paths;

  const active = useMemo(
    () => activePath(state, paths.paths, daysByPath, find),
    [state, paths.paths, daysByPath, find],
  );

  const start = useCallback(
    async (pathId: string): Promise<"started" | "gated"> => {
      const at = new Date().toISOString();
      if (account.user || account.mode === "unavailable") {
        apply([{ kind: "start", pathId, at }]);
        return "started";
      }
      const first = daysByPath.get(pathId)?.[0];
      // A guest is asked for an account first; signing up then starts the
      // path and opens Day 1, whose sermon page starts it where the Apostle
      // starts preaching unless the account has a place in it.
      // Closing the sheet drops it, so nothing starts later.
      if (
        !first ||
        gate.require({
          kind: "watch",
          sermonId: first.youtubeId,
          path: { id: pathId, day: first.day },
        })
      ) {
        // Guests who may watch keep their progress on this device.
        apply([{ kind: "start", pathId, at }]);
        return "started";
      }
      return "gated";
    },
    [account.user, account.mode, apply, daysByPath, gate],
  );

  const markDone = useCallback(
    (pathId: string, day: number) => {
      const at = new Date().toISOString();
      const ops: ProgressOp[] = [{ kind: "done", pathId, day, at }];
      const total = daysByPath.get(pathId)?.length ?? 0;
      const done = new Set([...(state.done[pathId] ?? []), day]);
      if (total && done.size >= total) ops.push({ kind: "finish", pathId, at });
      apply(ops);
    },
    [apply, daysByPath, state.done],
  );

  const unmarkDone = useCallback(
    (pathId: string, day: number) => {
      const ops: ProgressOp[] = [{ kind: "undone", pathId, day }];
      if (state.enrollments[pathId]?.finishedAt) ops.push({ kind: "finish", pathId, at: null });
      apply(ops);
    },
    [apply, state.enrollments],
  );

  const leave = useCallback((pathId: string) => apply([{ kind: "leave", pathId }]), [apply]);
  const enrolled = useCallback((pathId: string) => !!state.enrollments[pathId], [state.enrollments]);
  const progressFor = useCallback((pathId: string) => enrollmentOf(state, pathId), [state]);

  return {
    active,
    enrolled,
    progressFor,
    start,
    markDone,
    unmarkDone,
    /**
     * Marks the next day due on a path the viewer is on as done ("Mark Day
     * 3 done"), as watching its sermon would; false when it isn't due.
     */
    complete: progress.complete,
    leave,
    loading: progress.loading || paths.loading,
    /** Progress is known for this viewer (it may still be syncing). */
    ready: progress.read,
  };
}

/** The viewer's last five searches on this device, newest first. */
export function useRecentSearches() {
  return need(useContext(RecentContext), "useRecentSearches");
}
