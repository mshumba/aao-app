import {
  createClient,
  processLock,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { AppState, Platform, TurboModuleRegistry } from "react-native";
import { CategoryId } from "../data/categories";
import { deleteSignedIn, linkedToApple, sendAppleCode } from "./appleTokens";
import { googleClientIds, isNativeApple, supabaseConfig } from "./config";
import { SESSION_KEY, forgetSession, readSavedSession, secureSessionStorage } from "./sessionStorage";
import { signInMethod } from "./signInMethod";
import {
  SESSION_WAIT_MS,
  codeExchange,
  fetchWithDeadline,
  liveSession,
  restoreSession,
  run,
  signOutHere,
  translate,
  watchSession,
} from "./supabaseSession";
import {
  AuthBackend,
  AuthError,
  AuthResult,
  AuthUser,
  CodePurpose,
  GuestWatch,
  Profile,
  WatchProgress,
} from "./types";

/**
 * Google's own sign-in sheet on iPhone and Android, so signing in with Google
 * never passes through the account service's web page. A build made before it
 * was added (TestFlight build 2, Expo Go) lacks its native module, and loading
 * the library there would throw at once, so it's only loaded when the module
 * is found (the same lookup the library makes). Those builds and the web keep
 * the web flow.
 */
type GoogleSignInModule = typeof import("@react-native-google-signin/google-signin");
const hasGoogleClient =
  Platform.OS === "ios"
    ? Boolean(googleClientIds.ios)
    : // Android's sheet only works once an Android client with the build's
      // SHA-1 exists in Google Cloud; its ID here says it does.
      Platform.OS === "android" && Boolean(googleClientIds.web && googleClientIds.android);
const nativeGoogle: GoogleSignInModule | null =
  hasGoogleClient && TurboModuleRegistry.get("RNGoogleSignin")
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@react-native-google-signin/google-signin") as GoogleSignInModule)
    : null;

/** Where OAuth providers and email links return to. */
export function authRedirect() {
  return Platform.OS === "web"
    ? `${window.location.origin}/auth/callback`
    : Linking.createURL("auth/callback");
}

function toUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;
  const { user } = session;
  return {
    id: user.id,
    email: user.email ?? null,
    provider: signInMethod(session),
    appleLinked: linkedToApple(session),
  };
}

// How long a save or unsave may take before it's given up.
const SAVE_DEADLINE_MS = 15_000;
// How long any request to the account service may take, body included,
// before it fails: the app's usual deadline (src/learning/request.ts).
const REQUEST_DEADLINE_MS = 15_000;

const otpType: Record<CodePurpose, "email" | "signup" | "recovery"> = {
  "sign-in": "email",
  confirm: "signup",
  recovery: "recovery",
};

