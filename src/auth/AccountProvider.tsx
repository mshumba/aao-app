import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import { CategoryId, categories } from "../data/categories";
import { reportFailure } from "../lib/monitoring";
import { keys, readJSON, removeKey, writeJSON } from "../lib/storage";
import { authMode, enabledMethods } from "./config";
import { createLocalBackend } from "./localBackend";
import { createSavedWrites } from "./savedWrites";
import { createSupabaseBackend } from "./supabaseBackend";
import {
  AuthBackend,
  AuthError,
  AuthResult,
  AuthUser,
  CodePurpose,
  GuestWatch,
  Profile,
  ProfileChanges,
  ProgressUpdate,
  WatchProgress,
} from "./types";
import { createWatchQueue, type WaitingSave, type WatchQueue } from "./watchQueue";

/** The account service is chosen once, at launch. */
function createBackend(): AuthBackend | null {
  if (authMode === "supabase") return createSupabaseBackend();
  if (authMode === "local") return createLocalBackend();
  return null;
}
const backend = createBackend();

function need(): AuthBackend {
  if (!backend) throw new AuthError("not_configured");
  return backend;
}

/** First-run state kept on the device, whether or not there's an account. */
type Onboarding = {
  /** Finished or skipped the welcome flow. */
  welcomed: boolean;
  /**
   * Topics chosen as a guest. They move into the first account that signs
   * in (or give way to its own), so they're empty while signed in.
   */
  interests: CategoryId[];
};

