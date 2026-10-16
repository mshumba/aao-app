import { AuthError as SupabaseAuthError, type SupabaseClient } from "@supabase/supabase-js";
import { AuthError, AuthErrorCode, AuthResult } from "./types";

/**
 * The parts of the Supabase account service that need nothing from the
 * device: its errors in the app's terms, signing this device out, and
 * finishing a link that comes back with a code. Kept apart from
 * supabaseBackend.ts so they run in Node against the real supabase-js
 * (tests/auth-edge.spec.ts).
 */

type SupabaseAuth = SupabaseClient["auth"];

/** Supabase's error codes and statuses, in the app's terms. */
export function translate(error: unknown): AuthError {
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
export async function run<R extends { data: unknown; error: unknown }>(
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

/**
 * Signs this device out, offline included, and resolves only once it is.
 * `forgetSession` removes the saved session from the storage Supabase keeps
 * it in.
 */
export async function signOutHere(
  auth: Pick<SupabaseAuth, "signOut" | "getSession">,
  forgetSession: () => Promise<void>,
) {
  // Local scope: only this device, so the server needn't be reached.
  const attempt = () =>
    auth.signOut({ scope: "local" }).then(
      ({ error }) => error,
      (error: unknown) => error,
    );
  if (!(await attempt())) return;
  // Supabase clears the device before telling the server, so most failures
  // still leave it signed out. But an expired access token is refreshed
  // first, and when that fails (offline) it stops before clearing anything,
  // keeping the refresh token that would sign the account back in once the
  // connection returns. So what's left is removed here; with nothing saved,
  // Supabase then finishes signing out and tells the app as usual.
  const { data, error } = await auth.getSession();
  if (!data.session && !error) return;
  await forgetSession();
  const failure = await attempt();
  if (failure) throw translate(failure);
}

/**
 * Finishes the links that come back with a PKCE code (email links, and
 * Apple or Google through a browser) and says when one was a password
 * reset. `loadedWith` is the code in the address the web app loaded with,
 * which supabase-js exchanged as it started (detectSessionInUrl); on iPhone
 * and Android nothing is exchanged for the app, so it's null.
 */
export function codeExchange(
  auth: Pick<
    SupabaseAuth,
    "onAuthStateChange" | "initialize" | "getSession" | "exchangeCodeForSession"
  >,
  loadedWith: string | null,
) {
  // A password-reset link signs in like any other link; supabase-js knows
  // it was a reset (it marked the PKCE verifier when the email was sent) and
  // says so with PASSWORD_RECOVERY. On the web that happens while the client
  // starts, before the app subscribes, so it's caught from creation. This
  // needs no marker in the redirect URL, which would stop it matching the
  // exact redirect URLs allowed in Supabase.
  let recoveryLink = false;
  // Each code is exchanged once. The callback can open twice for one link
  // (delivered again, or an Android sign-in sheet's return also opening the
  // app); the second shares the first's answer rather than spending the
  // code again. Signing out forgets them, so a used link opened later gets
  // the service's own answer rather than an old success.
  const exchanges = new Map<string, Promise<AuthResult>>();
  auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") recoveryLink = true;
    if (event === "SIGNED_OUT") exchanges.clear();
  });

  async function finish(code: string): Promise<AuthResult> {
    if (code === loadedWith) {
      // Already exchanged as the page loaded. If that failed (a link already
      // used or too old, or no connection), supabase-js dropped the link's
      // verifier too, so exchanging again would only wrongly say the link
      // belongs to another device; its own error says what happened.
      const { error } = await auth.initialize();
      if (error) throw translate(error);
      // With no session it never tried, having no verifier: this browser
      // didn't ask for the link, which the exchange says.
      const { data } = await auth.getSession();
      if (!data.session) await run(() => auth.exchangeCodeForSession(code));
    } else {
      // Exchanged even over another session: a reset link asked for as a
      // guest, who then signed in with Apple before the email arrived,
      // still signs its own account in and goes on to a new password.
      await run(() => auth.exchangeCodeForSession(code));
    }
    const recovery = recoveryLink;
    recoveryLink = false;
    return { status: "signedIn", recovery };
  }

  return {
    exchange(code: string) {
      let pending = exchanges.get(code);
      if (!pending) {
        pending = finish(code);
        exchanges.set(code, pending);
      }
      return pending;
    },
    /** A reset code reports PASSWORD_RECOVERY too; it mustn't linger for a later link. */
    clearRecovery() {
      recoveryLink = false;
    },
  };
}
