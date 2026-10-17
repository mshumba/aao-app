import {
  AuthError as SupabaseAuthError,
  isAuthRetryableFetchError,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { fetchWithTimeout } from "../learning/request";
import { AuthError, AuthErrorCode, AuthResult } from "./types";

/**
 * The parts of the Supabase account service that need nothing from the
 * device: its errors in the app's terms, the session to start with and its
 * changes, signing this device out, and finishing a link that comes back
 * with a code. Kept apart from supabaseBackend.ts so they run in Node
 * against the real supabase-js (tests/auth-edge.spec.ts,
 * tests/offline-launch.spec.ts).
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
  if (result.error) {
    // Table requests carry the HTTP status: 0 when the request never got an
    // answer (offline, or it ran out of time).
    const status = (result as { status?: unknown }).status;
    if (status === 0) throw new AuthError("network", "No answer from the account service");
    const failure = translate(result.error);
    if (typeof status === "number" && !failure.status) failure.status = status;
    throw failure;
  }
  return result.data;
}

/**
 * Supabase's fetch, with the deadline the app's other requests have
 * (src/learning/request.ts): one that hangs (a connection that neither
 * answers nor fails) fails when it runs out, body included, rather than
 * waiting for good. supabase-js passes the address as a string.
 */
export function fetchWithDeadline(timeoutMs: number): typeof fetch {
  return (input, init) =>
    fetchWithTimeout(typeof input === "object" && "url" in input ? input.url : String(input), {
      ...init,
      timeoutMs,
    });
}

type StoredSession = Session & { user: { id: string } };

/** A session as Supabase saves it (with its user), or null for anything else. */
export function storedSession(value: unknown): StoredSession | null {
  const session = value as Partial<StoredSession> | null;
  return session &&
    typeof session === "object" &&
    typeof session.access_token === "string" &&
    typeof session.refresh_token === "string" &&
    typeof session.expires_at === "number" &&
    typeof session.user?.id === "string"
    ? (session as StoredSession)
    : null;
}

/** Reads the session Supabase saved on this device, without Supabase. */
export type ReadSaved = () => Promise<unknown>;

/**
 * The session to start the app with: Supabase's own answer if it comes
 * within `waitMs`, else the one saved on the device.
 *
 * Opened offline after the access token has expired (an hour after the last
 * use), Supabase retries renewing it for about 30 seconds and then answers
 * with no session, although it keeps the saved one: a renewal that couldn't
 * reach the server isn't a sign-out. So the app starts signed in from the
 * saved session, and the renewal carries on in the background (Supabase
 * renews it every 30 seconds while the app is open; a renewed session
 * arrives through watchSession). A session the server refuses is removed by
 * Supabase, which then reports the sign-out.
 */
export async function restoreSession(
  auth: Pick<SupabaseAuth, "getSession">,
  readSaved: ReadSaved,
  waitMs: number,
): Promise<Session | null> {
  // Read now as well as later, in case a renewal is rewriting it then.
  const savedAtStart = readSaved().catch(() => null);
  const answer = auth.getSession().then(
    ({ data, error }) => ({ session: data.session, error }),
    (error: unknown) => ({ session: null, error }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  const first = await Promise.race([answer, late]);
  clearTimeout(timer);
  if (first?.session) return first.session;
  // Answered with no session, and not because the server was out of reach.
  if (first && !isAuthRetryableFetchError(first.error)) return null;
  const saved = storedSession(await readSaved().catch(() => null)) ?? storedSession(await savedAtStart);
  return saved;
}

/**
 * Supabase's sign-in changes, as the session the app should show: a
 * session, or null once signed out. Supabase also reports "no session" as
 * it starts (INITIAL_SESSION) when it couldn't renew the saved one offline,
 * while keeping it saved; that isn't a sign-out, so nothing is reported
 * then while a session is still saved. Changes are reported in order, each
 * once the one before it has been.
 */
export function watchSession(
  auth: Pick<SupabaseAuth, "onAuthStateChange">,
  readSaved: ReadSaved,
  listener: (session: Session | null) => void,
) {
  let queue: Promise<void> = Promise.resolve();
  const { data } = auth.onAuthStateChange((event, session) => {
    // Supabase warns against awaiting its own calls inside this callback.
    queue = queue.then(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!session && event === "INITIAL_SESSION" && storedSession(await readSaved().catch(() => null)))
        return;
      listener(session);
    });
  });
  return () => data.subscription.unsubscribe();
}

/**
 * The session to send `userId`'s account data with, or an AuthError when
 * there's none to use: "network" while it can't be renewed (offline; see
 * restoreSession), "invalid_credentials" when signed out or signed in as
 * someone else. Account data is only read and written with that account's
 * own token: without one, Supabase would send the request with the public
 * key, and the account's saved sermons or progress would read as empty.
 */
export async function liveSession(auth: Pick<SupabaseAuth, "getSession">, userId?: string) {
  const { data, error } = await auth.getSession();
  const session = data.session;
  if (session && (!userId || session.user.id === userId)) return session;
  if (!session && isAuthRetryableFetchError(error))
    throw new AuthError("network", "The session couldn't be renewed yet");
  throw new AuthError("invalid_credentials", "Not signed in");
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
