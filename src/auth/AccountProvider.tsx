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
import { CategoryId, categories } from "../data/categories";
import { keys, readJSON, writeJSON } from "../lib/storage";
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
  /** Topics chosen during onboarding, before any account existed. */
  interests: CategoryId[];
};

type Account = {
  /** Session restored and onboarding state loaded; safe to route. */
  ready: boolean;
  mode: typeof authMode;
  methods: typeof enabledMethods;
  user: AuthUser | null;
  profile: Profile | null;
  displayName: string | null;

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

  /** What guests may watch without an account (a remote setting). */
  guestWatch: GuestWatch;
  /** Sermons opened from a shared link, which guests may watch. */
  hasPass: (sermonId: string) => boolean;
  grantPass: (sermonId: string) => void;

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

const AccountContext = createContext<Account | null>(null);

const validTopic = (id: string): id is CategoryId =>
  categories.some((category) => category.id === id);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [restored, setRestored] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  // Profile and saved list, tagged with the account they belong to, so a
  // sign-out or account switch never shows the previous account's data.
  const [data, setData] = useState<{
    userId: string;
    profile: Profile;
    saved: string[];
    savedError: boolean;
  } | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [passes, setPasses] = useState<string[]>([]);
  const [guestWatch, setGuestWatch] = useState<GuestWatch>("shared");
  // Read by callbacks that must see the latest value without re-creating.
  const onboardingRef = useRef<Onboarding | null>(null);
  useEffect(() => {
    onboardingRef.current = onboarding;
  }, [onboarding]);

  // Restore the session and this device's onboarding state together, so
  // the first route decision sees both.
  useEffect(() => {
    let active = true;
    Promise.all([
      backend?.restore().catch(() => null) ?? Promise.resolve(null),
      readJSON<Onboarding>(keys.onboarding, { welcomed: false, interests: [] }),
      readJSON<string[]>(keys.sharedPasses, []),
    ]).then(([restoredUser, stored, storedPasses]) => {
      if (!active) return;
      setOnboarding({
        welcomed: !!stored.welcomed,
        interests: (stored.interests ?? []).filter(validTopic),
      });
      setPasses(Array.isArray(storedPasses) ? storedPasses : []);
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

  // Load (and on first sign-in, seed) the account's profile and saved list.
  const userId = user?.id ?? null;
  const mine = data && data.userId === userId ? data : null;
  const profile = mine?.profile ?? null;
  const saved = useMemo(() => mine?.saved ?? [], [mine]);
  const savedError = !!mine?.savedError;
  useEffect(() => {
    if (!userId || !backend) return;
    let active = true;
    (async () => {
      const [loaded, list] = await Promise.all([
        backend.getProfile(userId).catch(() => null),
        // A failure is kept apart from an empty list, so Saved can offer a retry.
        backend.listSaved(userId).catch(() => null),
      ]);
      if (!active) return;
      let next = loaded ?? { displayName: null, interests: [], onboardedAt: null };
      // Topics picked as a guest carry over to a new account.
      const local = onboardingRef.current;
      // Anyone who has signed in on this device has seen the app; signing
      // out later shouldn't bring the welcome back.
      if (local && !local.welcomed) {
        const welcomed = { ...local, welcomed: true };
        onboardingRef.current = welcomed;
        setOnboarding(welcomed);
        writeJSON(keys.onboarding, welcomed);
      }
      if (local && (!next.interests.length || !next.onboardedAt)) {
        const changes: ProfileChanges = {};
        if (!next.interests.length && local.interests.length)
          changes.interests = local.interests;
        if (!next.onboardedAt && local.welcomed)
          changes.onboardedAt = new Date().toISOString();
        if (Object.keys(changes).length) {
          next = { ...next, ...changes };
          backend.updateProfile(userId, changes).catch(() => {});
        }
      }
      setData({
        userId,
        profile: { ...next, interests: next.interests.filter(validTopic) },
        saved: list ?? [],
        savedError: !list,
      });
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const persistOnboarding = useCallback((next: Onboarding) => {
    onboardingRef.current = next;
    setOnboarding(next);
    writeJSON(keys.onboarding, next);
  }, []);

  /** Changes this account's profile or saved list in place. */
  const change = useCallback(
    (update: (current: { profile: Profile; saved: string[]; savedError: boolean }) => {
      profile: Profile;
      saved: string[];
      savedError: boolean;
    }) =>
      setData((current) =>
        current && current.userId === userId
          ? { userId: current.userId, ...update(current) }
          : current,
      ),
    [userId],
  );

  const setInterests = useCallback(
    async (ids: CategoryId[]) => {
      const clean = ids.filter(validTopic);
      persistOnboarding({
        welcomed: onboardingRef.current?.welcomed ?? false,
        interests: clean,
      });
      if (userId && backend) {
        change((d) => ({ ...d, profile: { ...d.profile, interests: clean } }));
        await backend.updateProfile(userId, { interests: clean });
      }
    },
    [change, persistOnboarding, userId],
  );

  const finishWelcome = useCallback(async () => {
    persistOnboarding({
      welcomed: true,
      interests: onboardingRef.current?.interests ?? [],
    });
    if (userId && backend && !profile?.onboardedAt) {
      const onboardedAt = new Date().toISOString();
      change((d) => ({ ...d, profile: { ...d.profile, onboardedAt } }));
      await backend.updateProfile(userId, { onboardedAt }).catch(() => {});
    }
  }, [change, persistOnboarding, userId, profile?.onboardedAt]);

  const setSaved = useCallback(
    async (sermonId: string, value: boolean) => {
      if (!userId) throw new AuthError("invalid_credentials", "Not signed in");
      // Optimistic, rolled back if the service refuses.
      const before = saved;
      change((d) => {
        const rest = d.saved.filter((id) => id !== sermonId);
        return { ...d, saved: value ? [sermonId, ...rest] : rest };
      });
      try {
        await need().setSaved(userId, sermonId, value);
      } catch (error) {
        change((d) => ({ ...d, saved: before }));
        throw error;
      }
    },
    [change, saved, userId],
  );

  const reloadSaved = useCallback(async () => {
    if (!userId || !backend) return;
    try {
      const list = await backend.listSaved(userId);
      change((d) => ({ ...d, saved: list, savedError: false }));
    } catch {
      change((d) => ({ ...d, savedError: true }));
    }
  }, [change, userId]);

  const grantPass = useCallback((sermonId: string) => {
    setPasses((current) => {
      if (current.includes(sermonId)) return current;
      const next = [sermonId, ...current].slice(0, 50);
      writeJSON(keys.sharedPasses, next);
      return next;
    });
  }, []);

  const updateProfile = useCallback(
    async (changes: ProfileChanges) => {
      if (!userId) throw new AuthError("invalid_credentials", "Not signed in");
      // Optimistic, rolled back if the service refuses.
      const before = profile;
      change((d) => ({ ...d, profile: { ...d.profile, ...changes } }));
      try {
        await need().updateProfile(userId, changes);
      } catch (error) {
        if (before) change((d) => ({ ...d, profile: before }));
        throw error;
      }
    },
    [change, profile, userId],
  );

  const value = useMemo<Account>(() => {
    const interests =
      profile && profile.interests.length
        ? profile.interests
        : (onboarding?.interests ?? []);
    return {
      ready: restored && !!onboarding,
      mode: authMode,
      methods: enabledMethods,
      user,
      profile,
      displayName: profile?.displayName ?? null,
      welcomed: !!onboarding?.welcomed || !!profile?.onboardedAt,
      interests,
      setInterests,
      finishWelcome,
      saved,
      savedError,
      reloadSaved,
      isSaved: (id) => saved.includes(id),
      setSaved,
      guestWatch,
      hasPass: (id) => passes.includes(id),
      grantPass,
      updateProfile,
      signUpWithPassword: (email, password, name) =>
        need().signUpWithPassword(email.trim(), password, name?.trim() || undefined),
      signInWithPassword: (email, password) =>
        need().signInWithPassword(email.trim(), password),
      sendEmailCode: (email) => need().sendEmailCode(email.trim()),
      verifyCode: (email, code, purpose) =>
        need().verifyCode(email.trim(), code.trim(), purpose),
      resendCode: (email, purpose) => need().resendCode(email.trim(), purpose),
      signInWithApple: () => need().signInWithApple(),
      signInWithGoogle: () => need().signInWithGoogle(),
      exchangeCode: (code) => need().exchangeCode(code),
      sendPasswordReset: (email) => need().sendPasswordReset(email.trim()),
      updatePassword: (password) => need().updatePassword(password),
      signOut: () => need().signOut(),
      deleteAccount: async () => {
        await need().deleteAccount();
        // Topics chosen on this device were part of the account; forget them.
        persistOnboarding({ welcomed: true, interests: [] });
      },
    };
  }, [
    restored,
    onboarding,
    user,
    profile,
    saved,
    savedError,
    reloadSaved,
    passes,
    guestWatch,
    setInterests,
    finishWelcome,
    setSaved,
    grantPass,
    updateProfile,
    persistOnboarding,
  ]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider.");
  return value;
}
