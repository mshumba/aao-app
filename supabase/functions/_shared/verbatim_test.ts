// deno test --allow-read supabase/functions/_shared/verbatim_test.ts
// The cases in verbatim_cases.json are shared with the Python pipeline
// (tests/test_verbatim.py) and checked against public.is_clean_verbatim() in SQL.
// Deno specifier; the app's ESLint resolver only knows Node modules.
// eslint-disable-next-line import/no-unresolved
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import {
  buildQuote,
  cleanSpan,
  destutter,
  isCleanVerbatim,
  matchClean,
  playFrom,
  quoteProblem,
  tidy,
  verbatimWords,
  wordTime,
} from "./verbatim.ts";

type Cases = {
  check: { p: string; q: string; ok: boolean; why: string }[];
  destutter: { in: string; out: string }[];
  problem: { q: string; problem: string | null }[];
  build: {
    why: string;
    p: string;
    model: string;
    quote: string | null;
    first_token?: number;
    seg_words?: number[];
    seg_times?: number[];
    end_s?: number;
  }[];
  play_from: {
    why: string;
    seg_words: number[];
    seg_times: number[];
    words: number;
    start_s: number;
    end_s: number;
    first_token: number;
    at: number;
  }[];
};

const cases: Cases = JSON.parse(await Deno.readTextFile(new URL("./verbatim_cases.json", import.meta.url)));

Deno.test("verbatimWords matches public.verbatim_words()", () => {
  assertEquals(verbatimWords("Don’t  wait—come, what me!"), ["dont", "wait", "come", "what", "me"]);
  assertEquals(verbatimWords("Acts 2:42"), ["acts", "2", "42"]);
  assertEquals(verbatimWords("  ...  "), []);
});

Deno.test("shared cases: the clean-verbatim word rule", () => {
  for (const c of cases.check) assertEquals(isCleanVerbatim(c.q, c.p), c.ok, c.why);
});

Deno.test("cleanSpan finds where the quote sits", () => {
  const P = verbatimWords("and so we are we are going to see the hand of god");
  assertEquals(cleanSpan(verbatimWords("we are going to see"), P), [4, 8]); // the shortest run
  assertEquals(cleanSpan(verbatimWords("so we are going"), P), [1, 6]);
  assertEquals(cleanSpan(verbatimWords("hand of the god"), P), null);
});

Deno.test("matchClean enforces 8-45 words", () => {
  const p = "if if you want to see the glory of god you must pray";
  assert(matchClean("If you want to see the glory of God, you must pray.", p));
  assertEquals(matchClean("The glory of God.", p), null);
  const long = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
  assertEquals(matchClean(long, long), null);
  assert(matchClean(long.split(" ").slice(0, 45).join(" "), long));
});

Deno.test("shared cases: destutter", () => {
  for (const c of cases.destutter) assertEquals(destutter(c.in), c.out, c.in);
});

Deno.test("shared cases: quoteProblem", () => {
  for (const c of cases.problem) assertEquals(quoteProblem(c.q), c.problem, c.q);
});

Deno.test("shared cases: buildQuote", () => {
  for (const c of cases.build) {
    const words = c.p.split(" ").length;
    const p = {
      text: c.p,
      words,
      start_s: c.seg_times?.[0] ?? 0,
      end_s: c.end_s ?? words * 0.4,
      seg_words: c.seg_words ?? [0],
      seg_times: c.seg_times ?? [0],
    };
    const m = buildQuote(c.model, p);
    assertEquals(m?.quote ?? null, c.quote, c.why);
    if (m) {
      assertEquals(m.firstToken, c.first_token, c.why);
      assert(isCleanVerbatim(m.quote, c.p), c.why);
      assertEquals(quoteProblem(m.quote), null, c.why);
    }
  }
});

Deno.test("tidy only changes capitals and punctuation", () => {
  assertEquals(tidy("i know god will do it i'm sure"), "I know God will do it I'm sure.");
  assertEquals(verbatimWords(tidy("so jesus said,")), verbatimWords("so jesus said"));
  assertEquals(tidy('He said, "come.'), "He said, come.");
});

Deno.test("wordTime follows public.passage_word_time()", () => {
  const p = { seg_words: [0, 4, 9], seg_times: [100, 102, 106], words: 12, start_s: 100, end_s: 110 };
  assertEquals(wordTime(p, 0), 100);
  assertEquals(wordTime(p, 2), 101);
  assertEquals(wordTime(p, 4), 102);
  assertEquals(wordTime(p, 9), 106);
  assertEquals(wordTime(p, 10.5), 108);
  assertEquals(wordTime({ ...p, seg_words: [], seg_times: [] }, 5), 100);
});

Deno.test("shared cases: playFrom", () => {
  for (const c of cases.play_from) assertEquals(playFrom(c, c.first_token), c.at, c.why);
});
