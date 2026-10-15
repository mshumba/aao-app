import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { authHeaders, fetchWithTimeout, learningMode, restBase } from "../learning/session";
import { readJSON, writeJSON } from "../lib/storage";

/**
 * The blessing on Home (approved 15 October 2026: text only, no audio, the
 * Bible reference when there is one). A new one each time the app is
 * opened or comes back to the front, none repeated until every one has been
 * seen on this device. All of them are kept on the device, so one shows at
 * once and offline; the list is refreshed quietly behind it.
 */

export type Blessing = { id: string; text: string; scriptureRef: string | null };

type Row = { id: string; text: string; scripture_ref: string | null };

const KEYS = {
  /** Every published blessing, as last fetched. */
  all: "aao.blessings.v1",
  /** Ids already shown on this device, since the list last went round. */
  seen: "aao.blessings.seen.v1",
};

const TIMEOUT = 10_000;

/**
 * TEST DATA for the on-device mode (EXPO_PUBLIC_AUTH_MODE=local): five of
 * the approved blessings, word for word, with and without a reference.
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
];

/** `select id, text, scripture_ref from blessings order by sort` (published rows only, by RLS). */
async function fetchBlessings(): Promise<Blessing[]> {
  const response = await fetchWithTimeout(
    `${restBase}/blessings?select=id,text,scripture_ref&order=sort.asc`,
    { headers: { ...(await authHeaders(null)), Accept: "application/json" }, timeoutMs: TIMEOUT },
  );
  if (!response.ok) throw new Error(`blessings failed (${response.status})`);
  const rows = (await response.json()) as Row[];
  return rows
    .filter((r) => r && typeof r.id === "string" && typeof r.text === "string" && r.text.trim())
    .map((r) => ({ id: r.id, text: r.text.trim(), scriptureRef: r.scripture_ref?.trim() || null }));
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

// One blessing per time the app is in front: Home remounting (signing out,
// say) keeps it; coming back from the background brings a new one.
let shown: Blessing | null = null;

/** The blessing to show now, or null until there is one (never a placeholder). */
export function useBlessing(): Blessing | null {
  const [blessing, setBlessing] = useState<Blessing | null>(shown);
  const all = useRef<Blessing[]>([]);
  const picking = useRef(false);

  useEffect(() => {
    let alive = true;

    async function pick() {
      if (picking.current || !all.current.length) return;
      picking.current = true;
      try {
        const seen = await readJSON<string[]>(KEYS.seen, []);
        const next = nextBlessing(all.current, Array.isArray(seen) ? seen : [], shown?.id ?? null);
        if (!next.blessing) return;
        shown = next.blessing;
        if (alive) setBlessing(next.blessing);
        await writeJSON(KEYS.seen, next.seen);
      } finally {
        picking.current = false;
      }
    }

    async function load() {
      if (learningMode === "local") {
        all.current = fixtureBlessings;
        if (!shown) await pick();
        return;
      }
      const cached = await readJSON<Blessing[]>(KEYS.all, []);
      if (Array.isArray(cached) && cached.length) {
        all.current = cached;
        if (!shown) await pick();
      }
      try {
        const fresh = await fetchBlessings();
        if (!fresh.length) return;
        all.current = fresh;
        await writeJSON(KEYS.all, fresh);
        // The first launch (nothing kept yet), or the one showing was withdrawn.
        if (!shown || !fresh.some((b) => b.id === shown?.id)) await pick();
      } catch {
        // Offline or not deployed: the device's copy stands.
      }
    }

    load();
    let state = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      if (state.match(/inactive|background/) && next === "active") pick();
      state = next;
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return blessing;
}

/** "Blessing: The Lord increase your greatness…. Psalm 71:21" for screen readers. */
export function spokenBlessing(blessing: Blessing) {
  const text = blessing.text.replace(/[.\s]+$/, "");
  return blessing.scriptureRef ? `Blessing: ${text}. ${blessing.scriptureRef}` : `Blessing: ${text}.`;
}
