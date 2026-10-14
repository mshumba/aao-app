import { keys, readJSON, removeKey, writeJSON } from "../lib/storage";

/**
 * What a guest was doing when they were asked to create an account, so it
 * can carry on once they have one. Persisted because web sign-in with Apple
 * or Google leaves the page and comes back to /auth/callback.
 */
export type Intent =
  | { kind: "watch"; sermonId: string }
  | { kind: "save"; sermonId: string };

type Stored = { intent: Intent; at: number };

// An intent older than this is from an abandoned attempt, not this one.
const MAX_AGE = 30 * 60 * 1000;

let pending: Stored | null = null;

const fresh = (stored: Stored | null) =>
  !!stored && Date.now() - stored.at <= MAX_AGE;

export function setPendingIntent(intent: Intent | null) {
  pending = intent ? { intent, at: Date.now() } : null;
  if (pending) writeJSON(keys.pendingIntent, pending);
  else removeKey(keys.pendingIntent);
}

/** Returns and clears the pending intent, if one is still fresh. */
export async function takePendingIntent(): Promise<Intent | null> {
  const stored = pending ?? (await readJSON<Stored | null>(keys.pendingIntent, null));
  setPendingIntent(null);
  return fresh(stored) ? stored!.intent : null;
}

/** The pending intent held in memory, without clearing it. */
export function peekPendingIntent(): Intent | null {
  return fresh(pending) ? pending!.intent : null;
}

/**
 * The pending intent without clearing it, from storage when memory is empty
 * (after a web reload), so the sign-up sheet can still name the sermon.
 */
export async function readPendingIntent(): Promise<Intent | null> {
  if (pending) return peekPendingIntent();
  const stored = await readJSON<Stored | null>(keys.pendingIntent, null);
  if (!fresh(stored)) return null;
  // Back in memory, so the sync peek agrees from here on.
  pending = pending ?? stored;
  return stored!.intent;
}

let runner: ((intent: Intent) => void) | null = null;

/** The app registers how to carry out an intent (it needs the player). */
export function registerIntentRunner(run: ((intent: Intent) => void) | null) {
  runner = run;
}

export function runIntent(intent: Intent) {
  runner?.(intent);
}

/* ------------------------------------------------------------------------ */
/* Sign-ins that leave the app                                               */
/* ------------------------------------------------------------------------ */

/**
 * Where a sign-in that leaves the page should continue when it comes back to
 * /auth/callback: onboarding's name step rather than the screen underneath.
 * Web Apple and Google sign-ins reload the app, so it's kept in storage.
 */
export type AuthReturn = "onboarding";

// Under the app's own "aao." key prefix, like the keys in lib/storage.
const RETURN_KEY = "aao.authReturn.v1";
const RETURN_MAX_AGE = 30 * 60 * 1000;

type StoredReturn = { to: AuthReturn; at: number };

export function setAuthReturn(to: AuthReturn | null) {
  if (to) writeJSON(RETURN_KEY, { to, at: Date.now() } satisfies StoredReturn);
  else removeKey(RETURN_KEY);
}

/** Returns and clears where to continue, if it was set recently. */
export async function takeAuthReturn(): Promise<AuthReturn | null> {
  const stored = await readJSON<StoredReturn | null>(RETURN_KEY, null);
  removeKey(RETURN_KEY);
  if (!stored || Date.now() - stored.at > RETURN_MAX_AGE) return null;
  return stored.to === "onboarding" ? "onboarding" : null;
}
