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

Deno.test("the second review's wordings: for God sake, poison, kms, stop living, sleep", () => {
  for (
    const q of [
      "I want to die for God sake",
      "I wan die for God sake",
      "I want to die for Jesus Christ's sake",
      "I want to stop living",
      "I drank poison",
      "what is the point of living",
      "I wish I wasn't alive",
      "I hope I don't wake up tomorrow",
      "I took a handful of pills",
      "I want to kms",
      "estoy cansado de vivir",
      "I wish I could fall asleep and never wake up",
    ]
  ) assertEquals(readDistress(q), "care", q);
  for (
    const q of [
      "what's the point of my life",
      "no way out",
      "I see no way out of this",
      "life is so unbearable",
      "I keep breaking down",
      "what if I sleep and never wake up",
      "I don't want to sleep and never wake up",
    ]
  ) assertEquals(readDistress(q), "maybe", q);
  for (
    const q of [
      "dying for Christ's sake",
      "unforgiveness is like drinking poison",
      "I want to stop living in fear",
      "pray I don't wake up late",
      "what is the point of prayer",
      "there is no way out of hell",
      "the world is falling apart",
    ]
  ) assertEquals(readDistress(q), null, q);
});

Deno.test("the third review's wordings: prayers to die, means, misspellings, fillers, languages", () => {
  for (
    const q of [
      // A wish or prayer to die
      "I hope I die",
      "I pray to die",
      "Lord just let me die",
      "I pray God takes my life tonight",
      "I wish I'd died",
      "I deserve to die",
      "I keep wanting to die",
      // Other plain wordings
      "I want my life to end",
      "I want to off myself",
      "the world would be better off if I was gone",
      "I wish I'd never been born",
      "i might kms",
      // Means
      "I want to jump in front of a train",
      "I want to jump off the third mainland bridge",
      "how many pills does it take to die",
      "I wan drink otapiapia",
      "I've been cutting again",
      "I burn myself",
      // Misspelt, without "to", a filler after the whole thought, odd apostrophes
      "i want 2 die",
      "sucide",
      "I want die",
      "I just feel to die",
      "I just want to stop living abeg",
      "I hope I don't wake up tomorrow honestly",
      "I donʹt want to live",
      "I can t go on anymore",
      "I don''t want to live",
      // Languages
      "je voudrais mourir",
      "je vais me pendre",
      "queria morrer",
      "quero me enforcar",
      "me quiero matar",
      "ojalá me muera",
      "nataka nife",
      "nitajinyonga",
      "Na only die remain for me",
      "I don taya for this life",
    ]
  ) assertEquals(readDistress(q), "care", q);
  for (
    const q of [
      "I keep thinking about dying",
      "I wanted to die last night",
      "Lord take me now",
      "why am I still alive",
      "I give up for real",
      "what's the point of living like this",
      "no point in living without Christ",
      "je veux disparaître",
      "não vejo sentido na vida",
      "ya no aguanto más",
      "nimekata tamaa",
      "I wan end am",
      "I bought sniper",
    ]
  ) assertEquals(readDistress(q), "maybe", q);
  for (
    const q of [
      "God did not let me die",
      "I pray I die at a good old age",
      "cross my heart and hope to die",
      "If I should die before I wake, I pray the Lord my soul to take",
      "take my life and let it be",
      "Lord take my life I surrender all",
      "don't give up on life",
      "are you ready to die",
      "how to end my life of sin",
      "did Jesus want to die",
      "what is the point of living a holy life",
      "no reason to live in fear",
      "I cut myself off from church",
      "I keep shooting myself in the foot",
      "burning myself out for ministry",
      "throw myself out of my comfort zone",
      "cutting back on sugar during the fast",
      "should I stop taking my pills and trust God for healing",
      "a light that shines in a dark place",
      "I can't go on without God",
      "Lord take me higher",
      "Samsoni alijiua",
      "quiero morir a mi mismo",
      "prefiero morir que pecar",
      "me voy a morir de risa",
      "I want to dye my hair for church",
    ]
  ) assertEquals(readDistress(q), null, q);
  // Still care although they look like the teaching phrases above.
  for (
    const q of [
      "Lord take my life and let it be over",
      "I didn't want to die but now I do",
      "quiero morir, Jesús ayúdame",
      "me quiero morir por Dios",
    ]
  ) assertEquals(readDistress(q), "care", q);
});

Deno.test("the search function reads the same list and keys the cache the same way", () => {
  assertEquals(fromPrompts, inDistress);
  assertEquals(normaliseFromPrompts, normalise);
  assertEquals(normalise("  I’m TIRED, of living!! "), "i'm tired of living");
  // Rarer apostrophes, a doubled one, and a dropped one key the cache as "don't".
  for (const q of ["I donʹt want to live", "I don‛t want to live", "I don''t want to live", "I don t want to live"]) {
    assertEquals(normalise(q), "i don't want to live", q);
  }
  assertEquals(Number.isInteger(DISTRESS_LIST_VERSION) && DISTRESS_LIST_VERSION >= 4, true);
});
