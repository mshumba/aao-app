import { readJSON, writeJSON } from "../lib/storage";

/**
 * Which finished days the viewer has already been told about ("Day 3
 * done."), per account and path, on this device, and when the path page
 * last showed them. The page compares this with the days done when it comes
 * to the front, and shows the Day complete sheet for a day that's new since.
 */
const KEY = "aao.paths.seenDone.v2";

export type SeenRecord = { days: number[]; at: number };
type Seen = Record<string, Record<string, SeenRecord>>;

let cache: Seen | null = null;
let loading: Promise<Seen> | null = null;

function load() {
  if (cache) return Promise.resolve(cache);
  loading ??= readJSON<Seen>(KEY, {}).then((value) => {
    cache = value && typeof value === "object" ? value : {};
    return cache;
  });
  return loading;
}

/** What this path's page last showed, or null when it has never been opened here. */
export async function seenDone(owner: string, pathId: string): Promise<SeenRecord | null> {
  const all = await load();
  const record = all[owner]?.[pathId];
  return record && Array.isArray(record.days) ? record : null;
}

export async function markSeen(owner: string, pathId: string, days: readonly number[]) {
  const all = await load();
  all[owner] = { ...all[owner], [pathId]: { days: [...days], at: Date.now() } };
  await writeJSON(KEY, all);
}

/**
 * A day was just done on this device (its sermon watched, or marked done)
 * before this path's page was ever open here: note the days done before
 * it, so the page's first visit still says "Day 3 done." Days done long
 * ago, or on another device, never get the sheet.
 */
export async function noteDayDone(owner: string, pathId: string, before: readonly number[]) {
  const all = await load();
  if (all[owner]?.[pathId]) return;
  all[owner] = { ...all[owner], [pathId]: { days: [...before], at: Date.now() } };
  await writeJSON(KEY, all);
}
