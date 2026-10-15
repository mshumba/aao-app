// Verbatim quotes from YouTube auto-captions.
//
// A quote shown in the app must be a contiguous run of a passage's caption
// words: only capitalisation and punctuation may be added. Both sides are
// reduced to lowercase words exactly as public.verbatim_words() does in SQL
// (apostrophes dropped, any other non-alphanumeric character a word break),
// and the quote's words must appear in the passage's words, in order, with
// nothing skipped. The database triggers on moments and passage_quotes run
// the same check again, so a quote that slips past this code is still refused.

/** Lowercase words, apostrophes dropped, anything else non-alphanumeric a break. */
export function verbatimWords(text: string): string[] {
  const s = text
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return s ? s.split(" ") : [];
}

// What a quote may contain besides the caption words: letters, digits, spaces
// and ordinary punctuation. No ellipses (they would hide skipped words), no
// brackets or symbols that could stand in for a word ("&").
const ALLOWED = /^[A-Za-z0-9 .,;:!?'"’‘“”—–-]+$/;

export type Limits = { minWords?: number; maxWords?: number };

export type VerbatimMatch = {
  /** The cleaned quote (wrapping quotation marks and extra spaces removed). */
  quote: string;
  /** Index, in passage text split on spaces, of the quote's first word. */
  firstToken: number;
  /** Number of caption words in the quote. */
  words: number;
};

function clean(rawQuote: string): string {
  return rawQuote
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“”'‘’]+/, "")
    .replace(/["“”]+$/, "")
    .trim();
}

/** The passage's normalised words, each with the space-separated token it came from. */
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
 * The quote, cleaned, and where it starts in the passage, or null when it is
 * not a verbatim run of the passage's words (or breaks the length limits).
 */
export function matchVerbatim(
  rawQuote: string,
  passageText: string,
  { minWords = 5, maxWords = 45 }: Limits = {},
): VerbatimMatch | null {
  const quote = clean(rawQuote);
  if (!quote || !ALLOWED.test(quote) || quote.includes("..")) return null;
  const want = verbatimWords(quote);
  if (want.length < minWords || want.length > maxWords) return null;
  const { words, tokenOf } = passageWords(passageText);
  outer: for (let i = 0; i + want.length <= words.length; i++) {
    for (let j = 0; j < want.length; j++) {
      if (words[i + j] !== want[j]) continue outer;
    }
    return { quote, firstToken: tokenOf[i], words: want.length };
  }
  return null;
}

const PROPER = new Set(["god", "jesus", "christ", "lord", "bible", "i"]);
const I_CONTRACTION = /^i['\u2019](m|ve|ll|d)$/;

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
  out = out.replace(/^[a-z]/, (c) => c.toUpperCase());
  out = out.replace(/[,;:—–-]+$/, "");
  if (/[A-Za-z0-9'’]$/.test(out)) out += ".";
  return out;
}

const DANGLING = new Set(
  "a an and are as at be but by for from has have he her his i in is it its my of on or our she so that the their them they to was we were with you your"
    .split(" "),
);

/**
 * When the model changed a word or two (corrected a caption mistake, dropped
 * a repeated word), use the transcript's own words for the stretch it meant,
 * keeping the model's capitals and punctuation only where its word is the
 * same caption word. The stretch is found by local alignment of the quote's
 * words against the passage; at least 75% of the quote's words must line up,
 * and the result is checked with matchVerbatim like any other quote.
 */
export function snapToPassage(rawQuote: string, passageText: string, limits: Limits = {}): VerbatimMatch | null {
  const quote = clean(rawQuote);
  const qTokens = quote.split(" ").filter(Boolean);
  // quote words, each with its token when that token is exactly one word
  const qWords: string[] = [];
  const qToken: (string | null)[] = [];
  for (const token of qTokens) {
    const ws = verbatimWords(token);
    ws.forEach((w) => {
      qWords.push(w);
      qToken.push(ws.length === 1 && ALLOWED.test(token) && !token.includes("..") ? token : null);
    });
  }
  const { words: P, tokenOf, tokens } = passageWords(passageText);
  const n = qWords.length;
  const m = P.length;
  if (n < 3 || m === 0 || n > 120) return null;

  // Smith-Waterman: match +2, mismatch -1, gap -1.
  const H: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  let best = 0;
  let bi = 0;
  let bj = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = H[i - 1][j - 1] + (qWords[i - 1] === P[j - 1] ? 2 : -1);
      const v = Math.max(0, diag, H[i - 1][j] - 1, H[i][j - 1] - 1);
      H[i][j] = v;
      if (v > best) {
        best = v;
        bi = i;
        bj = j;
      }
    }
  }
  if (best === 0) return null;
  // Trace back, recording which passage word each matched quote word is.
  const aligned = new Map<number, number>(); // passage word index -> quote word index
  const swapped = new Map<number, number>(); // the same, where the model changed the word
  let i = bi;
  let j = bj;
  let first = bj - 1;
  while (i > 0 && j > 0 && H[i][j] > 0) {
    const s = H[i][j];
    if (s === H[i - 1][j - 1] + (qWords[i - 1] === P[j - 1] ? 2 : -1)) {
      (qWords[i - 1] === P[j - 1] ? aligned : swapped).set(j - 1, i - 1);
      first = j - 1;
      i--;
      j--;
    } else if (s === H[i - 1][j] - 1) {
      i--;
    } else {
      first = j - 1;
      j--;
    }
  }
  let last = bj - 1;
  if (aligned.size < Math.ceil(n * 0.75)) return null;
  // Don't end on "of" or "the" where the model's last word didn't line up.
  while (last > first && DANGLING.has(P[last])) last--;
  const spanWords = last - first + 1;
  if (spanWords > Math.round(n * 1.25) + 2) return null;

  // Rebuild from the passage's tokens, borrowing the model's token (its
  // capitals and punctuation) wherever it is the same single caption word,
  // and only the punctuation around it where the model changed the word.
  const out: string[] = [];
  for (let t = tokenOf[first]; t <= tokenOf[last]; t++) {
    const ws = verbatimWords(tokens[t]);
    if (ws.length === 0) continue;
    // a caption token's own symbols ("$", "&") become spaces: same words
    let piece = tokens[t].replace(/[^A-Za-z0-9.,;:!?'"\u2019\u2018\u201C\u201D\u2014\u2013-]+/g, " ").trim();
    if (ws.length === 1) {
      const pi = tokenOf.indexOf(t);
      const qi = aligned.get(pi);
      const borrowed = qi === undefined ? null : qToken[qi];
      if (borrowed && verbatimWords(borrowed)[0] === ws[0]) piece = borrowed;
      const si = swapped.get(pi);
      const around = si === undefined ? null : qToken[si];
      if (around && /^[A-Za-z0-9'’]+$/.test(piece)) {
        const lead = around.match(/^[^A-Za-z0-9]*/)?.[0] ?? "";
        const trail = around.match(/[^A-Za-z0-9]*$/)?.[0] ?? "";
        piece = `${lead}${piece}${trail}`;
      }
    }
    if (piece) out.push(piece);
  }
  return matchVerbatim(tidy(out.join(" ")), passageText, limits);
}

/**
 * The best honest quote from what the model gave: its quote when verbatim;
 * else the same stretch in the transcript's own words (snapToPassage); else
 * the longest run of its whole sentences that is verbatim. Whatever comes back
 * passed matchVerbatim, so it is a contiguous verbatim span of the passage.
 */
export function bestVerbatim(rawQuote: string, passageText: string, limits: Limits = {}): VerbatimMatch | null {
  const whole = matchVerbatim(rawQuote, passageText, limits);
  if (whole) return { ...whole, quote: tidy(whole.quote) };
  const snapped = snapToPassage(rawQuote, passageText, limits);
  if (snapped) return snapped;
  const sentences = clean(rawQuote)
    .split(/(?<=[.!?]["”]?)\s+/)
    .filter(Boolean);
  let best: VerbatimMatch | null = null;
  for (let a = 0; a < sentences.length; a++) {
    for (let b = sentences.length; b > a; b--) {
      if (a === 0 && b === sentences.length) continue;
      const m = matchVerbatim(sentences.slice(a, b).join(" "), passageText, limits);
      if (m && (!best || m.words > best.words)) best = m;
    }
  }
  return best ? { ...best, quote: tidy(best.quote) } : null;
}

export type Timing = {
  seg_words: number[];
  seg_times: number[];
  words: number;
  start_s: number;
  end_s: number;
};

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

/** Where to start playing a quote: about 3 s before it, inside the passage. */
export function playFrom(p: Timing, firstToken: number): number {
  const at = Math.max(wordTime(p, firstToken) - 3, p.start_s, 0);
  return Math.round(at * 100) / 100;
}
