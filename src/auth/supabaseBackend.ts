import {
  AuthError as SupabaseAuthError,
  createClient,
  processLock,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { AppState, Platform } from "react-native";
import { CategoryId } from "../data/categories";
import { isNativeApple, supabaseConfig } from "./config";
import { SESSION_KEY, secureSessionStorage } from "./sessionStorage";
import {
  AuthBackend,
  AuthError,
  AuthErrorCode,
  AuthResult,
  AuthUser,
  CodePurpose,
  GuestWatch,
  Profile,
  Provider,
} from "./types";

/** Where OAuth providers and email links return to. */
export function authRedirect() {
  return Platform.OS === "web"
    ? `${window.location.origin}/auth/callback`
    : Linking.createURL("auth/callback");
}

function toUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;
  const { user } = session;
  const raw = (user.app_metadata?.provider as string | undefined) ?? "email";
  const provider: Provider =
    raw === "apple" || raw === "google" ? raw : "email";
  return { id: user.id, email: user.email ?? null, provider };
}

/** Supabase's error codes and statuses, in the app's terms. */
function translate(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  if (error instanceof SupabaseAuthError) {
    const code = (error.code ?? "") as string;
    const map: Record<string, AuthErrorCode> = {
      invalid_credentials: "invalid_credentials",
      user_already_exists: "email_taken",
      email_exists: "email_taken",
      email_not_confirmed: "email_not_confirmed",
      weak_password: "weak_password",
      same_password: "same_password",
      email_address_invalid: "invalid_email",
      otp_expired: "expired_code",
      // A link that was already used, or waited too long.
      flow_state_not_found: "expired_code",
      flow_state_expired: "expired_code",
      // PKCE links only finish where they were requested.
      pkce_code_verifier_not_found: "other_device",
      over_email_send_rate_limit: "rate_limited",
      over_request_rate_limit: "rate_limited",
      provider_disabled: "provider_unavailable",
      email_provider_disabled: "provider_unavailable",
      oauth_provider_not_supported: "provider_unavailable",
      signup_disabled: "provider_unavailable",
    };
    if (map[code]) return new AuthError(map[code], error.message);
    // Supabase reports many kinds of bad input this way; only an address
    // it couldn't accept is the email field's to fix.
    if (code === "validation_failed")
      return new AuthError(/email/i.test(error.message) ? "invalid_email" : "unknown", error.message);
    if (error.status === 429) return new AuthError("rate_limited", error.message);
    if (error.name === "AuthRetryableFetchError" || error.status === 0)
      return new AuthError("network", error.message);
    if (/token has expired or is invalid/i.test(error.message))
      return new AuthError("invalid_code", error.message);
    return new AuthError("unknown", error.message);
  }
  if (error instanceof TypeError && /network|fetch/i.test(error.message))
    return new AuthError("network", error.message);
  return new AuthError("unknown", error instanceof Error ? error.message : String(error));
}

/** Awaits a Supabase call, turning its { data, error } result into data or a thrown AuthError. */
async function run<R extends { data: unknown; error: unknown }>(
  work: () => PromiseLike<R>,
): Promise<R["data"]> {
  let result: R;
  try {
    result = await work();
  } catch (error) {
    throw translate(error);
  }
  if (result.error) throw translate(result.error);
  return result.data;
}

const otpType: Record<CodePurpose, "email" | "signup" | "recovery"> = {
  "sign-in": "email",
  confirm: "signup",
  recovery: "recovery",
};

