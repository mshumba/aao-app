import { authHeaders, fetchWithTimeout, learningMode, restBase } from "../learning/session";
import { readJSON, writeJSON } from "../lib/storage";

/**
 * The blessings (approved 15 October 2026: text only, no audio, the Bible
 * reference when there is one). A new one each time the blessing screen
 * shows, none repeated until every one has been seen on this device. All of
 * them are kept on the device, so one is ready at once and offline; the
 * list is refreshed quietly once a launch.
 */

export type Blessing = { id: string; text: string; scriptureRef: string | null };

type Row = { id: string; text: string; scripture_ref: string | null };
type Shown = { id: string; at: number };

const KEYS = {
  /** Every published blessing, as last fetched. */
  all: "aao.blessings.v1",
  /** Ids already shown on this device, since the list last went round. */
  seen: "aao.blessings.seen.v1",
  /** The one shown last on this device, and when ({ id, at }). */
  last: "aao.blessings.last.v1",
};

const TIMEOUT = 10_000;
/** The list is fetched again after this long (an app kept open for days). */
const REFRESH_MS = 6 * 60 * 60 * 1000;

/**
 * TEST DATA for the on-device mode (EXPO_PUBLIC_AUTH_MODE=local): six of
 * the approved blessings, word for word, with and without a reference. The
 * last is the longest of all of them (185 characters), so the screen's
 * tightest layout can be seen and tested.
 */
export const fixtureBlessings: Blessing[] = [
  {
    id: "bl-9994-0",
    text: "A little one will become a thousand, a small one will become a strong nation; though thy beginning be small, thy later end shall greatly increase.",
    scriptureRef: "Isaiah 60:22; Job 8:7",
  },
  {
    id: "bl-82336-67",
    text: "Arise shine for your light is come and the glory of the Lord is risen upon you.",
    scriptureRef: "Isaiah 60:1",
  },
  {
    id: "bl-80650-59",
    text: "The Lord increase your greatness and comfort you on every side.",
    scriptureRef: "Psalm 71:21",
  },
  {
    id: "bl-4867-64",
    text: "The hand of Jesus will rest upon you and his glory will cause your face to shine.",
    scriptureRef: null,
  },
  {
    id: "bl-49470-36",
    text: "His love shall be a covering around you.",
    scriptureRef: null,
  },
  {
    id: "bl-62623-32",
    text: "The Lord shall guide thee continually and satisfy thy soul in drought, and make fat thy bones, and thou shall be like a watered garden, and like a spring of water whose waters fail not.",
    scriptureRef: "Isaiah 58:11",
  },
];

/** `select id, text, scripture_ref from blessings order by sort` (published rows only, by RLS). */
async function fetchBlessings(): Promise<Blessing[]> {
  const response = await fetchWithTimeout(
    `${restBase}/blessings?select=id,text,scripture_ref&order=sort.asc`,
    { headers: { ...(await authHeaders(null)), Accept: "application/json" }, timeoutMs: TIMEOUT },
  );
  if (!response.ok) throw new Error(`blessings failed (${response.status})`);
  return clean((await response.json()) as Row[]);
}

function clean(rows: unknown): Blessing[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Row & { scriptureRef?: string | null } =>
      !!r && typeof r.id === "string" && typeof r.text === "string" && !!r.text.trim(),
    )
    .map((r) => {
      const ref = r.scripture_ref ?? r.scriptureRef ?? null;
      return { id: r.id, text: r.text.trim(), scriptureRef: typeof ref === "string" && ref.trim() ? ref.trim() : null };
    });
}

/**
 * The next blessing: one not yet seen on this device, at random; once every
 * one has been seen, the round starts again (never the one just shown).
 * Returns the blessing and the ids seen after it.
 */
export function nextBlessing(
  all: readonly Blessing[],
  seen: readonly string[],
  last: string | null,
  random = Math.random,
): { blessing: Blessing | null; seen: string[] } {
  if (!all.length) return { blessing: null, seen: [...seen] };
  const ids = new Set(all.map((b) => b.id));
  let done = seen.filter((id) => ids.has(id));
  let left = all.filter((b) => !done.includes(b.id));
  if (!left.length) {
    done = [];
    left = all.filter((b) => b.id !== last);
    if (!left.length) left = [...all];
  }
  const blessing = left[Math.floor(random() * left.length) % left.length];
  return { blessing, seen: [...done, blessing.id] };
}

/** "Blessing: The Lord increase your greatness…. Psalm 71:21" for screen readers. */
export function spokenBlessing(blessing: Blessing) {
  const text = blessing.text.replace(/[.\s]+$/, "");
  return blessing.scriptureRef ? `Blessing: ${text}. ${blessing.scriptureRef}` : `Blessing: ${text}.`;
}

// ---- The device's copy -----------------------------------------------------------

let all: Blessing[] = [];
let seen: string[] = [];
let last: Shown | null = null;
/** The one on the blessing screen now (or last), picked by takeBlessing. */
let current: Blessing | null = null;
let primed: Promise<void> | null = null;
let refreshing: Promise<void> | null = null;
let refreshedAt = 0;

/**
 * Reads the kept list, the ids seen and the last one shown, once a launch.
 * Storage that can't be read leaves the defaults (see lib/storage).
 */
export function primeBlessings(): Promise<void> {
  primed ??= (async () => {
    const [kept, seenIds, shown] = await Promise.all([
      learningMode === "local" ? fixtureBlessings : readJSON<unknown>(KEYS.all, []),
      readJSON<unknown>(KEYS.seen, []),
      readJSON<unknown>(KEYS.last, null),
    ]);
    // A refresh that finished first has the newer list.
    if (!all.length) all = clean(kept);
    seen = Array.isArray(seenIds) ? seenIds.filter((id): id is string => typeof id === "string") : [];
    const s = shown as Partial<Shown> | null;
    last = s && typeof s.id === "string" && typeof s.at === "number" ? { id: s.id, at: s.at } : null;
  })();
  return primed;
}

/**
 * Fetches the published list and keeps it on the device: at launch, and
 * again when the app comes back after six hours or more. Offline or not
 * deployed, the device's copy stands.
 */
export function refreshBlessings(): Promise<void> {
  if (learningMode === "local") return primeBlessings();
  if (refreshing) return refreshing;
  if (refreshedAt && Date.now() - refreshedAt < REFRESH_MS) return Promise.resolve();
  refreshing = (async () => {
    try {
      const fresh = await fetchBlessings();
      if (!fresh.length) return;
      all = fresh;
      refreshedAt = Date.now();
      await writeJSON(KEYS.all, fresh);
    } catch {
      // The kept copy (if any) stands; tried again next time.
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Whether there's a blessing to show (the list has been read or fetched). */
export function hasBlessings() {
  return all.length > 0;
}

/**
 * Picks the next blessing (see nextBlessing) and records it as shown now:
 * the ids seen and the last one, kept on the device.
 */
export function takeBlessing(now = Date.now()): Blessing | null {
  const next = nextBlessing(all, seen, last?.id ?? current?.id ?? null);
  if (!next.blessing) return null;
  current = next.blessing;
  seen = next.seen;
  last = { id: current.id, at: now };
  void writeJSON(KEYS.seen, seen);
  void writeJSON(KEYS.last, last);
  return current;
}

/** The blessing picked last (null before the first this launch). */
export function currentBlessing() {
  return current;
}

/** When a blessing was last shown on this device (ms), or null. */
export function lastShownAt() {
  return last?.at ?? null;
}