type Account = {
  /** Session restored and onboarding state loaded; safe to route. */
  ready: boolean;
  mode: typeof authMode;
  methods: typeof enabledMethods;
  user: AuthUser | null;
  /** The account's profile: null while it loads, and when loading failed. */
  profile: Profile | null;
  /**
   * The profile couldn't be loaded (not just empty). It's tried again
   * shortly, and when the viewer comes back to the app.
   */
  profileError: boolean;
  /** Fetches the profile again now. Never throws; a failure keeps profileError. */
  reloadProfile: () => Promise<void>;
  displayName: string | null;
  /**
   * The signed-in account's profile and saved list have been asked for and
   * have answered (or failed). Until then useSaved's list is empty, not known.
   */
  loaded: boolean;

  welcomed: boolean;
  /** The viewer's topics: the account's once signed in, else this device's. */
  interests: CategoryId[];
  setInterests: (ids: CategoryId[]) => Promise<void>;
  finishWelcome: () => Promise<void>;

  /** What guests may watch without an account (a remote setting). */
  guestWatch: GuestWatch;
  /** Sermons opened from a shared link, which guests may watch. */
  hasPass: (sermonId: string) => boolean;
  grantPass: (sermonId: string) => void;

  /**
   * The signed-in account was created just now, in this launch (by email,
   * Apple or Google), and Home hasn't welcomed it yet on this device.
   */
  justJoined: boolean;
  /** Home has welcomed the new account; never again for it on this device. */
  clearJustJoined: () => void;

  updateProfile: (changes: ProfileChanges) => Promise<void>;
  signUpWithPassword: (email: string, password: string, name?: string) => Promise<AuthResult>;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  sendEmailCode: (email: string) => Promise<AuthResult>;
  verifyCode: (email: string, code: string, purpose: CodePurpose) => Promise<AuthResult>;
  resendCode: (email: string, purpose: CodePurpose) => Promise<void>;
  signInWithApple: () => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  exchangeCode: (code: string) => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

/**
 * The account's saved sermons (useSaved). Apart from the account, so saving
 * re-renders only what shows saved sermons.
 */
type Saved = {
  saved: string[];
  /** The signed-in account's saved list failed to load (not just empty). */
  savedError: boolean;
  /** Fetches the saved list again. Never throws; a failure sets savedError. */
  reloadSaved: () => Promise<void>;
  /** Changes only with the saved list. */
  isSaved: (sermonId: string) => boolean;
  /** Requires a signed-in user. */
  setSaved: (sermonId: string, saved: boolean) => Promise<void>;
};

/** The account's watch progress (useWatchProgress). */
type Progress = {
  /** The account's watch progress, most recently watched first. Empty for guests. */
  progress: WatchProgress[];
  /** Changes only with the progress. */
  progressFor: (sermonId: string) => WatchProgress | null;
  /** The account's progress has loaded, so `progressFor` can be trusted. */
  progressReady: boolean;
  /**
   * The account's progress once it has loaded (at once if it has), or null
   * for a guest or when it can't be loaded. Tries again after a failure.
   */
  whenProgressReady: () => Promise<WatchProgress[] | null>;
  /**
   * Records where the viewer is in a sermon. Applies at once and is written
   * in the background; never throws or waits. Does nothing for guests, or
   * until the account's progress has loaded, so a new device can't overwrite
   * a place saved on another one.
   */
  saveProgress: (update: ProgressUpdate) => void;
};

/** The signed-in account's profile and saved list. */
type AccountData = {
  /** The account they belong to, so another account never shows them. */
  userId: string;
  /** Null when it couldn't be loaded; it's fetched again (profileError). */
  profile: Profile | null;
  /** What this device added to the profile (guest topics, Apple's name) isn't saved yet. */
  unsynced: boolean;
  saved: string[];
  savedError: boolean;
};

/** The name Apple gave for a new account, until its profile has it. */
type PendingName = { userId: string; name: string };

/** Accounts Home has already welcomed on this device (see justJoined). */
const WELCOMED_ACCOUNTS = "aao.welcomedAccounts.v1";

/**
 * Watch progress lives in this small store rather than in React state or the
 * account's context: it changes while a sermon plays (a save every 15
 * seconds), and only what shows that sermon's progress should re-render then
 * (useWatchProgress for the whole list, useProgressOf for some sermons).
 */
type ProgressData = { userId: string; items: WatchProgress[] } | null;

function createProgressStore() {
  let data: ProgressData = null;
  const listeners = new Set<() => void>();
  return {
    get: () => data,
    set(next: ProgressData) {
      data = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type ProgressSource = {
  store: ReturnType<typeof createProgressStore>;
  /** The signed-in account, whose progress the store's must be to show. */
  userId: string | null;
  whenProgressReady: Progress["whenProgressReady"];
  saveProgress: Progress["saveProgress"];
};

/** A position the service refused for good (it can't be stored): dropped rather than retried. */
function refusedForGood(error: unknown) {
  return error instanceof AuthError && (error.status === 400 || error.status === 409 || error.status === 422);
}

/**
 * Saving a position, or reading the account's list, failed with an answer
 * from the service (not offline): the owner hears about it, without
 * anything about the viewer (src/lib/failureReports.ts).
 */
function reportProgressFailure(error: unknown, step: "send" | "read") {
  if (error instanceof AuthError && error.status && error.status >= 400)
    reportFailure("progress_save", { status: error.status, step });
}

const NO_PROGRESS: WatchProgress[] = [];
const indexes = new WeakMap<WatchProgress[], Map<string, WatchProgress>>();

/** The account's progress, by sermon; built once for each change. */
function progressIndex(data: ProgressData, userId: string | null) {
  const items = data && data.userId === userId ? data.items : NO_PROGRESS;
  let index = indexes.get(items);
  if (!index) indexes.set(items, (index = new Map(items.map((item) => [item.sermonId, item]))));
  return { items, index };
}

const AccountContext = createContext<Account | null>(null);
const SavedContext = createContext<Saved | null>(null);
const ProgressContext = createContext<ProgressSource | null>(null);

const validTopic = (id: string): id is CategoryId =>
  categories.some((category) => category.id === id);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [restored, setRestored] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<AccountData | null>(null);
  // Watch progress, kept apart from the profile because it changes while
  // a sermon plays (see createProgressStore).
  const [progressStore] = useState(createProgressStore);
  // The signed-in account's progress: `items` once known (the server's
  // list, or this device's copy of it until that's read), and the loads
  // waiting for it (whenProgressReady).
  const progressLoad = useRef<{
    userId: string;
    items?: WatchProgress[];
    waiters: ((items: WatchProgress[] | null) => void)[];
  } | null>(null);
  /**
   * `userId`'s entry, made when first needed: by the effect below, or by a
   * load that asks first (the player's effects run before this provider's,
   * so it can ask for an account that has only just signed in).
   */
  const progressEntry = useCallback((userId: string) => {
    if (progressLoad.current?.userId !== userId) {
      // Loads waiting for the previous account get no list.
      progressLoad.current?.waiters.splice(0).forEach((done) => done(null));
      progressLoad.current = { userId, waiters: [] };
    }
    return progressLoad.current;
  }, []);
  /** Shows `userId`'s progress, keeps a copy on the device and answers the loads waiting for it. */
  const showProgress = useCallback(
    (userId: string, items: WatchProgress[]) => {
      const entry = progressLoad.current;
      // A slow answer for an account that has since signed out must not
      // replace what the account signed in now is showing.
      if (entry?.userId !== userId) return;
      entry.items = items;
      progressStore.set({ userId, items });
      writeJSON(keys.watchProgress(userId), items.slice(0, 100));
      entry.waiters.splice(0).forEach((done) => done(items));
    },
    [progressStore],
  );
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [passes, setPasses] = useState<string[]>([]);
  const [guestWatch, setGuestWatch] = useState<GuestWatch>("shared");
  // Read by callbacks that must see the latest value without re-creating.
  const onboardingRef = useRef<Onboarding | null>(null);
  useEffect(() => {
    onboardingRef.current = onboarding;
  }, [onboarding]);
  // Apple's name for a new account, kept (on the device too) until saved.
  const pendingName = useRef<PendingName | null>(null);
  // An Apple sign-in still finishing. The profile read waits for it, so the
  // name it brings is part of that read rather than racing it.
  const appleSignIn = useRef<Promise<unknown> | null>(null);
  // Saves and unsaves, written one at a time for each sermon whichever
  // screen they came from, and laid over saved list reads until those have
  // them (see createSavedWrites).
  const [savedWrites] = useState(() =>
    createSavedWrites({
      write: (id, sermonId, on) => need().setSaved(id, sermonId, on),
      // Shown in that account's loaded list only, never another's.
      show: (id, sermonId, on) =>
        setData((current) => {
          if (!current || current.userId !== id) return current;
          const rest = current.saved.filter((saved) => saved !== sermonId);
          return { ...current, saved: on ? [sermonId, ...rest] : rest };
        }),
    }),
  );
  // A sign-in or sign-up was started in this launch, so an account that
  // arrives now was signed into here rather than restored from storage.
  const signingIn = useRef(false);
  // The account created in this launch, until Home has welcomed it.
  const [joined, setJoined] = useState<string | null>(null);

  // Restore the session and this device's onboarding state together, so
  // the first route decision sees both.
  useEffect(() => {
    let active = true;
    Promise.all([
      backend?.restore().catch(() => null) ?? Promise.resolve(null),
      readJSON<Onboarding>(keys.onboarding, { welcomed: false, interests: [] }),
      readJSON<string[]>(keys.sharedPasses, []),
      readJSON<PendingName | null>(keys.pendingName, null),
    ]).then(([restoredUser, stored, storedPasses, storedName]) => {
      if (!active) return;
      setOnboarding({
        welcomed: !!stored.welcomed,
        interests: (stored.interests ?? []).filter(validTopic),
      });
      setPasses(Array.isArray(storedPasses) ? storedPasses : []);
      if (storedName?.userId && storedName.name) pendingName.current = storedName;
      setUser(restoredUser);
      setRestored(true);
    });
    // The last known guest-watch setting applies at once; a fresh value
    // follows from the service (and is kept for offline launches).
    readJSON<GuestWatch | null>(keys.guestWatch, null).then((cached) => {
      if (active && cached) setGuestWatch(cached);
    });
    backend
      ?.getGuestWatch()
      .then((remote) => {
        if (!active || !remote) return;
        setGuestWatch(remote);
        writeJSON(keys.guestWatch, remote);
      })
      .catch(() => {});
    const unsubscribe = backend?.subscribe((next) => {
      if (active) setUser(next);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const persistOnboarding = useCallback((next: Onboarding) => {
    onboardingRef.current = next;
    setOnboarding(next);
    writeJSON(keys.onboarding, next);
  }, []);

  const holdName = useCallback((next: PendingName | null) => {
    pendingName.current = next;
    if (next) writeJSON(keys.pendingName, next);
    else removeKey(keys.pendingName);
  }, []);

  /**
   * Reads the account's profile and adds what this device holds for it:
   * topics picked as a guest (moved into an account that has none) and the
   * name Apple gave at sign-in. Null when the read fails, so a failure is
   * never taken for an empty profile and written over the real one.
   */
  const fetchProfile = useCallback(
    async (userId: string, welcomed: boolean) => {
      if (!backend) return null;
      let loaded: Profile;
      try {
        loaded = await backend.getProfile(userId);
      } catch {
        return null;
      }
      // Never through onboarding on any device, and signed into just now: an
      // account the sign-in created (Apple, Google and email codes sign in
      // and sign up alike). A returning one finished onboarding long ago.
      if (!loaded.onboardedAt && signingIn.current)
        readJSON<string[]>(WELCOMED_ACCOUNTS, []).then((welcomed) => {
          if (!welcomed.includes(userId)) setJoined(userId);
        });
      const local = onboardingRef.current;
      const name =
        pendingName.current?.userId === userId ? pendingName.current.name : null;
      // The account already has a name of its own; Apple's isn't needed.
      if (name && loaded.displayName) holdName(null);
      const changes: ProfileChanges = {};
      if (!loaded.interests.length && local?.interests.length)
        changes.interests = local.interests;
      if (!loaded.onboardedAt && welcomed) changes.onboardedAt = new Date().toISOString();
      if (name && !loaded.displayName) changes.displayName = name;
      let synced = true;
      if (Object.keys(changes).length)
        synced = await backend.updateProfile(userId, changes).then(
          () => true,
          () => false,
        );
      if (synced) {
        if (changes.displayName) holdName(null);
        // While signed in, topics live with the account: the guest's moved
        // into it, or it had its own. Either way they're no longer the
        // device's, so they can't fill some later account or outlive
        // signing out.
        const now = onboardingRef.current;
        if (now?.interests.length) persistOnboarding({ ...now, interests: [] });
      }
      const profile = { ...loaded, ...changes };
      return {
        profile: { ...profile, interests: profile.interests.filter(validTopic) },
        synced,
      };
    },
    [holdName, persistOnboarding],
  );

  /** The saved list with recent saves laid over it; null when it fails. */
  const fetchSaved = useCallback(
    async (userId: string) => {
      if (!backend) return null;
      return savedWrites.read(userId, () => backend.listSaved(userId)).catch(() => null);
    },
    [savedWrites],
  );

  // Load the account's profile and saved list.
  const userId = user?.id ?? null;
  // Writes still queued for an account that has signed out aren't sent.
  useEffect(() => {
    savedWrites.signedIn(userId);
  }, [savedWrites, userId]);
  useEffect(() => {
    if (!userId || !backend) return;
    let active = true;
    (async () => {
      await appleSignIn.current;
      const welcomed = !!onboardingRef.current?.welcomed;
      const [loaded, list] = await Promise.all([
        fetchProfile(userId, welcomed),
        // A failure is kept apart from an empty list, so Saved can offer a retry.
        fetchSaved(userId),
      ]);
      if (!active) return;
      // Anyone who has signed in on this device has seen the app; signing
      // out later shouldn't bring the welcome back.
      const local = onboardingRef.current;
      if (local && !local.welcomed) persistOnboarding({ ...local, welcomed: true });
      setData({
        userId,
        profile: loaded?.profile ?? null,
        unsynced: !!loaded && !loaded.synced,
        saved: list ?? [],
        savedError: !list,
      });
    })();
    return () => {
      active = false;
    };
  }, [userId, fetchProfile, fetchSaved, persistOnboarding]);

  const mine = data && data.userId === userId ? data : null;
  const profile = mine?.profile ?? null;
  const profileError = !!mine && !mine.profile;
  const needsSync = !!mine && (!mine.profile || mine.unsynced);
  const saved = useMemo(() => mine?.saved ?? [], [mine]);
  const savedError = !!mine?.savedError;

  // Watch positions go to the server one at a time, the latest for each
  // sermon only, and wait on the device until they're there, retrying with
  // backoff (watchQueue.ts). Made before the effects below use it (effects
  // run in order).
  const watchQueue = useRef<WatchQueue | null>(null);
  useEffect(() => {
    const queue = createWatchQueue(
      {
        send: (id, update) => need().saveProgress(id, update),
        read: (id) => need().listProgress(id),
        isPermanent: refusedForGood,
      },
      {
        load: (id) => readJSON<WaitingSave[]>(keys.watchQueue(id), []),
        save: (id, waiting) =>
          waiting.length ? writeJSON(keys.watchQueue(id), waiting) : removeKey(keys.watchQueue(id)),
      },
      {
        read: (id, items) => showProgress(id, items),
        // Nothing to show yet, and the server can't be read: loads waiting
        // for the list get none (they ask again later).
        unread: (id, error) => {
          const entry = progressLoad.current;
          if (entry?.userId === id && !entry.items) entry.waiters.splice(0).forEach((done) => done(null));
          reportProgressFailure(error, "read");
        },
        failed: (_id, error) => reportProgressFailure(error, "send"),
      },
    );
    watchQueue.current = queue;
    return () => {
      queue.dispose();
      if (watchQueue.current === queue) watchQueue.current = null;
    };
  }, [showProgress]);

  // A new account: its list as this device last showed it, at once (an
  // offline launch shows it too), then the server's. Positions still
  // waiting from an earlier launch are laid over both, and sent once the
  // server's list says they're still the newest.
  useEffect(() => {
    if (userId) progressEntry(userId);
    else {
      progressLoad.current?.waiters.splice(0).forEach((done) => done(null));
      progressLoad.current = null;
    }
    const queue = watchQueue.current;
    if (!queue) return;
    const ready = queue.use(userId);
    if (!userId) return;
    let active = true;
    Promise.all([ready, readJSON<WatchProgress[] | null>(keys.watchProgress(userId), null)]).then(
      ([, cached]) => {
        if (!active) return;
        if (Array.isArray(cached) && !progressLoad.current?.items)
          showProgress(userId, queue.overlay(cached));
        queue.wake();
      },
    );
    return () => {
      active = false;
    };
  }, [userId, progressEntry, showProgress]);

  // Coming back to the app, or the connection returning (web), sends what's
  // waiting at once, or reads the list if it couldn't be read yet.
  useEffect(() => {
    if (!userId) return;
    const wake = () => watchQueue.current?.wake();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") wake();
    });
    const web = Platform.OS === "web" && typeof window !== "undefined";
    if (web) window.addEventListener("online", wake);
    return () => {
      subscription.remove();
      if (web) window.removeEventListener("online", wake);
    };
  }, [userId]);

  const whenProgressReady = useCallback(async () => {
    if (!userId) return null;
    const entry = progressEntry(userId);
    if (entry.items) return entry.items;
    // Not known yet: wait for the server's answer (null if it can't be
    // read), asking again now.
    return new Promise<WatchProgress[] | null>((resolve) => {
      entry.waiters.push(resolve);
      watchQueue.current?.wake();
    });
  }, [progressEntry, userId]);

  const saveProgress = useCallback(
    (update: ProgressUpdate) => {
      const entry = progressLoad.current;
      if (!userId || !backend || entry?.userId !== userId || !entry.items) return;
      const item: WatchProgress = { ...update, updatedAt: new Date().toISOString() };
      showProgress(userId, [item, ...entry.items.filter((p) => p.sermonId !== update.sermonId)]);
      watchQueue.current?.add(userId, update, item.updatedAt);
    },
    [showProgress, userId],
  );

  /** Reads the profile again; true once it has loaded and is saved. */
  const refreshProfile = useCallback(
    async (id: string) => {
      const loaded = await fetchProfile(id, !!onboardingRef.current?.welcomed);
      if (!loaded) return false;
      setData((current) =>
        current && current.userId === id
          ? { ...current, profile: loaded.profile, unsynced: !loaded.synced }
          : current,
      );
      return loaded.synced;
    },
    [fetchProfile],
  );

  // A profile that didn't load (or the device's additions that didn't
  // save) is tried again: a few times shortly after, then whenever the
  // viewer comes back to the app or the connection returns.
  useEffect(() => {
    if (!userId || !needsSync) return;
    let active = true;
    let running = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      if (running) return;
      running = true;
      clearTimeout(timer);
      const done = await refreshProfile(userId);
      running = false;
      if (!active || done) return;
      tries += 1;
      if (tries < 5) timer = setTimeout(attempt, 2000 * 2 ** tries);
    };
    timer = setTimeout(attempt, 2000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") attempt();
    });
    const web = Platform.OS === "web" && typeof window !== "undefined";
    if (web) window.addEventListener("online", attempt);
    return () => {
      active = false;
      clearTimeout(timer);
      appState.remove();
      if (web) window.removeEventListener("online", attempt);
    };
  }, [userId, needsSync, refreshProfile]);

  const reloadProfile = useCallback(async () => {
    if (userId) await refreshProfile(userId);
  }, [refreshProfile, userId]);

  /** Changes this account's loaded data in place; nothing before it loads. */
  const change = useCallback(
    (update: (current: AccountData) => AccountData) =>
      setData((current) =>
        current && current.userId === userId ? update(current) : current,
      ),
    [userId],
  );

  const updateProfile = useCallback(
    async (changes: ProfileChanges) => {
      if (!userId) throw new AuthError("invalid_credentials", "Not signed in");
      // Optimistic, rolled back if the service refuses.
      const before = profile;
      if (before)
        change((d) => (d.profile ? { ...d, profile: { ...d.profile, ...changes } } : d));
      try {
        await need().updateProfile(userId, changes);
      } catch (error) {
        if (before) change((d) => ({ ...d, profile: before }));
        throw error;
      }
      // Saved, with no loaded profile to show it in: read the whole one.
      if (!before) refreshProfile(userId);
    },
    [change, profile, refreshProfile, userId],
  );

  const setInterests = useCallback(
    async (ids: CategoryId[]) => {
      const clean = ids.filter(validTopic);
      // Signed in, they're kept with the account only, so an account's
      // topics never stay on the device after signing out.
      if (userId && backend) return updateProfile({ interests: clean });
      persistOnboarding({
        welcomed: onboardingRef.current?.welcomed ?? false,
        interests: clean,
      });
    },
    [persistOnboarding, updateProfile, userId],
  );

  const finishWelcome = useCallback(async () => {
    persistOnboarding({
      welcomed: true,
      interests: onboardingRef.current?.interests ?? [],
    });
    if (userId && backend && !profile?.onboardedAt) {
      const onboardedAt = new Date().toISOString();
      change((d) => (d.profile ? { ...d, profile: { ...d.profile, onboardedAt } } : d));
      await backend.updateProfile(userId, { onboardedAt }).catch(() => {});
    }
  }, [change, persistOnboarding, userId, profile?.onboardedAt]);

  const setSaved = useCallback(
    async (sermonId: string, value: boolean) => {
      if (!userId) throw new AuthError("invalid_credentials", "Not signed in");
      // Optimistic, and written after any save or unsave of this sermon
      // still on its way (from this screen or another), so the service ends
      // with the latest; rolled back if the service refuses it.
      await savedWrites.set(userId, sermonId, value, saved.includes(sermonId));
    },
    [saved, savedWrites, userId],
  );

  const reloadSaved = useCallback(async () => {
    if (!userId) return;
    const list = await fetchSaved(userId);
    change((d) =>
      list ? { ...d, saved: list, savedError: false } : { ...d, savedError: true },
    );
  }, [change, fetchSaved, userId]);

  const grantPass = useCallback((sermonId: string) => {
    setPasses((current) => {
      if (current.includes(sermonId)) return current;
      const next = [sermonId, ...current].slice(0, 50);
      writeJSON(keys.sharedPasses, next);
      return next;
    });
  }, []);

  const clearJustJoined = useCallback(() => {
    if (!joined) return;
    setJoined(null);
    readJSON<string[]>(WELCOMED_ACCOUNTS, []).then((welcomed) =>
      writeJSON(WELCOMED_ACCOUNTS, [joined, ...welcomed.filter((id) => id !== joined)].slice(0, 20)),
    );
  }, [joined]);

  /** Starts a sign-in or sign-up (see signingIn). */
  const signingInWith = useCallback(<T,>(run: () => Promise<T>) => {
    signingIn.current = true;
    return run();
  }, []);

  const signInWithApple = useCallback(() => {
    signingIn.current = true;
    const attempt = (async () => {
      const result = await need().signInWithApple();
      if (result.status === "signedIn" && result.name) {
        // Kept for the account that just signed in, until its profile has it.
        const signedIn = await need().restore().catch(() => null);
        if (signedIn) holdName({ userId: signedIn.id, name: result.name });
      }
      return result;
    })();
    appleSignIn.current = attempt.catch(() => {});
    return attempt;
  }, [holdName]);

  const loaded = !!mine;
  const value = useMemo<Account>(() => {
    // Signed in, the account's topics once its profile has loaded; until
    // then, and for guests, this device's.
    const interests = profile ? profile.interests : (onboarding?.interests ?? []);
    return {
      ready: restored && !!onboarding,
      mode: authMode,
      methods: enabledMethods,
      user,
      profile,
      profileError,
      reloadProfile,
      displayName: profile?.displayName ?? null,
      loaded,
      welcomed: !!onboarding?.welcomed || !!profile?.onboardedAt,
      interests,
      setInterests,
      finishWelcome,
      guestWatch,
      hasPass: (id) => passes.includes(id),
      grantPass,
      justJoined: !!user && joined === user.id,
      clearJustJoined,
      updateProfile,
      signUpWithPassword: (email, password, name) =>
        signingInWith(() =>
          need().signUpWithPassword(email.trim(), password, name?.trim() || undefined),
        ),
      signInWithPassword: (email, password) =>
        signingInWith(() => need().signInWithPassword(email.trim(), password)),
      sendEmailCode: (email) => need().sendEmailCode(email.trim()),
      verifyCode: (email, code, purpose) =>
        signingInWith(() => need().verifyCode(email.trim(), code.trim(), purpose)),
      resendCode: (email, purpose) => need().resendCode(email.trim(), purpose),
      signInWithApple,
      signInWithGoogle: () => signingInWith(() => need().signInWithGoogle()),
      exchangeCode: (code) => signingInWith(() => need().exchangeCode(code)),
      sendPasswordReset: (email) => need().sendPasswordReset(email.trim()),
      updatePassword: (password) => need().updatePassword(password),
      signOut: async () => {
        await need().signOut();
        // Nothing of the account stays on the device.
        holdName(null);
      },
      deleteAccount: async () => {
        const id = user?.id;
        await need().deleteAccount();
        holdName(null);
        // Its watch progress, and positions not yet sent, went with it.
        if (id) {
          removeKey(keys.watchProgress(id));
          removeKey(keys.watchQueue(id));
        }
        // Topics chosen on this device were part of the account; forget them.
        persistOnboarding({ welcomed: true, interests: [] });
      },
    };
  }, [
    restored,
    onboarding,
    user,
    profile,
    profileError,
    reloadProfile,
    loaded,
    passes,
    guestWatch,
    joined,
    clearJustJoined,
    signingInWith,
    setInterests,
    finishWelcome,
    grantPass,
    updateProfile,
    signInWithApple,
    holdName,
    persistOnboarding,
  ]);

  const savedValue = useMemo<Saved>(() => {
    const ids = new Set(saved);
    return {
      saved,
      savedError,
      reloadSaved,
      isSaved: (id) => ids.has(id),
      setSaved,
    };
  }, [saved, savedError, reloadSaved, setSaved]);

  const progressValue = useMemo<ProgressSource>(
    () => ({ store: progressStore, userId, whenProgressReady, saveProgress }),
    [progressStore, userId, whenProgressReady, saveProgress],
  );

  return (
    <AccountContext.Provider value={value}>
      <SavedContext.Provider value={savedValue}>
        <ProgressContext.Provider value={progressValue}>{children}</ProgressContext.Provider>
      </SavedContext.Provider>
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider.");
  return value;
}

/** The account's saved sermons; empty for guests. */
export function useSaved() {
  const value = useContext(SavedContext);
  if (!value) throw new Error("useSaved must be used inside AccountProvider.");
  return value;
}

function useProgressSource() {
  const value = useContext(ProgressContext);
  if (!value) throw new Error("Watch progress must be read inside AccountProvider.");
  return value;
}

/**
 * The account's watch progress; empty for guests. The caller re-renders with
 * every save (every 15 seconds while a sermon plays), so a screen that shows
 * only some sermons' progress uses useProgressOf.
 */
export function useWatchProgress(): Progress {
  const { store, userId, whenProgressReady, saveProgress } = useProgressSource();
  const data = useSyncExternalStore(store.subscribe, store.get, store.get);
  return useMemo(() => {
    const { items, index } = progressIndex(data, userId);
    return {
      progress: items,
      progressFor: (id) => index.get(id) ?? null,
      progressReady: !!userId && data?.userId === userId,
      whenProgressReady,
      saveProgress,
    };
  }, [data, userId, whenProgressReady, saveProgress]);
}

/**
 * progressFor for these sermons only (a path's days, the hero's sermons): it
 * changes, and the caller re-renders, only when one of theirs does, not with
 * every save while another sermon plays. Ask it about these sermons only.
 */
export function useProgressOf(sermonIds: readonly string[]) {
  const { store, userId } = useProgressSource();
  const stamp = () => {
    const { index } = progressIndex(store.get(), userId);
    return sermonIds.map((id) => index.get(id)?.updatedAt ?? "").join(" ");
  };
  const key = useSyncExternalStore(store.subscribe, stamp, stamp);
  return useCallback(
    (sermonId: string) => progressIndex(store.get(), userId).index.get(sermonId) ?? null,
    // The key stands for these sermons' progress: a new one, a new answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, userId, key],
  );
}
