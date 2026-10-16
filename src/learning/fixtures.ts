/**
 * TEST DATA for the on-device mode (EXPO_PUBLIC_AUTH_MODE=local): the
 * automated tests, the web preview and the kit gallery. Never shipped as
 * content and never read in remote mode.
 *
 * Everything here hangs off the four sermons in the bundled sample
 * (src/data/sermons.ts), so focus segments and moments sit inside real
 * durations and real artwork shows. The quotes are verbatim spans from the
 * Apostle's transcripts (supabase/seed/paths.sql) but are attached to these
 * sample sermons only for testing: they are NOT what was said in them.
 * One path is published and one is a draft, so both honesty states show.
 * Two teaching series follow the paths (kind "series"): one of four
 * teachings (the live ones have 6 or 12) and one of a single teaching.
 */
import { sampleRecords } from "../data/sermons";
import { inDistress } from "../search/care";
import {
  LearningError,
  type Moment,
  type Need,
  type Path,
  type PathDay,
  type QuoteResult,
  type SearchMoment,
  type SearchResponse,
  type SearchSermon,
} from "./types";

// In the live order (supabase/migrations/20261016000100_home_order.sql):
// hope and growth first, sin, shame and temptation later.
export const fixtureNeeds: Need[] = [
  { id: "hear-god", label: "I want to hear God clearly", short: "Hearing God", theme: "hearing the voice of God", sort: 1 },
  { id: "fear", label: "I'm afraid of what's coming", short: "Fear", theme: "overcoming fear", sort: 3 },
  { id: "purpose", label: "I don't know what God wants for me", short: "My purpose", theme: "finding your purpose", sort: 4 },
  { id: "prayer", label: "My prayer life feels dry", short: "Prayer feels dry", theme: "a dry prayer life", sort: 5 },
  { id: "anxiety", label: "I can't stop worrying", short: "Anxiety", theme: "anxiety and worry", sort: 6 },
  { id: "waiting", label: "I'm tired of waiting on God", short: "Waiting on God", theme: "waiting on God's timing", sort: 8 },
  { id: "same-sin", label: "I keep falling into the same sin", short: "The same sin again", theme: "breaking a habit of sin", sort: 26 },
  { id: "shame", label: "I feel ashamed after I fall", short: "Shame after falling", theme: "shame after falling", sort: 27 },
  { id: "temptation", label: "I'm being tempted", short: "Temptation", theme: "resisting temptation", sort: 28 },
  { id: "self-control", label: "I want more self-control", short: "Self-control", theme: "mastering your appetites", sort: 29 },
];

const HABIT = "breaking-free-from-habitual-sin";
const WAIT = "learning-to-wait-on-god";
const SPIRIT = "knowing-the-holy-spirit";
const FACE = "seeking-the-face-of-god";

// In the live order too: waiting on God (4) before habitual sin (8).
export const fixturePaths: Path[] = [
  {
    id: WAIT,
    kind: "path",
    name: "Learning to wait on God",
    italic: "wait on God",
    promise: "Five days on staying faithful when God's promise seems slow.",
    why: "For anyone in a season where prayers seem unanswered and promises delayed: why God makes us wait, how he renews strength while we wait, and how to keep believing.",
    needs: ["waiting", "fear", "anxiety"],
    minutesPerDay: 14,
    status: "draft",
    sort: 4,
    dayCount: 5,
  },
  {
    id: HABIT,
    kind: "path",
    name: "Breaking free from habitual sin",
    italic: "habitual sin",
    promise: "Seven days from the grip of a repeated sin to the freedom grace gives.",
    why: "For the sin that keeps coming back: seven messages, one a day, from laying the weight aside to living from grace.",
    needs: ["same-sin", "temptation", "shame", "self-control"],
    minutesPerDay: 16,
    // Test data: published so the "Order set by the ministry" state shows.
    status: "published",
    sort: 8,
    dayCount: 7,
  },
  {
    id: SPIRIT,
    kind: "series",
    name: "Knowing the Holy Spirit",
    italic: "Holy Spirit",
    promise: "The Apostle's teachings on the person of the Holy Spirit, in the order they were given.",
    why: "Who the Holy Spirit is, how he speaks and how he leads: four teachings, each one whole, in the order the ministry set.",
    needs: [],
    minutesPerDay: 19,
    status: "published",
    sort: 101,
    dayCount: 4,
  },
  {
    id: FACE,
    kind: "series",
    name: "Seeking the face of God",
    italic: "face of God",
    promise: "One teaching on seeking God for who he is, not for what he gives.",
    why: "A single teaching, whole: what it means to seek God's face.",
    needs: [],
    minutesPerDay: 27,
    status: "published",
    sort: 105,
    dayCount: 1,
  },
];

