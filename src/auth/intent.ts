import { keys, readJSON, removeKey, writeJSON } from "../lib/storage";

/**
 * What a guest was doing when they were asked to create an account, so it
 * can carry on once they have one. Persisted because web sign-in with Apple
 * or Google leaves the page and comes back to /auth/callback.
 */
export type Intent =
  | { kind: "watch"; sermonId: string }
  | { kind: "save"; sermonId: string };

/**
 * `id` names this attempt: the sign-up sheet opened for it carries the same
 * id, so a sheet opened for something else never picks it up.
 */
type Stored = { intent: Intent; at: number; id: string };

// An intent older than this is from an abandoned attempt, not this one.
const MAX_AGE = 30 * 60 * 1000;

let pending: Stored | null = null;

const fresh = (stored: Stored | null) =>
  !!stored && Date.now() - stored.at <= MAX_AGE;

/** Keeps (or with null, clears) the pending intent; returns its id. */
export function setPendingIntent(intent: Intent | null): string | null {
  pending = intent
    ? {
        intent,
        at: Date.now(),
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      }
    : null;
  if (pending) writeJSON(keys.pendingIntent, pending);
  else removeKey(keys.pendingIntent);
  return pending?.id ?? null;
}

/** Returns and clears the pending intent, if one is still fresh. */
export async function takePendingIntent(): Promise<Intent | null> {
  const stored = pending ?? (await readJSON<Stored | null>(keys.pendingIntent, null));
  setPendingIntent(null);
  return fresh(stored) ? stored!.intent : null;
}

/** The pending intent held in memory, if it's the one with this id. */
export function peekPendingIntent(id: string | undefined): Intent | null {
  return id && fresh(pending) && pending!.id === id ? pending!.intent : null;
}

/**
 * The pending intent with this id, without clearing it, from storage when
 * memory is empty (after a web reload), so the sign-up sheet can still name
 * the sermon.
 */
export async function readPendingIntent(id: string | undefined): Promise<Intent | null> {
  if (pending) return peekPendingIntent(id);
  const stored = await readJSON<Stored | null>(keys.pendingIntent, null);
  if (!id || !fresh(stored) || stored!.id !== id) return null;
  // Back in memory, so the sync peek agrees from here on.
  pending = pending ?? stored;
  return stored!.intent;
}

/**
 * Forgets an intent left in storage by an earlier launch: the app or tab
 * was closed part-way through signing up, so nothing is waiting on it.
 */
export function forgetEarlierIntent() {
  if (!pending) removeKey(keys.pendingIntent);
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
