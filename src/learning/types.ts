import type { Sermon } from "../data/sermons";

/**
 * The data behind "What are you going through?" and guided paths, in the
 * app's terms. Table rows (snake_case, from Supabase) are mapped to these in
 * queries.ts; the Edge Function responses already use these names.
 */

/** Something a person is going through, phrased the way they would say it. */
export type Need = {
  id: string;
  /** The sentence: "I keep falling into the same sin". Used as the query. */
  label: string;
  /** The chip: "The same sin again". */
  short: string;
  /** What search understands it as: "breaking a habit of sin". */
  theme: string;
  sort: number;
};

/**
 * One of the topics people pick when they join, chosen by AI from what the
 * Apostle teaches (approved by the owner, 16 Oct 2026). A sermon that
 * clearly fits one is matched to it (Sermon.topic).
 */
export type Topic = {
  id: string;
  label: string;
  /** One line under the label in the picker. */
  description: string;
  /** The needs it suggests, most fitting first. */
  needIds: string[];
  /** The guided paths and series it suggests, in the order to suggest them. */
  pathIds: string[];
  sort: number;
};

/** A verified moment inside a sermon, with where to start playing. */
export type Moment = {
  id: string;
  youtubeId: string;
  needId: string | null;
  /** Seconds: where to start playing (about 3s before the quote). */
  at: number;
  end: number;
  /** A short title for the moment ("Victory over sin"). */
  title: string;
  /** A verbatim transcript span. Shown in curly quotes, never edited. */
  quote: string;
  score: number | null;
};

export type PathStatus = "draft" | "published";

/**
 * "path": a guided path, one message a day. "series": a teaching series,
 * the Apostle's teachings in order (its days are teachings).
 */
export type PathKind = "path" | "series";

/** A ministry-ordered series of days. Each day plays its whole sermon. */
export type Path = {
  id: string;
  kind: PathKind;
  name: string;
  /** The 1-3 word phrase of `name` set in italics (chosen editorially). */
  italic: string;
  /** One line: "Six days from the grip of a repeated sin to …". */
  promise: string;
  /** "Why this path": the page's one block of serif prose. */
  why: string;
  needs: string[];
  /**
   * The focus segments' average length. Data only: never show it as watch
   * time (a day plays its whole sermon; use the sermons' lengths).
   */
  minutesPerDay: number;
  /**
   * 'draft' must never claim "Order set by the ministry". Use TrustLine
   * (src/kit) or `trustLine()` (format.ts): only a published path gets the
   * line, and a draft shows nothing (no "Draft" label, at the owner's request).
   */
  status: PathStatus;
  sort: number;
  /** How many days the path has (from path_days). */
  dayCount: number;
};

/**
 * One day of a path: a sermon, played in full from where the Apostle starts
 * preaching. The focus segment inside it is kept as data (for overlays once
 * the ministry hosts its own video); the app doesn't show it or start there.
 */
export type PathDay = {
  pathId: string;
  day: number;
  youtubeId: string;
  /**
   * Seconds into the video where the day starts playing for a viewer with
   * no saved place in the sermon: where the Apostle starts preaching (from
   * the sermon's card), or the focus's start when the key moment comes
   * before that. Null when it isn't known: the day plays from the beginning.
   */
  teachingStart: number | null;
  /** Seconds into the video. Data only. */
  focusStart: number;
  focusEnd: number;
  /** Our editorial line for the day (not a quote): "Lay aside every weight". */
  theme: string;
  /** Where the key moment starts playing (about 3s before the quote). */
  keyAt: number;
  keyTitle: string;
  /** A verbatim transcript span. */
  keyQuote: string;
};

/** A day joined with its sermon from the catalogue (undefined while it syncs). */
export type PathDayWithSermon = PathDay & { sermon: Sermon | undefined };

// ---- Edge Function "search" ------------------------------------------------

/** A sermon as the search function describes it. */
export type SearchSermon = {
  youtubeId: string;
  /** The exact YouTube title (never shown in place of the headline). */
  title: string;
  /** The parsed headline: show this. */
  headline: string;
  publishedAt: string;
  preachedOn: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  speaker: string | null;
};

export type SearchMoment = {
  id: string;
  youtubeId: string;
  at: number;
  end: number;
  /**
   * A verbatim quote, or null while it hasn't been extracted yet: fetch it
   * with quotes() (useSearch does) and show a static placeholder meanwhile.
   * Never show `excerpt` as a quote.
   */
  quote: string | null;
  /** Raw lowercase transcript around the moment. For matching only. */
  excerpt: string;
  score: number;
  sermon: SearchSermon;
};

export type SearchResponse = {
  query: string;
  /** What search took the question to mean, and three related needs. */
  understood: { theme: string; related: string[] };
  /**
   * A path that answers this need, if one exists. `status` comes from search
   * v14 on; only a published one may say the ministry set its order, and a
   * draft carries no label.
   */
  path: { id: string; name: string; italic: string; days: number; status?: PathStatus } | null;
  /**
   * The person may be in distress (they said they want to die or to harm
   * themselves): the moments are comforting teaching, never a search of the
   * words as typed, and the screen offers help first. Search v14 on.
   */
  care?: boolean;
  /** At most 14. */
  moments: SearchMoment[];
  /** At most 10, with how many matching moments each holds. */
  sermons: (SearchSermon & { moments: number })[];
  total: { moments: number; sermons: number };
  /**
   * "curated": nothing could be searched by meaning (OpenAI failed), so the
   * needs' hand-picked moments stand in. From the search function of
   * 17 October 2026.
   */
  fallback?: "curated";
  cached: boolean;
  tookMs: number;
};

/** quotes(): a verbatim quote and where it starts, or null when none passed. */
export type QuoteResult = { quote: string; at: number } | null;

// ---- Errors ------------------------------------------------------------------

export type LearningErrorCode =
  /** No connection, or the request timed out. */
  | "offline"
  /**
   * Over a limit; `retryAfter` seconds until the next is allowed, and `scope`
   * whose: "everyone" (search is busy for everyone) or "caller" (this
   * account or connection).
   */
  | "rate_limited"
  /** The service isn't deployed or is down: show the calm unavailable state. */
  | "unavailable"
  /** The question was empty or over 200 characters. */
  | "bad_query"
  /** The caller cancelled (a newer search replaced it). Not shown. */
  | "aborted";

export class LearningError extends Error {
  code: LearningErrorCode;
  retryAfter?: number;
  scope?: "everyone" | "caller";
  constructor(code: LearningErrorCode, message?: string, retryAfter?: number, scope?: "everyone" | "caller") {
    super(message ?? code);
    this.name = "LearningError";
    this.code = code;
    this.retryAfter = retryAfter;
    this.scope = scope;
  }
}

// ---- Progress through paths --------------------------------------------------

export type Enrollment = {
  pathId: string;
  startedAt: string;
  finishedAt: string | null;
  /** Day numbers marked done, ascending. */
  done: number[];
};

/** The path someone is on now, and today's day. */
export type ActivePath = {
  path: Path;
  /** Today's day number: the first day not yet done. */
  day: number;
  /** Day numbers done, ascending. */
  done: number[];
  total: number;
  days: PathDayWithSermon[];
  /** The day to play now (days[day - 1]). */
  today: PathDayWithSermon | undefined;
  startedAt: string;
  /**
   * When the viewer last moved on in the path (a day done, or the start
   * before any), here or on another device: when today's day became due.
   * Null when the days done have no times (kept before 0.3.0).
   */
  dueSince: string | null;
};