// The four sample sermons: Day One 6441s, Grand Finale 8915s, Day Two
// Morning 10195s, Pray Without Ceasing 12914s.
const DAY_ONE = "WYiA7rjenVI";
const FINALE = "H9sRbSUt0YE";
const DAY_TWO = "yUDzMcZsVk8";
const PRAY = "nUW8NT2Pe88";

const day = (
  pathId: string,
  n: number,
  youtubeId: string,
  focusStart: number,
  focusEnd: number,
  theme: string,
  keyAt: number,
  keyTitle: string,
  keyQuote: string,
): PathDay => ({ pathId, day: n, youtubeId, focusStart, focusEnd, theme, keyAt, keyTitle, keyQuote });

export const fixtureDays: PathDay[] = [
  day(HABIT, 1, DAY_ONE, 1210, 2180, "Lay aside every weight", 1498, "Temptation is personal",
    "Temptation is idiosyncratic; temptation is particular to you."),
  day(HABIT, 2, FINALE, 3120, 4090, "Shut down the factory", 3405, "Dead to sin",
    "The accurate position that a Christian should sustain about sin is that he should be dead to it."),
  day(HABIT, 3, DAY_TWO, 2950, 4010, "Stop sin while it is a thought", 3224, "Victory over sin",
    "Bad actions are incubated through the outlet of the mind until they find expression in the womb of the heart."),
  day(HABIT, 4, PRAY, 5400, 6380, "Find the flesh's booster stations", 5710, "The root is self",
    "The foundation of all sin is self."),
  day(HABIT, 5, DAY_ONE, 3900, 4850, "Gain mastery over your appetites", 4120, "Learning to say no",
    "Any man that cannot say no to himself cannot say no to others."),
  day(HABIT, 6, FINALE, 6020, 6900, "When you fall, come boldly", 6300, "Mercy, then grace",
    "It's only those that have obtained mercy that can find grace."),
  day(HABIT, 7, DAY_TWO, 7600, 8540, "Living from grace", 7820, "What grace is not",
    "The antidote for sin cannot become the reason for sin."),
  day(WAIT, 1, PRAY, 2890, 3590, "God is a King, not a servant", 3408, "Waiting on a King",
    "The way up is waiting at the foot of the King until he stretches forth his scepter in your direction."),
  day(WAIT, 2, FINALE, 460, 1257, "He makes everything beautiful in its time", 784, "Beautiful in its time",
    "God doesn't live in time, but he will use time to test your soul."),
  day(WAIT, 3, DAY_ONE, 2920, 3694, "Strength renewed for the faint", 3004, "Power for the faint",
    "The specialty of God is that he gives power to the faint."),
  day(WAIT, 4, DAY_TWO, 3473, 4430, "Do not help God in the flesh", 3487, "Milk or wine",
    "Wine gets better with time; milk gets bad with time. So the question is, are you milk or are you wine?"),
  day(WAIT, 5, PRAY, 6380, 7170, "Keep the condition while you wait", 6878, "Keep the condition",
    "The proof that you believe in a conditional promise is that you are busy fulfilling the condition."),
  day(SPIRIT, 1, PRAY, 9000, 9900, "Prayer is fellowship", 9120, "Prayer is who we are",
    "Prayer is who we are and not what we do."),
  day(SPIRIT, 2, DAY_ONE, 5100, 5900, "The voice within", 5230, "The voice within",
    "That voice is not without. That voice is within."),
  day(SPIRIT, 3, DAY_TWO, 4100, 4900, "Victory begins inside", 4158, "Win in your soul",
    "If you win in your soul you will win on the ground; if you lose in your soul you will lose on the ground."),
  day(SPIRIT, 4, FINALE, 7300, 8100, "Bring it to prayer", 7410, "Anxiety into prayer",
    "Anything that is supposed to make you anxious is the same thing that should draw you to prayer."),
  day(FACE, 1, FINALE, 700, 1400, "Seek him for himself", 784, "Beautiful in its time",
    "God doesn't live in time, but he will use time to test your soul."),
];

