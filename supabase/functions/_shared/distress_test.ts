// deno test _shared/distress_test.ts
// The full phrase table is in tests/search-care.spec.ts (the app runs this
// same file); these check it under Deno, as the search function runs it.
// Deno specifier; the app's ESLint resolver only knows Node modules.
// eslint-disable-next-line import/no-unresolved
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { DISTRESS_LIST_VERSION, inDistress, maybeDistress, normalise, readDistress } from "./distress.ts";
import { inDistress as fromPrompts, normalise as normaliseFromPrompts } from "./prompts.ts";

Deno.test("plain wordings, in each language, are care", () => {
  for (
    const q of [
      "I want to die",
      "I'm tired of living",
      "I can't go on",
      "nobody would miss me",
      "I wan die",
      "I don tire for this life",
      "je veux mourir",
      "Não quero mais viver",
      "vou me matar",
      "nataka kufa",
      "najiua",
    ]
  ) assertEquals(readDistress(q), "care", q);
});

Deno.test("despair that may mean it is maybe; teaching and grief are neither", () => {
  for (const q of ["I can't go on like this", "I feel hopeless", "je n'en peux plus", "nimechoka"]) {
    assertEquals(readDistress(q), "maybe", q);
  }
  for (
    const q of [
      "I want to die to my flesh",
      "I want to die daily",
      "ready to die for Christ",
      "suicide prevention sermon",
      "killing myself slowly with sin",
      "my father died",
      "",
    ]
  ) assertEquals(readDistress(q), null, q);
});

Deno.test("a devotional phrase is taken out, not the rest of the sentence", () => {
  assertEquals(inDistress("I want to die to self, I want to kill myself"), true);
  assertEquals(inDistress("I don't want to die but I don't want to live either"), true);
  assertEquals(maybeDistress("die to the world, everything feels pointless"), true);
});

Deno.test("wordings a devotional phrase hid, or an open wording over-read", () => {
  for (
    const q of [
      "I want to die every day",
      "I wanna die for god's sake",
      "suicide prevention hotline",
      "I feel like dying",
      "I took too many pills",
      "I wan drink sniper",
      "I don´t want to live",
      "I donʼt want to live",
    ]
  ) assertEquals(readDistress(q), "care", q);
  for (
    const q of ["I'm tired of living in sin", "I never wake up for prayer", "what's the point of life", "quero sumir"]
  ) {
    assertEquals(readDistress(q), "maybe", q);
  }
  for (
    const q of [
      "I feel like dying to self",
      "não quero morrer, estou doente",
      "no quiero morir",
      "breaking down strongholds",
      "God makes a way when there is no way out",
      "what's the point of fasting",
    ]
  ) assertEquals(readDistress(q), null, q);
});

Deno.test("the search function reads the same list and keys the cache the same way", () => {
  assertEquals(fromPrompts, inDistress);
  assertEquals(normaliseFromPrompts, normalise);
  assertEquals(normalise("  I’m TIRED, of living!! "), "i'm tired of living");
  assertEquals(Number.isInteger(DISTRESS_LIST_VERSION) && DISTRESS_LIST_VERSION >= 2, true);
});
