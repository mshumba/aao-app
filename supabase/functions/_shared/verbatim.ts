// Clean-verbatim quotes from YouTube auto-captions.
//
// The rule (approved by the owner, 15 October 2026). A quote shown in the app
// is a contiguous run of a passage's caption words with capitals and
// punctuation added, where two kinds of caption noise may be left out:
//   - filler sounds: uh, um, er, erm, ah, hmm, mm;
//   - an immediate repeat of 1-3 words, keeping one copy ("if if you" becomes
//     "if you", "we are we are" becomes "we are"), when it is a stutter and not
//     a repeat said on purpose ("very very", "holy holy holy", "pray every day
//     pray every day", "that that deliverance"): see isStutter().
// No other word is changed, added, reordered or left out, and a suspected
// caption mistake is never corrected: another span is chosen instead. A quote
// is 8-45 words and ends where a sentence ends.
//
// Words are compared the way public.verbatim_words() does in SQL: lower case,
// apostrophes dropped, any other non-alphanumeric character a word break. The
// word check is the same in three places, all tested on verbatim_cases.json:
// cleanSpan() here, clean_span() in the transcript pipeline
// (curated-sermons/pipelines/embeddings/aao_embed/verbatim.py), and
// public.is_clean_verbatim() in SQL, which the triggers on moments,
// passage_quotes and path_days run.

/** Lowercase words, apostrophes dropped, anything else non-alphanumeric a break. */
export function verbatimWords(text: string): string[] {
  const s = text
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return s ? s.split(" ") : [];
}

/** Filler sounds a quote may leave out. */
export const FILLERS: ReadonlySet<string> = new Set(["uh", "um", "er", "erm", "ah", "hmm", "mm"]);

export const MIN_WORDS = 8;
export const MAX_WORDS = 45;