const moment = (
  id: string,
  youtubeId: string,
  at: number,
  title: string,
  quote: string,
  needId: string | null,
  score: number,
): Moment => ({ id, youtubeId, needId, at, end: at + 40, title, quote, score });

export const fixtureMoments: Moment[] = [
  moment("fx-w1", DAY_ONE, 1498, "Temptation is personal", "Temptation is idiosyncratic; temptation is particular to you.", "temptation", 0.81),
  moment("fx-w2", DAY_ONE, 3004, "Power for the faint", "The specialty of God is that he gives power to the faint.", "waiting", 0.74),
  moment("fx-w3", DAY_ONE, 4120, "Learning to say no", "Any man that cannot say no to himself cannot say no to others.", "self-control", 0.78),
  moment("fx-w4", DAY_ONE, 5230, "The voice within", "That voice is not without. That voice is within.", "hear-god", 0.7),
  moment("fx-h1", FINALE, 784, "Beautiful in its time", "God doesn't live in time, but he will use time to test your soul.", "waiting", 0.77),
  moment("fx-h2", FINALE, 3405, "Dead to sin", "The accurate position that a Christian should sustain about sin is that he should be dead to it.", "same-sin", 0.86),
  moment("fx-h3", FINALE, 6300, "Mercy, then grace", "It's only those that have obtained mercy that can find grace.", "shame", 0.79),
  moment("fx-h4", FINALE, 7410, "Anxiety into prayer", "Anything that is supposed to make you anxious is the same thing that should draw you to prayer.", "anxiety", 0.8),
  moment("fx-y1", DAY_TWO, 3224, "Victory over sin", "Bad actions are incubated through the outlet of the mind until they find expression in the womb of the heart.", "same-sin", 0.88),
  moment("fx-y2", DAY_TWO, 3487, "Milk or wine", "Wine gets better with time; milk gets bad with time. So the question is, are you milk or are you wine?", "waiting", 0.72),
  moment("fx-y3", DAY_TWO, 4158, "Win in your soul", "If you win in your soul you will win on the ground; if you lose in your soul you will lose on the ground.", "fear", 0.76),
  moment("fx-y4", DAY_TWO, 4384, "Quietness within", "Do you have quietness within you? Because if you have quietness you will not feel any need to respond.", "anxiety", 0.73),
  moment("fx-y5", DAY_TWO, 7820, "What grace is not", "The antidote for sin cannot become the reason for sin.", "same-sin", 0.83),
  moment("fx-n1", PRAY, 3408, "Waiting on a King", "The way up is waiting at the foot of the King until he stretches forth his scepter in your direction.", "waiting", 0.75),
  moment("fx-n2", PRAY, 5710, "The root is self", "The foundation of all sin is self.", "same-sin", 0.84),
  moment("fx-n3", PRAY, 6878, "Keep the condition", "The proof that you believe in a conditional promise is that you are busy fulfilling the condition.", "waiting", 0.71),
  moment("fx-n4", PRAY, 9120, "Prayer is who we are", "Prayer is who we are and not what we do.", "prayer", 0.82),
];

/** A member partway through the published path, for the kit gallery. */
export const fixtureProgress = { pathId: HABIT, done: [1, 2], partial: 0.57 };

// ---- Fake Edge Functions ------------------------------------------------------

