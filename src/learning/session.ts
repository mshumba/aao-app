import { Platform } from "react-native";
import { authMode, supabaseConfig } from "../auth/config";
import { SESSION_KEY, secureSessionStorage } from "../auth/sessionStorage";

/**
 * Where learning data comes from. "remote": the Supabase project (tables
 * through REST, search through Edge Functions). "local": the test fixtures
 * in fixtures.ts, for the on-device account mode (development and the
 * automated tests), so nothing leaves the device.
 */
export const learningMode: "remote" | "local" =
  authMode !== "local" && supabaseConfig.url && supabaseConfig.key ? "remote" : "local";

export const restBase = `${supabaseConfig.url.replace(/\/+$/, "")}/rest/v1`;
export const functionsBase = `${supabaseConfig.url.replace(/\/+$/, "")}/functions/v1`;
export const publishableKey = supabaseConfig.key;

type StoredSession = { access_token?: string; expires_at?: number; user?: { id?: string } };

async function storedSession(): Promise<StoredSession | null> {
  const raw =
    Platform.OS === "web"
      ? (globalThis as { localStorage?: Storage }).localStorage?.getItem(SESSION_KEY) ?? null
      : await secureSessionStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as StoredSession) : null;
}

/** A usable token from a stored session: null when missing or about to expire. */
function usable(session: StoredSession | null) {
  if (!session?.access_token) return null;
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 15_000) return null;
  return session.access_token;
}

/** Whose token it is: the session's user, else the token's own subject. */
function ownerOf(session: StoredSession, token: string) {
  if (session.user?.id) return session.user.id;
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(payload)) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

/**
 * The signed-in viewer's access token, read from where the account's
 * Supabase client keeps its session (Keychain/Keystore on native,
 * localStorage on web; see auth/sessionStorage.ts and supabaseBackend.ts).
 * That client refreshes the token and writes it back there, so this never
 * creates a second client or refreshes on its own. Null for guests, and
 * for a token about to expire (the client renews it when the app is active;
 * callers try again later).
 *
 * TODO(auth owner): export an `accessToken()` (or the client) from
 * supabaseBackend.ts and swap this body for it.
 */
export async function accessToken(): Promise<string | null> {
  if (learningMode !== "remote") return null;
  try {
    return usable(await storedSession());
  } catch {
    return null;
  }
}

/**
 * The same, only when the session belongs to `owner` (the account's user
 * id). Path progress syncs with this, so one account's changes never go
 * out with another's token while accounts change.
 */
export async function accessTokenFor(owner: string): Promise<string | null> {
  if (learningMode !== "remote") return null;
  try {
    const session = await storedSession();
    const token = usable(session);
    return token && session && ownerOf(session, token) === owner ? token : null;
  } catch {
    return null;
  }
}

/** Headers for the REST API and Edge Functions, as the viewer when signed in. */
export async function authHeaders(token?: string | null): Promise<Record<string, string>> {
  const bearer = token === undefined ? await accessToken() : token;
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${bearer ?? publishableKey}`,
  };
}

/** fetch with a timeout that also honours the caller's AbortSignal. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = 15_000, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const forward = () => controller.abort("caller");
  if (signal) {
    if (signal.aborted) controller.abort("caller");
    else signal.addEventListener("abort", forward);
  }
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}
