import { useEffect, useState } from "react";
import { readJSON, writeJSON } from "../lib/storage";
import { fakeCard } from "./fixtures";
import { fetchCard } from "./queries";
import { learningMode } from "./session";
import type { SermonCard } from "./types";

/**
 * A sermon's card (public.sermon_cards), read when its page opens; the
 * catalogue sync leaves the cards out. Kept on the device as moments are:
 * the copy shows at once, a fresh one is read once it's old, and the
 * sermons read most recently are kept. It fails quietly: offline with no
 * copy, or a sermon without a card, is null, and the page shows nothing.
 */

const KEY = "aao.learning.cards.v1";
/** A card is read again after this long (they change only when the sermons are read again). */
const STALE_MS = 24 * 60 * 60 * 1000;
/** How many sermons' cards the device keeps. */
const KEEP = 40;

/** null: the sermon has no card. */
type Stamped = { at: number; data: SermonCard | null };

let cache: Record<string, Stamped> = {};
let stored: Promise<void> | null = null;
const inflight = new Map<string, Promise<SermonCard | null>>();

/** One read at a time per sermon; what it finds is kept on the device. */
function refresh(youtubeId: string) {
  let pending = inflight.get(youtubeId);
  if (!pending) {
    pending = (learningMode === "local" ? fakeCard(youtubeId) : fetchCard(youtubeId))
      .then((card) => {
        cache[youtubeId] = { at: Date.now(), data: card };
        // Keep the most recently read sermons only.
        cache = Object.fromEntries(
          Object.entries(cache)
            .sort((a, b) => b[1].at - a[1].at)
            .slice(0, KEEP),
        );
        writeJSON(KEY, cache);
        return card;
      })
      .finally(() => inflight.delete(youtubeId));
    inflight.set(youtubeId, pending);
  }
  return pending;
}

/** Hands `show` the device's copy, then a fresh card when the copy is missing or old. */
async function load(youtubeId: string, show: (card: SermonCard | null) => void) {
  stored ??= readJSON<Record<string, Stamped>>(KEY, {}).then((kept) => {
    cache = { ...kept, ...cache };
  });
  await stored;
  const kept = cache[youtubeId];
  if (kept) show(kept.data);
  if (kept && Date.now() - kept.at < STALE_MS) return;
  try {
    show(await refresh(youtubeId));
  } catch {
    // Offline or not deployed: keep any copy; otherwise no card.
  }
}

const same = (a: SermonCard | null, b: SermonCard | null) => JSON.stringify(a) === JSON.stringify(b);

/** The sermon's card; null while it's on its way, and when there's none to show. */
export function useSermonCard(youtubeId: string) {
  const [shown, setShown] = useState(() => ({ id: youtubeId, card: cache[youtubeId]?.data ?? null }));
  useEffect(() => {
    let alive = true;
    load(youtubeId, (card) => {
      if (!alive) return;
      setShown((was) => (was.id === youtubeId && same(was.card, card) ? was : { id: youtubeId, card }));
    });
    return () => {
      alive = false;
    };
  }, [youtubeId]);
  return shown.id === youtubeId ? shown.card : null;
}