function searchSermon(youtubeId: string): SearchSermon {
  const record = sampleRecords.find((r) => r.youtube_id === youtubeId)!;
  return {
    youtubeId,
    title: record.title,
    headline: record.headline ?? record.title,
    publishedAt: record.published_at,
    preachedOn: record.preached_on,
    durationSeconds: record.duration_seconds,
    thumbnailUrl: record.thumbnail_url,
    speaker: record.speaker,
  };
}

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
const STOP = new Set(["the", "and", "for", "keep", "into", "about", "what", "want", "with", "can't", "don't", "i'm", "feel", "feels", "after", "again", "more", "same"]);

function overlap(a: Set<string>, b: Set<string>) {
  let n = 0;
  a.forEach((w) => {
    if (b.has(w) || [...b].some((x) => x.startsWith(w.slice(0, 4)))) n += 1;
  });
  return n;
}

/** The moment whose quote search "hasn't extracted yet", so quotes() fills it. */
const DEFERRED_SLOT = 2;

function wait(ms: number, signal?: AbortSignal, onAbort?: () => void) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new LearningError("aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      onAbort?.();
      if (searchFake().ignoreAbort) return;
      clearTimeout(timer);
      reject(new LearningError("aborted"));
    });
  });
}

/**
 * Development builds only: how the stand-in search should fail, so the
 * calm states (offline, too many searches, unavailable, nothing found) can
 * be seen and tested, or answer with sermons but no moments in them
 * ("sermons_only"). Set `globalThis.__aaoSearchFault`; null answers.
 */
type SearchFault = "offline" | "rate_limited" | "unavailable" | "empty" | "sermons_only";
function searchFault(): SearchFault | null {
  // (Unit tests run this file outside the app, where __DEV__ isn't defined.)
  if (typeof __DEV__ === "undefined" || !__DEV__) return null;
  return (globalThis as { __aaoSearchFault?: SearchFault | null }).__aaoSearchFault ?? null;
}

/**
 * Development builds only, for the loader and care tests: set
 * `globalThis.__aaoSearchFake`.
 * - delay: how long search takes, in ms (350 by default), for every question
 *   or per question (lower case);
 * - ignoreAbort: answer even after the app cancelled the request, as a
 *   network reply already on its way does;
 * - care: what the search says about distress, overriding the stand-in's
 *   own reading (false: an answer without the flag).
 * Each search is logged on `globalThis.__aaoSearchLog` as answered or aborted.
 */
type SearchFake = { delay?: number | Record<string, number>; ignoreAbort?: boolean; care?: boolean };
function searchFake(): SearchFake {
  if (typeof __DEV__ === "undefined" || !__DEV__) return {};
  return (globalThis as { __aaoSearchFake?: SearchFake }).__aaoSearchFake ?? {};
}
function logSearch(q: string, outcome: "answered" | "aborted" | "failed") {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  const g = globalThis as { __aaoSearchLog?: { q: string; outcome: string }[] };
  (g.__aaoSearchLog ??= []).push({ q, outcome });
}
function delayFor(query: string) {
  const { delay } = searchFake();
  if (typeof delay === "number") return delay;
  return delay?.[query.toLowerCase()] ?? 350;
}

/**
 * What the search function's model also reads as distress although the
 * plain wordings (search/care.ts) don't match, so the flag alone can be seen.
 */