// What a quote may contain besides the caption words: letters, digits, spaces
// and ordinary punctuation. No ellipses (they would hide left-out words), no
// brackets or symbols that could stand in for a word ("&").
const ALLOWED = /^[A-Za-z0-9 .,;:!?'"’‘“”—–-]+$/;
const allowedText = (s: string) => ALLOWED.test(s) && !s.includes("..");

export type Limits = { minWords?: number; maxWords?: number };

export type VerbatimMatch = {
  /** The quote as shown. */
  quote: string;
  /** Index, in passage text split on spaces, of the token holding the quote's first word. */
  firstToken: number;
  /** The same for the quote's last word. */
  lastToken: number;
  /** Number of words in the quote. */
  words: number;
};

// Small words a speaker restarts on; a 2-3 word repeat ending on one is a stutter.
const RESTART = new Set(
  ("a an the to of in on at for from with by as or but so if that this these those my your our their his her its " +
    "i you he she we they it me us him them is are was were be been am do does did dont doesnt didnt have has had " +
    "will would can could shall should must not im youre theyre ive thats there what who which when where how lets " +
    "know mean")
    .split(" "),
);

// Words a preacher doubles for emphasis ("very very", "no no", "holy holy").
const EMPHATIC = new Set(
  "very never no yes holy again more much really too ever amen hallelujah glory far long oh".split(" "),
);

/**
 * Whether the first copy of the n-word repeat starting at W[f] (W: the words
 * with fillers left out, the second copy at W[f + n]) is a stutter a quote may
 * leave out. A repeat said on purpose stays (fix of 15 October 2026):
 *  - 2-3 words: only a restart on a small word ("we are we are", "it's a it's
 *    a"), never with "and" ("again and again"); "pray every day pray every day"
 *    stays;
 *  - 1 word: never an emphatic word ("very very", "no no") or "had had"; never a
 *    word that isn't small said 3 or more times ("holy holy holy", "pray pray
 *    pray"; "he he he" goes); never "that that" before a word that isn't small
 *    ("doesn't mean that that deliverance": the second "that" points).
 * Same as public.is_clean_verbatim() and is_stutter() in the Python pipeline.
 */
export function isStutter(W: readonly string[], f: number, n: number): boolean {
  if (n > 1) {
    const unit = W.slice(f, f + n);
    return !unit.includes("and") && RESTART.has(unit[n - 1]);
  }
  const w = W[f];
  if (EMPHATIC.has(w) || w === "had") return false;
  if (!RESTART.has(w) && (W[f + 2] === w || (f > 0 && W[f - 1] === w))) return false;
  if (w === "that" && f + 2 < W.length && !RESTART.has(W[f + 2])) return false;
  return true;
}

/**
 * For each passage word j, where a quote may go on without using it: a filler
 * goes on to j + 1; the first copy of an immediate repeat of n = 1-3 words
 * (compared with fillers left out) that is a stutter (isStutter) goes on to the
 * second copy.
 */
function dropTargets(P: string[]): number[][] {
  const nf: number[] = []; // positions of the words that aren't fillers
  const fpos = P.map((w, j) => (FILLERS.has(w) ? -1 : nf.push(j) - 1)); // each word's index in nf
  const W = nf.map((j) => P[j]);
  return P.map((_, j) => {
    const f = fpos[j];
    if (f < 0) return [j + 1];
    const out: number[] = [];
    for (let n = 1; n <= 3 && f + 2 * n <= nf.length; n++) {
      let same = true;
      for (let i = 0; i < n && same; i++) same = W[f + i] === W[f + n + i];
      if (same && isStutter(W, f, n)) out.push(nf[f + n]);
    }
    return out;
  });
}

/**
 * The [first, last] passage-word indices of the run that becomes the quote's
 * words Q by leaving out only fillers and immediate repeats (the run that ends
 * earliest; the shortest such run when several do), or null. Q and P are
 * verbatimWords() lists.
 */
export function cleanSpan(Q: string[], P: string[]): [number, number] | null {
  const m = P.length;
  if (!Q.length || !m) return null;
  const drops = dropTargets(P);
  // start[j] >= 0: Q[0..k] is matched, the next passage word to use is j, and the run began at start[j].
  let start = new Int32Array(m + 1).fill(-1);
  let alive = false;
  for (let j = 0; j < m; j++) {
    if (P[j] === Q[0]) {
      start[j + 1] = j;
      alive = true;
    }
  }
  for (let k = 1; k < Q.length && alive; k++) {
    for (let j = 0; j < m; j++) {
      if (start[j] < 0) continue;
      for (const t of drops[j]) if (start[j] > start[t]) start[t] = start[j];
    }
    const next = new Int32Array(m + 1).fill(-1);
    alive = false;
    for (let j = 0; j < m; j++) {
      if (start[j] >= 0 && P[j] === Q[k]) {
        next[j + 1] = start[j];
        alive = true;
      }
    }
    start = next;
  }
  if (!alive) return null;
  for (let j = 1; j <= m; j++) if (start[j] >= 0) return [start[j], j - 1];
  return null;
}

/** The word rule alone, exactly as public.is_clean_verbatim() (no length or sentence rule). */
export function isCleanVerbatim(quote: string, passageText: string): boolean {
  const q = verbatimWords(quote);
  return q.length > 0 && allowedText(quote) && cleanSpan(q, verbatimWords(passageText)) !== null;
}

function clean(rawQuote: string): string {
  return rawQuote
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“”'‘’]+/, "")
    .replace(/["“”]+$/, "")
    .trim();
}

/** The passage's words, each with the space-separated token it came from. */
function passageWords(passageText: string): { words: string[]; tokenOf: number[]; tokens: string[] } {
  const tokens = passageText.split(" ");
  const words: string[] = [];
  const tokenOf: number[] = [];
  tokens.forEach((token, t) => {
    for (const w of verbatimWords(token)) {
      words.push(w);
      tokenOf.push(t);
    }
  });
  return { words, tokenOf, tokens };
}

/**
 * The quote, cleaned, and where it sits in the passage, or null when it breaks
 * the word rule or the length limits.
 */
export function matchClean(
  rawQuote: string,
  passageText: string,
  { minWords = MIN_WORDS, maxWords = MAX_WORDS }: Limits = {},
): VerbatimMatch | null {
  const quote = clean(rawQuote);
  if (!quote || !allowedText(quote)) return null;
  const want = verbatimWords(quote);
  if (want.length < minWords || want.length > maxWords) return null;
  const { words, tokenOf } = passageWords(passageText);
  const span = cleanSpan(want, words);
  if (!span) return null;
  return { quote, firstToken: tokenOf[span[0]], lastToken: tokenOf[span[1]], words: want.length };
}

// ---- Tidying ------------------------------------------------------------------

const PROPER = new Set(["god", "jesus", "christ", "lord", "bible", "i"]);
const I_CONTRACTION = /^i['’](m|ve|ll|d)$/;
const SENTENCE_END = /[.!?]["”’']*$/;

/**
 * Capitals and a closing full stop for caption words copied as they are:
 * the first letter, "I", God, Jesus and the like. Only letter case and
 * punctuation change.
 */
export function tidy(quote: string): string {
  let out = quote
    .split(" ")
    .map((token) => {
      const lower = token.toLowerCase();
      const word = lower.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
      const proper = PROPER.has(word) || I_CONTRACTION.test(lower.replace(/[^a-z'’]/g, ""));
      return proper && /^[a-z]/.test(token) ? token[0].toUpperCase() + token.slice(1) : token;
    })
    .join(" ");
  out = out.replace(/^([^A-Za-z0-9]*)([a-z])/, (_, lead: string, c: string) => lead + c.toUpperCase());
  out = out.replace(/[,;:—–-]+$/, "");
  if (/[A-Za-z0-9'’]$/.test(out)) out += ".";
  // Inner double quotation marks that don't pair up are dropped (punctuation only).
  if ((out.match(/"/g) ?? []).length % 2 || (out.match(/“/g) ?? []).length !== (out.match(/”/g) ?? []).length) {
    out = out.replace(/["“”]/g, "").replace(/ {2,}/g, " ").trim();
  }
  return out;
}

type Item = { text: string; words: string[] };

const capitalise = <T extends Item>(item: T): T => ({
  ...item,
  text: item.text.replace(/^([^A-Za-z0-9]*)([a-z])/, (_, lead: string, c: string) => lead + c.toUpperCase()),
});
const startsCapital = (s: string) => /^[^A-Za-z0-9]*[A-Z]/.test(s);

// One-word repeats with a comma between ("I, I tell you") are still stutters
// for these short words, which can't end a clause; for other words the comma
// marks emphasis ("pray, pray") or a new clause ("miss it, it means").
const STUTTER_PRONE = new Set(
  "a an and at but for from he i if in my of on or our she so the their they to we your".split(" "),
);

/**
 * Leaves out fillers and stutters, the caption noise the rule allows to drop:
 * every filler token, and the first copy of a 1-3 word repeat that is a
 * stutter (isStutter) with no punctuation in or after it (or only a comma
 * after a short word like "I" or "the"). Other repeats are kept as the
 * speaker's emphasis.
 */
function destutterItems<T extends Item>(items: T[]): T[] {
  const out: T[] = [];
  let capNext = false;
  for (const item of items) {
    const prev = out[out.length - 1];
    if (item.words.length === 1 && FILLERS.has(item.words[0])) {
      const end = item.text.match(/[.!?]+["”’']*$/)?.[0];
      if (end && prev && !SENTENCE_END.test(prev.text)) {
        out[out.length - 1] = { ...prev, text: prev.text.replace(/[,;:—–-]+$/, "") + end };
      }
      if (startsCapital(item.text) && (!prev || SENTENCE_END.test(prev.text))) capNext = true;
      continue;
    }
    out.push(capNext ? capitalise(item) : item);
    capNext = false;
  }
  for (let changed = true; changed;) {
    changed = false;
    scan: for (let i = 0; i < out.length; i++) {
      for (let n = 3; n >= 1; n--) {
        if (i + 2 * n > out.length) continue;
        const a = out.slice(i, i + n).flatMap((x) => x.words);
        const b = out.slice(i + n, i + 2 * n).flatMap((x) => x.words);
        if (a.length > 3 || a.join(" ") !== b.join(" ")) continue;
        // Only a stutter goes ("it's a it's a", "we are we are"); "what is passed
        // is passed", "again and again and again" and "very very" are said on purpose.
        const words = out.flatMap((x) => x.words);
        const at = out.slice(0, i).reduce((s, x) => s + x.words.length, 0);
        if (!isStutter(words, at, a.length)) continue;
        // punctuation inside the first copy marks emphasis too ("much, very much, very much")
        if (out.slice(i, i + n - 1).some((x) => !/[A-Za-z0-9'’]$/.test(x.text))) continue;
        const sep = out[i + n - 1].text;
        const nothing = /[A-Za-z0-9'’]$/.test(sep);
        const comma = n === 1 && /[,—–-]$/.test(sep) && STUTTER_PRONE.has(a[0]);
        if (!nothing && !comma) continue;
        const sentenceStart = i === 0 || SENTENCE_END.test(out[i - 1].text);
        const capital = startsCapital(out[i].text);
        out.splice(i, n);
        if (sentenceStart && capital) out[i] = capitalise(out[i]);
        changed = true;
        break scan;
      }
    }
  }
  return out;
}

/** A quote with its fillers and stutters left out (see destutterItems). */
export function destutter(quote: string): string {
  const items = clean(quote)
    .split(" ")
    .filter(Boolean)
    .map((text) => ({ text, words: verbatimWords(text) }))
    .filter((x) => x.words.length > 0);
  return tidy(destutterItems(items).map((x) => x.text).join(" "));
}

// ---- What a finished quote must look like -------------------------------------

// A sentence doesn't end on these ("...for the fight that I've.", "...the power of.").
const DANGLING_END = new Set(
  "a an the and or but nor of to than because if my your our their its i i'm i've i'd i'll im ive we're you're they're"
    .split(" "),
);
// Real one- and two-letter words; any other ("li", "St") is a broken caption word.
const SHORT_WORDS = new Set(
  "a i o am an as at be by do go he hi id if im in is it lo me mr dr my no of oh ok on or ox so to up us we ye"
    .split(" "),
);

/**
 * Why a finished quote can't be shown, or null: "characters", "length" (8-45
 * words), "no_sentence_end", "dangling_end" (ends on "of", "the", "I've"...),
 * or "garbled" (a one- or two-letter non-word).
 */
export function quoteProblem(
  quote: string,
  { minWords = MIN_WORDS, maxWords = MAX_WORDS }: Limits = {},
): string | null {
  if (!quote || !allowedText(quote)) return "characters";
  const n = verbatimWords(quote).length;
  if (n < minWords || n > maxWords) return "length";
  if (!SENTENCE_END.test(quote)) return "no_sentence_end";
  const bare = (t: string) =>
    t.toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "").replace(/^'+|'+$/g, "");
  const tokens = quote.split(" ").filter(Boolean);
  if (DANGLING_END.has(bare(tokens[tokens.length - 1]))) return "dangling_end";
  if (tokens.some((t) => /^[a-z]{1,2}$/.test(bare(t)) && !SHORT_WORDS.has(bare(t)))) return "garbled";
  return null;
}

// ---- Building a quote from the model's pick -------------------------------------

export type Timing = {
  seg_words: number[];
  seg_times: number[];
  words: number;
  start_s: number;
  end_s: number;
};

export type QuotePassage = Timing & { text: string };

/**
 * Seconds between two words (caption-line timing, spread evenly over a line's
 * words) that mark a break: music, a long pause. A quote doesn't run across one.
 */
const PAUSE_S = 3;

type Built = Item & { token: number; edited: boolean };

/**
 * The quote to show for the model's pick, rebuilt from the transcript's own
 * words, or null.
 *
 * The model's words are aligned with the passage's (local alignment; a filler
 * or stutter it left out costs nothing). The stretch it meant is then rebuilt
 * from the caption tokens, with the model's capitals and punctuation wherever
 * its word is the caption's word, and fillers and stutters left out. Where the
 * model changed, added or left out a real word, it was correcting the captions:
 * those sentences are not used. The result is the whole pick when it is clean,
 * or else the longest run of its whole sentences that is: 8-45 words, ending a
 * sentence (quoteProblem), not across a pause of more than 5 s, and passing the
 * word rule again (matchClean).
 */
export function buildQuote(rawQuote: string, p: QuotePassage, limits: Limits = {}): VerbatimMatch | null {
  const quote = clean(rawQuote);
  const qTokens = quote.split(" ").filter(Boolean);
  const qWords: string[] = [];
  const qTok: number[] = [];
  qTokens.forEach((token, t) => {
    for (const w of verbatimWords(token)) {
      qWords.push(w);
      qTok.push(t);
    }
  });
  const { words: P, tokenOf, tokens } = passageWords(p.text);
  const n = qWords.length;
  const m = P.length;
  if (n < 3 || m === 0 || n > 120) return null;

  // A word the model may leave out: a filler, or part of the first copy of a repeat.
  const droppable = new Array<boolean>(m).fill(false);
  dropTargets(P).forEach((targets, j) => {
    if (FILLERS.has(P[j])) droppable[j] = true;
    for (const t of targets) for (let x = j; x < t; x++) droppable[x] = true;
  });

  // Smith-Waterman: same word +2, changed word -1, the model's extra word -1,
  // a passage word the model left out -1 (0 when it may be left out).
  const H: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  const skip = (j: number) => (droppable[j] ? 0 : -1);
  let best = 0;
  let bi = 0;
  let bj = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = H[i - 1][j - 1] + (qWords[i - 1] === P[j - 1] ? 2 : -1);
      const v = Math.max(0, diag, H[i - 1][j] - 1, H[i][j - 1] + skip(j - 1));
      H[i][j] = v;
      if (v > best) {
        best = v;
        bi = i;
        bj = j;
      }
    }
  }
  if (best === 0) return null;
  const same = new Map<number, number>(); // passage word -> the model's word, where it is the same word
  const edited = new Array<boolean>(m).fill(false);
  let i = bi;
  let j = bj;
  let first = bj - 1;
  const last = bj - 1;
  while (i > 0 && j > 0 && H[i][j] > 0) {
    const s = H[i][j];
    const eq = qWords[i - 1] === P[j - 1];
    if (s === H[i - 1][j - 1] + (eq ? 2 : -1)) {
      if (eq) same.set(j - 1, i - 1);
      else edited[j - 1] = true;
      first = j - 1;
      i--;
      j--;
    } else if (s === H[i - 1][j] - 1) {
      edited[Math.min(j, last)] = true; // the model added a word here
      i--;
    } else {
      if (!droppable[j - 1]) edited[j - 1] = true;
      first = j - 1;
      j--;
    }
  }
  // The model's opening words didn't line up: the stretch would start mid-sentence.
  if (i > 0) edited[first] = true;
  if (same.size < Math.ceil(n * 0.75)) return null;

  // Rebuild the stretch from the caption tokens, leaving out the fillers and
  // stutters the model left out.
  const items: Built[] = [];
  let w = tokenOf.indexOf(tokenOf[first]);
  for (let t = tokenOf[first]; t <= tokenOf[last]; t++) {
    const ws = verbatimWords(tokens[t]);
    if (!ws.length) continue;
    let piece = tokens[t].replace(/[^A-Za-z0-9.,;:!?'"’‘“”—–-]+/g, " ").trim();
    let changed = false;
    let leftOut = true;
    for (let x = 0; x < ws.length; x++) {
      changed ||= edited[w + x];
      leftOut &&= droppable[w + x] && !same.has(w + x);
    }
    if (leftOut) {
      w += ws.length;
      continue;
    }
    if (ws.length === 1) {
      const qi = same.get(w);
      const borrowed = qi === undefined ? null : qTokens[qTok[qi]];
      if (borrowed && verbatimWords(borrowed).length === 1 && ALLOWED.test(borrowed) && !borrowed.includes("..")) {
        piece = borrowed;
      }
    }
    items.push({ text: piece, words: ws, token: t, edited: changed });
    w += ws.length;
  }
  const kept = destutterItems(items);
  if (!kept.length) return null;

  // Sentence ends (the model's punctuation) and breaks (long pauses) between items.
  const brk = kept.map((x, k) => k > 0 && wordTime(p, x.token) - wordTime(p, kept[k - 1].token) > PAUSE_S);
  const ends: number[] = []; // item index after which a sentence ends
  kept.forEach((x, k) => {
    if (SENTENCE_END.test(x.text)) ends.push(k);
  });
  const tryRange = (a: number, b: number): VerbatimMatch | null => {
    // items a..b inclusive; b must end a sentence in the model's own punctuation
    if (!SENTENCE_END.test(kept[b].text)) return null;
    for (let k = a; k <= b; k++) if (kept[k].edited || (k > a && brk[k])) return null;
    const text = tidy(kept.slice(a, b + 1).map((x) => x.text).join(" "));
    if (quoteProblem(text, limits)) return null;
    const m2 = matchClean(text, p.text, limits);
    return m2 ? { ...m2, firstToken: kept[a].token, lastToken: kept[b].token } : null;
  };
  const whole = tryRange(0, kept.length - 1);
  if (whole) return whole;
  let pick: VerbatimMatch | null = null;
  const starts = [0, ...ends.map((e) => e + 1)].filter((s) => s < kept.length);
  for (const a of starts) {
    for (const b of ends) {
      if (b < a || (a === 0 && b === kept.length - 1)) continue;
      const got = tryRange(a, b);
      if (got && (!pick || got.words > pick.words)) pick = got;
    }
  }
  return pick;
}

// ---- Timing ---------------------------------------------------------------------

/**
 * Seconds at which word k (0-based, passage text split on spaces) starts,
 * interpolated within its caption line. Same as public.passage_word_time().
 */
export function wordTime(p: Timing, k: number): number {
  const segWords = p.seg_words ?? [];
  const segTimes = p.seg_times ?? [];
  if (segWords.length === 0) return p.start_s;
  const kk = Math.max(k, 0);
  let line = 0;
  for (let i = 0; i < segWords.length; i++) if (segWords[i] <= kk) line = i;
  const t0 = segTimes[line];
  const t1 = line + 1 < segTimes.length ? segTimes[line + 1] : p.end_s;
  const w0 = segWords[line];
  const w1 = line + 1 < segWords.length ? segWords[line + 1] : p.words;
  return t0 + ((t1 - t0) * (Math.min(kk, p.words) - w0)) / Math.max(w1 - w0, 1);
}

/**
 * Where to start playing a quote: 3 s before its first word, so the listener
 * hears it come in. Only 0 limits it: a quote that opens its passage still gets
 * its lead-in from the passage before.
 */
export function playFrom(p: Timing, firstToken: number): number {
  const at = Math.max(wordTime(p, firstToken) - 3, 0);
  return Math.round(at * 100) / 100;
}
