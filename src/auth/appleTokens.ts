import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { run } from "./supabaseSession";
import { AuthError } from "./types";

/**
 * The app's half of Sign in with Apple token revocation (App Store
 * guideline 5.1.1(v)). The apple-tokens Edge Function keeps each account's
 * Apple refresh token where the app can't read it; the app only hands it
 * Apple's one-time authorization code after signing in, and asks it to
 * revoke the token before deleting the account. Neither ever stops sign-in
 * or deletion, and nothing here logs a code. Kept apart from
 * supabaseBackend.ts so it runs in Node (tests/apple-tokens.spec.ts). See
 * docs/development/apple-token-revocation.md.
 */

type Functions = Pick<SupabaseClient["functions"], "invoke">;
type Client = Pick<SupabaseClient, "auth" | "functions" | "rpc">;

const FUNCTION = "apple-tokens";

/** The longest deleting an account waits on Apple before going ahead. */
export const REVOKE_DEADLINE_MS = 10_000;
/** The longest it waits first for a code sent by a sign-in just before. */
export const STORING_WAIT_MS = 10_000;
/** The longest it waits to learn whether an Apple ID was linked elsewhere. */
const FRESH_USER_MS = 5_000;
const STORE_DEADLINE_MS = 15_000;

/** What `work` resolves to, or undefined when it fails or takes longer than `ms`. */
async function within<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.catch(() => undefined),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends the authorization code from a native Sign in with Apple to the
 * server, which swaps it for a refresh token and keeps it. Apple's codes
 * work once and last five minutes, so it's sent once, straight after
 * signing in, without holding sign-in up. Resolves to whether it was kept;
 * never throws. If it wasn't, the account works as before, and deleting it
 * can't revoke the token: the delete screen says how to stop using the
 * Apple ID with AAO by hand.
 */
export async function sendAppleCode(
  functions: Functions,
  code: string | null | undefined,
): Promise<boolean> {
  if (!code) return false;
  try {
    const { error } = await functions.invoke(FUNCTION, {
      body: { action: "store", code },
      timeout: STORE_DEADLINE_MS,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * The account has an Apple ID linked, so the server may hold a token for it
 * (and the delete screen says how to stop using that Apple ID with AAO).
 */
export function linkedToApple(session: Pick<Session, "user"> | null): boolean {
  const user = session?.user;
  if (!user) return false;
  const providers = user.app_metadata?.providers;
  return (
    (user.identities ?? []).some((identity) => identity.provider === "apple") ||
    (Array.isArray(providers) && providers.includes("apple")) ||
    user.app_metadata?.provider === "apple"
  );
}

/**
 * Asks the server to revoke the account's Apple token and forget it.
 * Resolves to whether Apple confirmed; never throws, and gives up after
 * `deadlineMs`. A token that wasn't revoked stays on the server and is
 * retried there once the account is gone. With `accessToken` it asks as
 * that session, not whichever the client holds when the request goes.
 */
export async function revokeAppleTokens(
  functions: Functions,
  deadlineMs = REVOKE_DEADLINE_MS,
  accessToken?: string,
): Promise<boolean> {
  try {
    const { data, error } = await functions.invoke(FUNCTION, {
      body: { action: "revoke" },
      timeout: deadlineMs,
      ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : null),
    });
    return !error && (data as { revoked?: unknown } | null)?.revoked === true;
  } catch {
    return false;
  }
}

/**
 * Deletes an account in the order Apple asks for: its Apple token is
 * revoked first, while the account still exists to show who is asking, then
 * the account and its data go. Revoking can only delay the deletion, never
 * stop it. `revokeApple` is null for an account with no Apple ID linked.
 * `storing` is the code a sign-in sent just before (sendAppleCode), if any:
 * deleting straight after signing in waits for it, up to `waitMs`, so the
 * token it brings is there to revoke.
 */
export async function deleteInOrder(steps: {
  storing?: Promise<unknown> | null;
  revokeApple: (() => Promise<unknown>) | null;
  deleteAccount: () => Promise<unknown>;
  waitMs?: number;
}): Promise<void> {
  if (steps.revokeApple) {
    if (steps.storing) await within(steps.storing, steps.waitMs ?? STORING_WAIT_MS);
    await steps.revokeApple().catch(() => {});
  }
  await steps.deleteAccount();
}

/**
 * Deletes the account signed in here (supabaseBackend's deleteAccount), in
 * deleteInOrder's order. `storing` is the code the last Apple sign-in sent.
 *
 * Waiting on Apple can take 20 seconds, time enough to sign out and in as
 * someone else. So it deletes the account signed in when it began: each
 * request first checks that account is still the one signed in, then sends
 * its token itself rather than whichever the client holds when the request
 * goes. If another account has signed in, nothing is revoked or deleted.
 *
 * Whether an Apple ID is linked is asked of the account service: the user
 * saved with the session is only refreshed with its token, so it can predate
 * a link made on another device. If that can't be reached, the saved user
 * decides.
 */
export async function deleteSignedIn(
  client: Client,
  storing: Promise<unknown> | null,
): Promise<void> {
  const { data } = await client.auth.getSession();
  const started = data.session;
  if (!started) throw new AuthError("unknown", "Not signed in");
  const tokenFor = async () => {
    const { data: now } = await client.auth.getSession();
    if (!now.session || now.session.user.id !== started.user.id)
      throw new AuthError("unknown", "Another account signed in during the deletion");
    return now.session.access_token;
  };
  const fresh = await within(
    client.auth.getUser(started.access_token).then(({ data: { user } }) => user),
    FRESH_USER_MS,
  );
  const user: User = fresh && fresh.id === started.user.id ? fresh : started.user;
  await deleteInOrder({
    storing,
    revokeApple: linkedToApple({ user })
      ? async () => revokeAppleTokens(client.functions, REVOKE_DEADLINE_MS, await tokenFor())
      : null,
    deleteAccount: async () => {
      const token = await tokenFor();
      await run(() => client.rpc("delete_account").setHeader("Authorization", `Bearer ${token}`));
    },
  });
}
