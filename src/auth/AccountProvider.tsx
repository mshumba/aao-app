import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import { CategoryId, categories } from "../data/categories";
import { keys, readJSON, removeKey, writeJSON } from "../lib/storage";
import { authMode, enabledMethods } from "./config";
import { createLocalBackend } from "./localBackend";
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
   * have answered (or failed). Until then `saved` is empty, not known.
   */
  loaded: boolean;

  welcomed: boolean;
  /** The viewer's topics: the account's once signed in, else this device's. */
  interests: CategoryId[];
  setInterests: (ids: CategoryId[]) => Promise<void>;
  finishWelcome: () => Promise<void>;

  saved: string[];
  /** The signed-in account's saved list failed to load (not just empty). */
  savedError: boolean;
  /** Fetches the saved list again. Never throws; a failure sets savedError. */
  reloadSaved: () => Promise<void>;
  isSaved: (sermonId: string) => boolean;
  /** Requires a signed-in user. */
  setSaved: (sermonId: string, saved: boolean) => Promise<void>;

  /** The account's watch progress, most recently watched first. Empty for guests. */
  progress: WatchProgress[];
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

/** A save or unsave, and when it reached the service (an edit sequence number). */
type SavedEdit = { saved: boolean; settled: number | null };

/** The name Apple gave for a new account, until its profile has it. */
type PendingName = { userId: string; name: string };

/** Accounts Home has already welcomed on this device (see justJoined). */
const WELCOMED_ACCOUNTS = "aao.welcomedAccounts.v1";

const AccountContext = createContext<Account | null>(null);

const validTopic = (id: string): id is CategoryId =>
  categories.some((category) => category.id === id);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [restored, setRestored] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<AccountData | null>(null);
  // Watch progress, kept apart from the profile because it changes while
  // a sermon plays.
  const [progressData, setProgressData] = useState<{
    userId: string;
    items: WatchProgress[];
  } | null>(null);
  // The latest load of an account's progress; `items` is set once it succeeds.
  const progressLoad = useRef<{
    userId: string;
    promise: Promise<WatchProgress[] | null>;
    items?: WatchProgress[];
  } | null>(null);
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
  // Saves and unsaves, laid over every saved list read until one read after
  // they reached the service: an older read would otherwise undo them.
  const savedEdits = useRef(new Map<string, SavedEdit>());
  const editSeq = useRef(0);
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
  const fetchSaved = useCallback(async (userId: string) => {
    if (!backend) return null;
    const since = editSeq.current;
    let list: string[];
    try {
      list = await backend.listSaved(userId);
    } catch {
      return null;
    }
    savedEdits.current.forEach((edit, sermonId) => {
      // It reached the service before this read began, so the list has it.
      if (edit.settled !== null && edit.settled <= since) {
        savedEdits.current.delete(sermonId);
        return;
      }
      const rest = list.filter((id) => id !== sermonId);
      list = edit.saved ? [sermonId, ...rest] : rest;
    });
    return list;
  }, []);

  // Load the account's profile and saved list.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId || !backend) return;
    let active = true;
    // Another account's saves don't carry over.
    savedEdits.current.clear();
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

  const progress = useMemo(
    () => (progressData && progressData.userId === userId ? progressData.items : []),
    [progressData, userId],
  );
  const loadProgress = useCallback((id: string) => {
    if (!backend) return Promise.resolve(null);
    const entry: NonNullable<typeof progressLoad.current> = {
      userId: id,
      promise: backend.listProgress(id).then(
        (items) => {
          entry.items = items;
          setProgressData({ userId: id, items });
          return items;
        },
        // Kept unloaded: nothing is saved over what can't be seen.
        () => null,
      ),
    };
    progressLoad.current = entry;
    return entry.promise;
  }, []);
  useEffect(() => {
    if (userId) loadProgress(userId);
  }, [userId, loadProgress]);
  const progressReady =
    !!userId && !!progressData && progressData.userId === userId;

  const whenProgressReady = useCallback(async () => {
    if (!userId) return null;
    const entry = progressLoad.current;
    if (entry?.userId === userId) {
      const items = entry.items ?? (await entry.promise);
      if (items) return items;
    }
    // Not asked for this account yet, or the last try failed: try again.
    return loadProgress(userId);
  }, [loadProgress, userId]);

  // Writes go out one at a time, and only the latest position for each
  // sermon is sent, so a burst of saves (pause, dock, close) is one request
  // and an older position can never land after a newer one.
  const outbox = useRef({
    pending: new Map<string, { userId: string; update: ProgressUpdate }>(),
    busy: false,
  });
  const flushProgress = useCallback(async () => {
    const box = outbox.current;
    if (box.busy || !backend) return;
    box.busy = true;
    while (box.pending.size) {
      const [key, job] = box.pending.entries().next().value!;
      box.pending.delete(key);
      // A failed save is dropped; the next one carries a newer position.
      await backend.saveProgress(job.userId, job.update).catch(() => {});
    }
    box.busy = false;
  }, []);

  const saveProgress = useCallback(
    (update: ProgressUpdate) => {
      if (!userId || !backend) return;
      const loaded = progressLoad.current;
      if (loaded?.userId !== userId || !loaded.items) return;
      const item: WatchProgress = { ...update, updatedAt: new Date().toISOString() };
      loaded.items = [item, ...loaded.items.filter((p) => p.sermonId !== update.sermonId)];
      setProgressData({ userId, items: loaded.items });
      outbox.current.pending.set(`${userId}|${update.sermonId}`, { userId, update });
      flushProgress();
    },
    [flushProgress, userId],
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
      const had = saved.includes(sermonId);
      const edit: SavedEdit = { saved: value, settled: null };
      savedEdits.current.set(sermonId, edit);
      const show = (on: boolean) =>
        change((d) => {
          const rest = d.saved.filter((id) => id !== sermonId);
          return { ...d, saved: on ? [sermonId, ...rest] : rest };
        });
      // Optimistic, rolled back if the service refuses.
      show(value);
      try {
        await need().setSaved(userId, sermonId, value);
        edit.settled = ++editSeq.current;
      } catch (error) {
        // Unless a later tap has taken its place.
        if (savedEdits.current.get(sermonId) === edit) {
          savedEdits.current.delete(sermonId);
          show(had);
        }
        throw error;
      }
    },
    [change, saved, userId],
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
      loaded: !!mine,
      welcomed: !!onboarding?.welcomed || !!profile?.onboardedAt,
      interests,
      setInterests,
      finishWelcome,
      saved,
      savedError,
      reloadSaved,
      isSaved: (id) => saved.includes(id),
      setSaved,
      progress,
      progressFor: (id) => progress.find((item) => item.sermonId === id) ?? null,
      progressReady,
      whenProgressReady,
      saveProgress,
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
        await need().deleteAccount();
        holdName(null);
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
    mine,
    saved,
    savedError,
    reloadSaved,
    progress,
    progressReady,
    whenProgressReady,
    saveProgress,
    passes,
    guestWatch,
    joined,
    clearJustJoined,
    signingInWith,
    setInterests,
    finishWelcome,
    setSaved,
    grantPass,
    updateProfile,
    signInWithApple,
    holdName,
    persistOnboarding,
  ]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider.");
  return value;
}
