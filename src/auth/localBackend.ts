import { keys, readJSON, removeKey, writeJSON } from "../lib/storage";
import {
  AuthBackend,
  AuthError,
  AuthResult,
  AuthUser,
  CodePurpose,
  Profile,
  Provider,
  WatchProgress,
} from "./types";

/**
 * A stand-in account service that never leaves the device, used in
 * development and the automated tests when no Supabase project is set up.
 * Passwords are checked for length only and never stored.
 *
 * Deterministic test values:
 * - The emailed code is always 123456; 000000 behaves as an expired code.
 * - Signing up as taken@example.com reports the address is already used.
 * - The password "wrong-password" is rejected at sign-in.
 * - Password sign-in as unconfirmed@example.com says the email isn't
 *   confirmed yet, like an account whose sign-up code was never entered.
 *
 * Like the real service, the profile and saved list come back a moment
 * after they're asked for (as they were when asked), and fail while the
 * browser is offline.
 */
export const LOCAL_CODE = "123456";
const EXPIRED_CODE = "000000";
const TAKEN = "taken@example.com";
const UNCONFIRMED = "unconfirmed@example.com";
const WRONG = "wrong-password";

// Accounts stored before watch progress existed have no `progress`.
type Stored = { profile: Profile; saved: string[]; progress?: WatchProgress[] };
const emptyProfile: Profile = { displayName: null, interests: [], onboardedAt: null };

const wait = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));

/** The account's tables are a service away: unreachable offline. */
function reachable() {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw new AuthError("network");
}

export function createLocalBackend(): AuthBackend {
  const listeners = new Set<(user: AuthUser | null) => void>();
  let current: AuthUser | null = null;

  const emit = (user: AuthUser | null) => {
    current = user;
    listeners.forEach((listener) => listener(user));
  };

  async function signIn(email: string, provider: Provider, displayName?: string) {
    const user: AuthUser = {
      id: `local:${email.trim().toLowerCase()}`,
      email: email.trim().toLowerCase(),
      provider,
    };
    await writeJSON(keys.localSession, user);
    if (displayName)
      await change(user.id, (data) =>
        data.profile.displayName
          ? data
          : { ...data, profile: { ...data.profile, displayName } },
      );
    emit(user);
    return { status: "signedIn" } as const;
  }

  const load = (userId: string) =>
    readJSON<Stored>(keys.localData(userId), { profile: emptyProfile, saved: [] });
  // Changes run one at a time, so a progress save landing during a profile
  // or saved-list change can't overwrite it with what it read before.
  let queue: Promise<unknown> = Promise.resolve();
  const change = (userId: string, update: (data: Stored) => Stored) => {
    const next = queue.then(async () =>
      writeJSON(keys.localData(userId), update(await load(userId))),
    );
    queue = next.catch(() => {});
    return next;
  };

  function checkCode(code: string) {
    if (code === EXPIRED_CODE) throw new AuthError("expired_code");
    if (code !== LOCAL_CODE) throw new AuthError("invalid_code");
  }

  // A code was "sent" for these addresses; verifying signs in as them.
  const pending = new Map<string, { purpose: CodePurpose; name?: string }>();

  return {
    kind: "local",
    async restore() {
      current = await readJSON<AuthUser | null>(keys.localSession, null);
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signUpWithPassword(email, password, displayName) {
      await wait();
      if (email.trim().toLowerCase() === TAKEN) throw new AuthError("email_taken");
      if (password.length < 8) throw new AuthError("weak_password");
      // Like Supabase with "Confirm email" on: verify the address first.
      pending.set(email.trim().toLowerCase(), { purpose: "confirm", name: displayName });
      return { status: "codeSent", email, purpose: "confirm" };
    },
    async signInWithPassword(email, password) {
      await wait();
      if (password === WRONG || password.length < 8)
        throw new AuthError("invalid_credentials");
      if (email.trim().toLowerCase() === UNCONFIRMED)
        throw new AuthError("email_not_confirmed");
      return signIn(email, "email");
    },
    async sendEmailCode(email) {
      await wait();
      pending.set(email.trim().toLowerCase(), { purpose: "sign-in" });
      return { status: "codeSent", email, purpose: "sign-in" };
    },
    async verifyCode(email, code, purpose): Promise<AuthResult> {
      await wait(350);
      checkCode(code);
      const entry = pending.get(email.trim().toLowerCase());
      pending.delete(email.trim().toLowerCase());
      return signIn(email, "email", entry?.name ?? undefined).then(() => ({
        status: "signedIn" as const,
      }));
    },
    async resendCode() {
      await wait(300);
    },
    async signInWithApple() {
      await wait();
      // Like Apple: the name comes with the sign-in, for the app to save.
      await signIn("apple.viewer@example.com", "apple");
      return { status: "signedIn", name: "Apple Viewer" };
    },
    async signInWithGoogle() {
      await wait();
      return signIn("google.viewer@example.com", "google", "Google Viewer");
    },
    async exchangeCode() {
      if (!current) throw new AuthError("invalid_code");
      return { status: "signedIn" };
    },
    async sendPasswordReset(email) {
      await wait();
      pending.set(email.trim().toLowerCase(), { purpose: "recovery" });
      return { status: "codeSent", email, purpose: "recovery" };
    },
    async updatePassword(password) {
      await wait(350);
      if (!current) throw new AuthError("invalid_credentials");
      if (password.length < 8) throw new AuthError("weak_password");
    },
    async signOut() {
      await removeKey(keys.localSession);
      emit(null);
    },
    async deleteAccount() {
      await wait();
      if (current) await removeKey(keys.localData(current.id));
      await removeKey(keys.localSession);
      emit(null);
    },
    async getGuestWatch() {
      const value = process.env.EXPO_PUBLIC_GUEST_WATCH;
      return value === "all" || value === "none" || value === "shared" ? value : null;
    },
    async getProfile(userId) {
      reachable();
      const { profile } = await load(userId);
      await wait(250);
      return profile;
    },
    async updateProfile(userId, changes) {
      reachable();
      await change(userId, (data) => ({
        ...data,
        profile: { ...data.profile, ...changes },
      }));
    },
    async listSaved(userId) {
      reachable();
      const { saved } = await load(userId);
      await wait(250);
      return saved;
    },
    async setSaved(userId, sermonId, saved) {
      reachable();
      await change(userId, (data) => {
        const rest = data.saved.filter((id) => id !== sermonId);
        return { ...data, saved: saved ? [sermonId, ...rest] : rest };
      });
    },
    // Like the profile, progress arrives a moment after it's asked for, so
    // a Watch straight after signing in starts before it does, as it can
    // with Supabase.
    async listProgress(userId) {
      reachable();
      const { progress = [] } = await load(userId);
      await wait(250);
      return [...progress].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async saveProgress(userId, progress) {
      reachable();
      const item: WatchProgress = { ...progress, updatedAt: new Date().toISOString() };
      await change(userId, (data) => ({
        ...data,
        progress: [
          item,
          ...(data.progress ?? []).filter((p) => p.sermonId !== item.sermonId),
        ],
      }));
    },
  };
}
