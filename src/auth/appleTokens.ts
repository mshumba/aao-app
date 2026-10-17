import type { Session, SupabaseClient } from "@supabase/supabase-js";

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

const FUNCTION = "apple-tokens";

/** The longest deleting an account waits on Apple before going ahead. */
export const REVOKE_DEADLINE_MS = 10_000;
/** The longest it waits first for a code sent by a sign-in just before. */
export const STORING_WAIT_MS = 10_000;
const STORE_DEADLINE_MS = 15_000;

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

/** The account has an Apple ID linked, so the server may hold a token for it. */
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
 * retried there once the account is gone.
 */
export async function revokeAppleTokens(
  functions: Functions,
  deadlineMs = REVOKE_DEADLINE_MS,
): Promise<boolean> {
  try {
    const { data, error } = await functions.invoke(FUNCTION, {
      body: { action: "revoke" },
      timeout: deadlineMs,
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
    if (steps.storing) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        steps.storing.catch(() => {}),
        new Promise((resolve) => {
          timer = setTimeout(resolve, steps.waitMs ?? STORING_WAIT_MS);
        }),
      ]);
      clearTimeout(timer);
    }
    await steps.revokeApple().catch(() => {});
  }
  await steps.deleteAccount();
}