const MODEL_CARE = /\b(hopeless|can'?t go on|give up on life)\b/i;
/** The search function's theme for someone in distress (CARE_THEME). */
const CARE_THEME = "finding hope and comfort in God";
/** Comforting teaching, never a search of the words as typed. */
const CARE_NEEDS = ["waiting", "anxiety", "fear"];

/** Deterministic stand-in for the "search" Edge Function. */
export async function fakeSearch(q: string, signal?: AbortSignal): Promise<SearchResponse> {
  const query = q.trim();
  if (!query || query.length > 200) throw new LearningError("bad_query");
  const tookMs = delayFor(query);
  await wait(tookMs, signal, () => logSearch(query, "aborted"));
  const fault = searchFault();
  const care = searchFake().care ?? (inDistress(query) || MODEL_CARE.test(query));
  if (fault === "rate_limited" || fault === "offline" || fault === "unavailable") {
    logSearch(query, "failed");
    throw new LearningError(fault, undefined, fault === "rate_limited" ? 60 : undefined);
  }
  logSearch(query, "answered");
  if (fault === "empty")
    return {
      query,
      understood: { theme: query.toLowerCase(), related: [] },
      path: null,
      care,
      moments: [],
      sermons: [],
      total: { moments: 0, sermons: 0 },
      cached: false,
      tookMs,
    };
  if (care) return careAnswer(query, tookMs);
  const asked = words(query);
  const ranked = [...fixtureNeeds]
    .map((need) => ({ need, n: overlap(asked, words(`${need.label} ${need.short} ${need.theme}`)) }))
    .sort((a, b) => b.n - a.n || a.need.sort - b.need.sort);
  const best = ranked[0].n > 0 ? ranked[0].need : null;
  const theme = best?.theme ?? query.toLowerCase().replace(/[?.!]+$/, "").slice(0, 60);
  const path = best ? fixturePaths.find((p) => p.needs.includes(best.id)) : undefined;
  // Needs the same path answers first, then the rest in editorial order.
  const kin = path ? fixtureNeeds.filter((need) => path.needs.includes(need.id)) : [];
  const related = [...kin, ...fixtureNeeds]
    .filter((need, i, all) => need.id !== best?.id && all.indexOf(need) === i)
    .slice(0, 3)
    .map((need) => need.short);

  const scored = fixtureMoments
    .map((m) => ({
      m,
      s: (best && m.needId === best.id ? 2 : 0) + overlap(asked, words(`${m.title} ${m.quote}`)) * 0.5 + (m.score ?? 0),
    }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 6);
  const moments: SearchMoment[] = scored.map(({ m, s }, i) =>
    toSearchMoment(m, Math.round(Math.min(1, s / 3) * 100) / 100, i === DEFERRED_SLOT ? null : m.quote),
  );

  const sermons = sermonsOf(moments);
  const only = fault === "sermons_only";
  return {
    query,
    understood: { theme, related },
    path: path
      ? { id: path.id, name: path.name, italic: path.italic, days: path.dayCount, status: path.status }
      : null,
    care: false,
    moments: only ? [] : moments,
    sermons,
    total: { moments: only ? 0 : moments.length, sermons: sermons.length },
    cached: false,
    tookMs,
  };
}

function toSearchMoment(m: Moment, score: number, quote: string | null = m.quote): SearchMoment {
  return {
    id: m.id,
    youtubeId: m.youtubeId,
    at: m.at,
    end: m.end,
    quote,
    excerpt: m.quote.toLowerCase().replace(/[^a-z0-9' ]+/g, " "),
    score,
    sermon: searchSermon(m.youtubeId),
  };
}

function sermonsOf(moments: SearchMoment[]) {
  const counts = new Map<string, number>();
  moments.forEach((m) => counts.set(m.youtubeId, (counts.get(m.youtubeId) ?? 0) + 1));
  return [...counts.entries()].map(([id, n]) => ({ ...searchSermon(id), moments: n }));
}

/**
 * Someone in distress, as the search function answers them: comforting
 * teaching, no path, and needs about fear and waiting to try next.
 */
function careAnswer(query: string, tookMs: number): SearchResponse {
  const moments = fixtureMoments
    .filter((m) => m.needId && CARE_NEEDS.includes(m.needId))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 4)
    .map((m) => toSearchMoment(m, m.score ?? 0));
  const sermons = sermonsOf(moments);
  const related = fixtureNeeds.filter((n) => CARE_NEEDS.includes(n.id)).map((n) => n.short);
  return {
    query,
    understood: { theme: CARE_THEME, related },
    path: null,
    care: true,
    moments,
    sermons,
    total: { moments: moments.length, sermons: sermons.length },
    cached: false,
    tookMs,
  };
}

/** Deterministic stand-in for the "quotes" Edge Function. */
export async function fakeQuotes(
  ids: string[],
  _q?: string,
  signal?: AbortSignal,
): Promise<Record<string, QuoteResult>> {
  await wait(600, signal);
  const out: Record<string, QuoteResult> = {};
  ids.slice(0, 14).forEach((id) => {
    const m = fixtureMoments.find((x) => x.id === id);
    out[id] = m ? { quote: m.quote, at: m.at } : null;
  });
  return out;
}
