// Rate limits for search and quotes. Each is an Edge Function secret, with
// these defaults when it isn't set (supabase/functions/README.md, "Limits",
// explains how they follow from an OpenAI monthly budget). Only calls that
// would reach OpenAI count: cached answers, need chips with stored vectors and
// cached quotes are free.

import type { Caller } from "./auth.ts";
import { envInt, type Limit } from "./db.ts";

export const LIMIT_DEFAULTS = {
  /** Uncached searches an hour, everyone together: about $1.20 an hour of OpenAI at most. */
  SEARCH_GLOBAL_PER_HOUR: 3000,
  /** Uncached searches per signed-in person, per 5 minutes. */
  SEARCH_USER_PER_5MIN: 30,
  /** Uncached searches per guest address, per 5 minutes. One address can be a whole church's Wi-Fi or a mobile network. */
  SEARCH_GUEST_PER_5MIN: 120,
  /**
   * Distress searches an hour that get the model's reading. They are never
   * refused: past this they get the care card and the comfort list without it.
   */
  SEARCH_CARE_PER_HOUR: 300,
  /** quotes calls an hour that reach the model, everyone together: about $4.80 an hour at most. */
  QUOTES_GLOBAL_PER_HOUR: 600,
  QUOTES_USER_PER_5MIN: 30,
  QUOTES_GUEST_PER_5MIN: 120,
} as const;

export type LimitName = keyof typeof LIMIT_DEFAULTS;

export const setting = (name: LimitName) => envInt(name, LIMIT_DEFAULTS[name]);

/** The caller's own allowance, then the one everyone shares (checked in that order). */
export function searchLimits(who: Caller): Limit[] {
  return [
    { key: who.key, max: setting(who.signedIn ? "SEARCH_USER_PER_5MIN" : "SEARCH_GUEST_PER_5MIN"), windowSeconds: 300 },
    { key: "search:all", max: setting("SEARCH_GLOBAL_PER_HOUR"), windowSeconds: 3600 },
  ];
}

/** Someone in distress: one shared allowance for the model's reading, never a refusal. */
export function careLimits(): Limit[] {
  return [{ key: "search:care", max: setting("SEARCH_CARE_PER_HOUR"), windowSeconds: 3600 }];
}

export function quotesLimits(who: Caller): Limit[] {
  return [
    { key: who.key, max: setting(who.signedIn ? "QUOTES_USER_PER_5MIN" : "QUOTES_GUEST_PER_5MIN"), windowSeconds: 300 },
    { key: "quotes:all", max: setting("QUOTES_GLOBAL_PER_HOUR"), windowSeconds: 3600 },
  ];
}

/**
 * Who a refusal is about, for the app's message: "everyone" when the shared
 * allowance (the last limit) said no ("Search is busy for everyone right
 * now"), "caller" when it was the caller's own. `refused` counts from 1.
 */
export function scopeOf(limits: Limit[], refused: number): "everyone" | "caller" {
  return limits.length > 1 && refused === limits.length ? "everyone" : "caller";
}