export function createSupabaseBackend(): AuthBackend {
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
    },
  );

  // A password-reset link signs in like any other link; supabase-js knows
  // it was a reset (it marked the PKCE verifier when the email was sent) and
  // says so with PASSWORD_RECOVERY. On the web that happens while the client
  // starts, before the app subscribes, so it's caught here at creation. This
  // needs no marker in the redirect URL, which would stop it matching the
  // exact redirect URLs allowed in Supabase.
  let recoveryLink = false;
  client.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") recoveryLink = true;
  });

  // Refresh tokens only while the app is in the foreground (Supabase's
  // guidance for React Native), so a backgrounded app doesn't spin timers.
  if (Platform.OS !== "web") {
    AppState.addEventListener("change", (state) => {
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
  }

  async function currentUserId() {
    const { data } = await client.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new AuthError("invalid_credentials", "Not signed in");
    return id;
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
    await run(() => client.auth.exchangeCodeForSession(code));
    return { status: "signedIn" };
  }

  return {
    kind: "supabase",
    async restore() {
      const { data } = await client.auth.getSession();
      return toUser(data.session);
    },
    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // Supabase warns against awaiting its own calls inside this callback.
        setTimeout(() => listener(toUser(session)), 0);
      });
      return () => data.subscription.unsubscribe();
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
      recoveryLink = false;
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
      try {
        await run(() =>
          client.auth.signInWithIdToken({
            provider: "apple",
            token: credential.identityToken!,
            nonce: rawNonce,
          }),
        );
      } catch (error) {
        // A token Supabase won't accept (an app ID missing from the Apple
        // provider's Client IDs, a nonce mismatch) is the option being
        // unavailable, not something the viewer typed.
        const code = (error as AuthError).code;
        if (code === "unknown" || code === "invalid_email")
          throw new AuthError("provider_unavailable", (error as Error).message);
        throw error;
      }
      // Apple shares the name only on the very first sign-in. The account
      // saves it to the profile once that has loaded, and keeps trying
      // until it's saved, so a failed write doesn't lose it for good.
      const name = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(" ")
        .trim();
      return name ? { status: "signedIn", name } : { status: "signedIn" };
    },
    signInWithGoogle: () => oauth("google"),
    async exchangeCode(code) {
      // On web, supabase-js may already have exchanged it on load.
      const { data } = await client.auth.getSession();
      if (!data.session && Platform.OS === "web") {
        // If that exchange failed (a link already used, or too old),
        // supabase-js has dropped the link's verifier, so exchanging again
        // would wrongly say the link belongs to another device. Its own
        // error says what happened. (A dropped connection keeps the
        // verifier, so that one is worth another try below.)
        const { error } = await client.auth.initialize();
        const failure = error ? translate(error) : null;
        if (failure && failure.code !== "network") throw failure;
      }
      // Exchanging a reset link's code reports PASSWORD_RECOVERY too.
      if (!data.session) await run(() => client.auth.exchangeCodeForSession(code));
      const recovery = recoveryLink;
      recoveryLink = false;
      return { status: "signedIn", recovery };
    },
    async sendPasswordReset(email) {
      await run(() =>
        client.auth.resetPasswordForEmail(email, { redirectTo: authRedirect() }),
      );
      return { status: "codeSent", email, purpose: "recovery" };
    },
    async updatePassword(password) {
      await run(() => client.auth.updateUser({ password }));
    },
    async signOut() {
      // Local scope: sign this device out even when offline.
      await client.auth.signOut({ scope: "local" }).catch(() => {});
    },
    async deleteAccount() {
      await run(() => client.rpc("delete_account"));
      await client.auth.signOut({ scope: "local" }).catch(() => {});
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
      const row: Record<string, unknown> = { id: userId };
      if ("displayName" in changes) row.display_name = changes.displayName;
      if ("interests" in changes) row.interests = changes.interests;
      if ("onboardedAt" in changes) row.onboarded_at = changes.onboardedAt;
      await run(() => client.from("profiles").upsert(row));
    },
    async listSaved(userId) {
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
      const id = userId || (await currentUserId());
      if (saved) {
        await run(() =>
          client
            .from("saved_sermons")
            .upsert({ user_id: id, sermon_id: sermonId }, { ignoreDuplicates: true }),
        );
      } else {
        await run(() =>
          client
            .from("saved_sermons")
            .delete()
            .eq("user_id", id)
            .eq("sermon_id", sermonId),
        );
      }
    },
  };
}
