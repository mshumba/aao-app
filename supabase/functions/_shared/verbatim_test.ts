// deno test supabase/functions/_shared/verbatim_test.ts
// Deno specifier; the app's ESLint resolver only knows Node modules.
// eslint-disable-next-line import/no-unresolved
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { bestVerbatim, matchVerbatim, playFrom, snapToPassage, tidy, verbatimWords, wordTime } from "./verbatim.ts";

const passage =
  "and i tell you the grace of god is not a license to sin it is the power over sin so stop what you are doing don't wait come what me i will pray";

Deno.test("verbatimWords matches public.verbatim_words()", () => {
  assertEquals(verbatimWords("Don’t  wait—come, what me!"), ["dont", "wait", "come", "what", "me"]);
  assertEquals(verbatimWords("Acts 2:42"), ["acts", "2", "42"]);
  assertEquals(verbatimWords("  ...  "), []);
});

Deno.test("accepts a punctuated, capitalised verbatim run", () => {
  const m = matchVerbatim("I tell you, the grace of God is not a license to sin; it is the power over sin.", passage);
  assert(m);
  assertEquals(m.firstToken, 1);
  assertEquals(m.words, 19);
  assert(matchVerbatim("“Don't wait, come what me: I will pray.”", passage));
});

Deno.test("rejects changed, dropped, added or invented words", () => {
  assertEquals(matchVerbatim("The grace of God is not a licence to sin.", passage), null); // changed spelling
  assertEquals(matchVerbatim("The grace of God is not license to sin.", passage), null); // dropped word
  assertEquals(matchVerbatim("The grace of God is truly not a license to sin.", passage), null); // added word
  assertEquals(matchVerbatim("Come what may, I will pray today.", passage), null); // corrected + invented
  assertEquals(matchVerbatim("The grace of God ... power over sin.", passage), null); // ellipsis
  assertEquals(matchVerbatim("The grace of God is not [a] license.", passage), null); // brackets
  assertEquals(matchVerbatim("Grace of God.", passage), null); // too short
  assertEquals(matchVerbatim("ace of god is not a license", passage), null); // partial word
});

Deno.test("enforces the 45-word limit", () => {
  const long = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
  assertEquals(matchVerbatim(long, long), null);
  assert(matchVerbatim(long.split(" ").slice(0, 45).join(" "), long));
});

Deno.test("snapToPassage restores the transcript's own words", () => {
  // The model "corrected" a caption mistake: the result uses the caption word.
  const m = snapToPassage("Don't wait. Come what may, I will pray.", passage);
  assert(m);
  assertEquals(m.quote, "Don't wait. Come what me, I will pray.");
  assert(matchVerbatim(m.quote, passage));
  // Mostly invented text never snaps.
  assertEquals(snapToPassage("Faith comes by hearing and hearing by the word of God.", passage), null);
});

Deno.test("bestVerbatim keeps verbatim sentences when one is too long or changed", () => {
  const m = bestVerbatim("It is the power over sin. So stop what you are doing, do not wait.", passage);
  assert(m);
  assert(matchVerbatim(m.quote, passage));
});

Deno.test("tidy only changes capitals and closing punctuation", () => {
  assertEquals(tidy("i know god will do it i'm sure"), "I know God will do it I'm sure.");
  assertEquals(verbatimWords(tidy("so jesus said,")), verbatimWords("so jesus said"));
});

Deno.test("wordTime follows public.passage_word_time()", () => {
  const p = { seg_words: [0, 4, 9], seg_times: [100, 102, 106], words: 12, start_s: 100, end_s: 110 };
  assertEquals(wordTime(p, 0), 100);
  assertEquals(wordTime(p, 2), 101);
  assertEquals(wordTime(p, 4), 102);
  assertEquals(wordTime(p, 9), 106);
  assertEquals(wordTime(p, 10.5), 108);
  assertEquals(playFrom(p, 9), 103);
  assertEquals(playFrom(p, 1), 100); // never before the passage
  assertEquals(wordTime({ ...p, seg_words: [], seg_times: [] }, 5), 100);
});