export function createSupabaseBackend(): AuthBackend {
  // Read before the client starts and exchanges it (see codeExchange).
  const loadedWith =
    Platform.OS === "web" && typeof window !== "undefined"
      ? new URL(window.location.href).searchParams.get("code")
      : null;
  const client: SupabaseClient = createClient(
    supabaseConfig.url,
    supabaseConfig.key,
    {
      auth: {
        // Web keeps the default (localStorage); native keeps the session in
        // the Keychain / Keystore so it survives restarts.
        ...(Platform.OS !== "web" ? { storage: secureSessionStorage } : null),
        storageKey: SESSION_KEY,
        autoRefreshToken: true,
        persistSession: true,
        // Web returns from Google/Apple and email links with ?code=… on
        // /auth/callback; supabase-js exchanges it on load.
        detectSessionInUrl: Platform.OS === "web",
        flowType: "pkce",
        lock: processLock,
      },
      // Without a deadline, a connection that hangs would hold sign-in, the
      // session's renewal and every account request for good.
      global: { fetch: fetchWithDeadline(REQUEST_DEADLINE_MS) },
    },
  );

  // Listens from creation, so a reset link the web exchanged on load is known.
  const codes = codeExchange(client.auth, loadedWith);

  // Refresh tokens only while the app is in the foreground (Supabase's
  // guidance for React Native), so a backgrounded app doesn't spin timers.
  if (Platform.OS !== "web") {
    AppState.addEventListener("change", (state) => {
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
  }

  /**
   * The account a request is for (the signed-in one when not given), once
   * its session can be used: never sent with no token, or another account's.
   */
  async function accountFor(userId?: string) {
    const session = await liveSession(client.auth, readSavedSession, userId || undefined);
    return session.user.id;
  }

  /** Runs an OAuth provider in an in-app browser sheet (native) or a redirect (web). */
  async function oauth(provider: "google" | "apple"): Promise<AuthResult> {
    const redirectTo = authRedirect();
    if (Platform.OS === "web") {
      await run(() =>
        client.auth.signInWithOAuth({ provider, options: { redirectTo } }),
      );
      // The page navigates away; this promise only resolves if it doesn't.
      return { status: "cancelled" };
    }
    const data = await run(() =>
      client.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      }),
    );
    if (!data.url) throw new AuthError("provider_unavailable");
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return { status: "cancelled" };
    // expo-linking parses custom-scheme URLs (aao://…) reliably on native.
    const query = Linking.parse(result.url).queryParams ?? {};
    const param = (key: string) => {
      const value = query[key];
      return typeof value === "string" ? value : undefined;
    };
    // Declining on the provider's consent screen is a cancel, as on the web.
    if (param("error") === "access_denied") return { status: "cancelled" };
    const failure = param("error_description") ?? param("error");
    if (failure) throw new AuthError("provider_unavailable", failure);
    const code = param("code");
    if (!code) throw new AuthError("unknown", "No authorization code returned");
    // Shared with the callback route, which the same return can also open.
    await codes.exchange(code);
    return { status: "signedIn" };
  }

  /** Signs in with the ID token a provider's native sheet returned. */
  async function signInWithToken(provider: "apple" | "google", token: string, nonce?: string) {
    try {
      await run(() => client.auth.signInWithIdToken({ provider, token, nonce }));
    } catch (error) {
      // A token Supabase won't accept (an app ID missing from the provider's
      // Client IDs, a nonce mismatch) is the option being unavailable, not
      // something the viewer typed.
      const code = (error as AuthError).code;
      if (code === "unknown" || code === "invalid_email")
        throw new AuthError("provider_unavailable", (error as Error).message);
      throw error;
    }
  }

  let googleConfigured = false;
  async function signInWithNativeGoogle(google: GoogleSignInModule): Promise<AuthResult> {
    const { GoogleSignin, statusCodes } = google;
    if (!googleConfigured) {
      GoogleSignin.configure({
        ...(Platform.OS === "ios" ? { iosClientId: googleClientIds.ios } : null),
        webClientId: googleClientIds.web || undefined,
      });
      googleConfigured = true;
    }
    // Android's sheet needs Google Play services (iPhone always says yes);
    // without them, or with an old version, the browser flow still works.
    const playServices = await GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: false,
    }).catch(() => false);
    if (!playServices) return oauth("google");
    let token: string | null;
    try {
      const response = await GoogleSignin.signIn();
      if (response.type === "cancelled") return { status: "cancelled" };
      token = response.data.idToken;
    } catch (error) {
      if ((error as { code?: string }).code === statusCodes.SIGN_IN_CANCELLED)
        return { status: "cancelled" };
      throw new AuthError("provider_unavailable", String(error));
    }
    // AAO needs Google only for this one token, so it keeps no Google
    // session of its own on the device.
    GoogleSignin.signOut().catch(() => {});
    if (!token) throw new AuthError("provider_unavailable");
    // The free library can't pass Supabase a nonce on iOS (Google's SDK
    // makes its own), so the Google provider skips that check.
    await signInWithToken("google", token);
    return { status: "signedIn" };
  }

  // The Apple authorization code the last sign-in sent (signInWithApple).
  let appleCodeSent: Promise<boolean> | null = null;

  return {
    kind: "supabase",
    async restore() {
      return toUser(await restoreSession(client.auth, readSavedSession, SESSION_WAIT_MS));
    },
    subscribe(listener) {
      return watchSession(client.auth, readSavedSession, (session) => listener(toUser(session)));
    },

    async signUpWithPassword(email, password, displayName) {
      const data = await run(() =>
        client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: authRedirect(),
            data: displayName ? { display_name: displayName } : undefined,
          },
        }),
      );
      // With "Confirm email" on (the default) there's no session until the
      // emailed code is entered. An existing address also returns no
      // session, with an empty identities list, so it isn't revealed here.
      if (data.session) return { status: "signedIn" };
      return { status: "codeSent", email, purpose: "confirm" };
    },
    async signInWithPassword(email, password) {
      await run(() => client.auth.signInWithPassword({ email, password }));
      return { status: "signedIn" };
    },
    async sendEmailCode(email) {
      await run(() =>
        client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true, emailRedirectTo: authRedirect() },
        }),
      );
      return { status: "codeSent", email, purpose: "sign-in" };
    },
    async verifyCode(email, code, purpose) {
      await run(() =>
        client.auth.verifyOtp({ email, token: code, type: otpType[purpose] }),
      );
      // A reset code also reports PASSWORD_RECOVERY; the code step handles
      // it, so it mustn't linger for a later link.
      codes.clearRecovery();
      return { status: "signedIn" };
    },
    async resendCode(email, purpose) {
      // The same return address as the first email, so the link in a resent
      // one opens the app too (and carries a new PKCE challenge).
      const redirect = authRedirect();
      if (purpose === "sign-in") {
        await run(() =>
          client.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: true, emailRedirectTo: redirect },
          }),
        );
      } else if (purpose === "confirm") {
        await run(() =>
          client.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirect } }),
        );
      } else {
        await run(() => client.auth.resetPasswordForEmail(email, { redirectTo: redirect }));
      }
    },
    async signInWithApple() {
      if (!isNativeApple) return oauth("apple");
      if (!(await AppleAuthentication.isAvailableAsync()))
        throw new AuthError("provider_unavailable");
      // Apple signs a hash of the nonce; Supabase checks it against the raw value.
      const rawNonce = Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );
      let credential: AppleAuthentication.AppleAuthenticationCredential;
      try {
        credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce: hashed,
        });
      } catch (error) {
        if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED")
          return { status: "cancelled" };
        throw new AuthError("provider_unavailable", String(error));
      }
      if (!credential.identityToken) throw new AuthError("provider_unavailable");
      await signInWithToken("apple", credential.identityToken, rawNonce);
      // The server swaps the one-time code for Apple's refresh token and
      // keeps it, so deleting the account can revoke it. Sign-in doesn't
      // wait for it; a deletion straight after does.
      appleCodeSent = sendAppleCode(client.functions, credential.authorizationCode);
      // Apple shares the name only on the very first sign-in. The account
      // saves it to the profile once that has loaded, and keeps trying
      // until it's saved, so a failed write doesn't lose it for good.
      const name = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(" ")
        .trim();
      return name ? { status: "signedIn", name } : { status: "signedIn" };
    },
    signInWithGoogle: () =>
      nativeGoogle ? signInWithNativeGoogle(nativeGoogle) : oauth("google"),
    exchangeCode: (code) => codes.exchange(code),
    async sendPasswordReset(email) {
      await run(() =>
        client.auth.resetPasswordForEmail(email, { redirectTo: authRedirect() }),
      );
      return { status: "codeSent", email, purpose: "recovery" };
    },
    async updatePassword(password) {
      await run(() => client.auth.updateUser({ password }));
    },
    signOut: () => signOutHere(client.auth, forgetSession, readSavedSession),
    async deleteAccount() {
      // Apple's token is revoked first (App Store guideline 5.1.1(v)); if
      // Apple can't be reached the server retries it after the account goes.
      await deleteSignedIn(client, appleCodeSent, readSavedSession);
      // The account is gone either way; this clears the device.
      await signOutHere(client.auth, forgetSession, readSavedSession).catch(() => {});
    },

    async getGuestWatch() {
      const { data, error } = await client
        .from("app_settings")
        .select("value")
        .eq("key", "guest_watch")
        .maybeSingle();
      if (error) throw translate(error);
      const value = data?.value;
      return value === "all" || value === "none" || value === "shared"
        ? (value as GuestWatch)
        : null;
    },

    async getProfile(userId) {
      await accountFor(userId);
      const data = await run(() =>
        client
          .from("profiles")
          .select("display_name, interests, onboarded_at")
          .eq("id", userId)
          .maybeSingle(),
      );
      return {
        displayName: data?.display_name ?? null,
        interests: (data?.interests ?? []) as CategoryId[],
        onboardedAt: data?.onboarded_at ?? null,
      } satisfies Profile;
    },
    async updateProfile(userId, changes) {
      await accountFor(userId);
      const row: Record<string, unknown> = { id: userId };
      if ("displayName" in changes) row.display_name = changes.displayName;
      if ("interests" in changes) row.interests = changes.interests;
      if ("onboardedAt" in changes) row.onboarded_at = changes.onboardedAt;
      await run(() => client.from("profiles").upsert(row));
    },
    async listSaved(userId) {
      await accountFor(userId);
      const data = await run(() =>
        client
          .from("saved_sermons")
          .select("sermon_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      );
      return (data ?? []).map((row: { sermon_id: string }) => row.sermon_id);
    },
    async setSaved(userId, sermonId, saved) {
      // A write that stalls is cancelled, not left to land later, so the
      // taps queued behind it for this sermon (AccountProvider) go on. The
      // deadline covers waiting for the session too, which offline can
      // take Supabase half a minute of retries to give up on.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SAVE_DEADLINE_MS);
      const stopped = new Promise<never>((_, reject) =>
        controller.signal.addEventListener("abort", () => reject(controller.signal.reason)),
      );
      stopped.catch(() => {});
      try {
        const id = await Promise.race([accountFor(userId), stopped]);
        if (saved) {
          await run(() =>
            client
              .from("saved_sermons")
              .upsert({ user_id: id, sermon_id: sermonId }, { ignoreDuplicates: true })
              .abortSignal(controller.signal),
          );
        } else {
          await run(() =>
            client
              .from("saved_sermons")
              .delete()
              .eq("user_id", id)
              .eq("sermon_id", sermonId)
              .abortSignal(controller.signal),
          );
        }
      } catch (error) {
        if (controller.signal.aborted) throw new AuthError("network", "Saving took too long");
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },

    async listProgress(userId) {
      await accountFor(userId);
      const data = await run(() =>
        client
          .from("watch_progress")
          .select("sermon_id, position_seconds, duration_seconds, finished, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(100),
      );
      return (data ?? []).map(
        (row: {
          sermon_id: string;
          position_seconds: number;
          duration_seconds: number;
          finished: boolean;
          updated_at: string;
        }) =>
          ({
            sermonId: row.sermon_id,
            positionSeconds: row.position_seconds,
            durationSeconds: row.duration_seconds,
            finished: row.finished,
            updatedAt: row.updated_at,
          }) satisfies WatchProgress,
      );
    },
    async saveProgress(userId, progress) {
      const id = await accountFor(userId);
      // One row per sermon; updated_at is set by the database.
      await run(() =>
        client.from("watch_progress").upsert({
          user_id: id,
          sermon_id: progress.sermonId,
          position_seconds: Math.max(0, Math.round(progress.positionSeconds)),
          duration_seconds: Math.max(0, Math.round(progress.durationSeconds)),
          finished: progress.finished,
        }),
      );
    },
  };
}
