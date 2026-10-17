// Someone who may want to die or to harm themselves. ONE list, used by the
// search function (Deno) and by the app (src/search/care.ts imports this file),
// so the two can't drift. Plain TypeScript: no imports, no Deno or React
// Native APIs.
//
// - "care": they plainly say it. Search answers with care: true and comforting
//   teaching (never their words searched as typed), whatever the model says,
//   and the app shows the care card even when search can't answer.
// - "maybe": wordings of despair that often mean it but not always ("I can't go
//   on like this", "hopeless", "depressed"). The model decides; when it can't
//   (it failed, timed out, or the limits stopped it), search treats the search
//   as care. That is failing closed.
//
// Devotional phrases are taken out before either list is read: "die to my
// flesh / to the world / to self / daily", "die for Christ", "ready to die for
// Jesus", "I want to die empty", "suicide prevention sermon", "killing myself
// slowly with sin". The rest of the sentence is still read, so "I want to die
// to self, I want to kill myself" is still care.
//
// Text is compared as normalise() leaves it, without accents ("não" → "nao",
// "désespoir" → "desespoir"). The phrase table in tests/search-care.spec.ts
// checks every wording here, both ways.

/**
 * Bump when either list or the devotional phrases change: it is part of the
 * search cache key, so answers given under an older list aren't served again.
 * 1: the list until October 2026. 2: languages, maybe-list, devotional phrases.
 */
export const DISTRESS_LIST_VERSION = 2;

/**
 * Lower-case words only: how a search is compared with a need's wording and
 * keyed in the cache (case, spacing and punctuation don't matter).
 */
export function normalise(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** normalise(), then without accents, for reading the lists. */
function fold(s: string): string {
  return normalise(s).normalize("NFD").replace(/\p{M}+/gu, "");
}

const words = (parts: string[], flags = "") => new RegExp(`\\b(${parts.join("|")})\\b`, flags);

// What someone dies to, or for, in teaching and prayer.
const DIES_TO =
  "my ?self|self|(my |the |our )?flesh|(the |this )?world|sin|sins|my sins?|(the |my |our )?old (man|self|nature)|" +
  "(my |the )?ego|(my )?pride|(my |my own |self )?will|my desires?|(the )?carnal (man|nature|mind)|carnality|lust";
const DIES_FOR =
  "christ|jesus( christ)?|christ jesus|the lord|my lord|god|the gospel|the faith|my faith|(the |his |god'?s )?kingdom|" +
  "the cross|him|my saviou?r";

const DEVOTIONAL = words(
  [
    `(die|dies|died|dying|dead|death) (to|unto) (${DIES_TO})`,
    "(die|dies|dying) (daily|every day|each day)",
    `(die|dies|died|dying|lay down my life) for (${DIES_FOR})`,
    "die empty",
    "to die is gain",
    "suicide (prevention|awareness)",
    "kill(ing)? my ?self (slowly )?(with|by|through|in) (sin|sins|my sins?|sinning)",
    // Afraid of dying (sickness, danger), not wanting to: "I don't want to die".
    "(don'?t|do not|no) (want|wan|wanna) (to )?die",
    // French and Portuguese: dying to self, to the flesh, to the world.
    "mourir (a|au) (moi meme|soi meme|(la |ma )?chair|monde|peche)",
    "morrer (para|ao|a) (mim mesmo|si mesmo|(a )?carne|(o )?mundo|pecado)",
  ],
  "g",
);

const CARE = words([
  // English
  "suicid\\w*", // also French suicider, Portuguese suicidio, Spanish suicidarme
  "kill(ing)? my ?self",
  "end(ing)? (it all|my life|my own life)",
  "tak(e|ing) my (own )?life",
  "(want|wanna|wish|ready|longing) (to|i could|i was|i were) (die|be dead|dead)",
  "wanna die",
  "(don'?t|do not|no longer) want to (live|be alive|wake up|exist|be here any ?more)",
  "no (reason|point) (to|in|for) (live|living|go on|going on|being alive|life)",
  "nothing (left )?to live for",
  "self ?harm\\w*",
  "(hurt|hurting|harm|harming|cut|cutting) my ?self",
  "(hang|hanging|drown|drowning|poison|poisoning|shoot|shooting|stab|stabbing) my ?self",
  "slit(ting)? my wrists?",
  "jump(ing)? (off|from) (a |the )?(bridge|building|roof|cliff)",
  "better off (dead|without me)",
  "(nobody|no one|noone) (would|will|is going to|gonna) (miss me|notice i'?m gone|care if i (die|died|was gone|were gone))",
  "tired of (living|being alive|life|this life|my life|existing)",
  "(sick|weary) of (living|being alive|life)",
  "(hate|hating) (my life|living|being alive)",
  // "I can't go on" as the whole thought; "can't go on like this" is maybe.
  "(can'?t|cannot|can not) (go|carry) on( (any ?more|any longer|living|with (my |this )?life))?$",
  "(can'?t|cannot|can not) live (any ?more|any longer)",
  "(give|giving|given|gave) up on (life|living)",
  "(lost|losing|no|have no) (the )?will to live",
  "never wake up",
  "(wish|wishing) i (was|were|had) never (been )?born",
  "(life|living) (isn'?t|is not|ain'?t) worth (living|it)",
  "not worth living",
  "what'?s the point (of|in) (living|life|being alive|going on)",
  // Nigerian Pidgin
  "wan (go )?die", // I wan die, I wan go die
  "make i (just )?die",
  "tire (for|of|with) (this |my )?(life|world)", // I don tire for this life
  "com+ot (for |from )?(this )?world", // I wan comot for this world
  "no (wan|want|wanna) (to )?live",
  // French
  "veux mourir",
  "(envie|besoin|desir) de mourir",
  "me tuer",
  "me (donner|foutre) la mort",
  "veux plus vivre",
  "(plus|pas) envie de vivre",
  "en finir avec (la|ma) vie",
  "mettre fin a (mes jours|ma vie)",
  "(marre|fatigue|fatiguee|las|lasse) de (vivre|la vie)",
  // Portuguese
  "quero morrer",
  "(vontade|desejo) de morrer",
  "me matar|matar me",
  "nao quero (mais )?viver",
  "tirar (a )?minha (propria )?vida",
  "acabar com (a )?minha (propria )?vida",
  "cansad[oa] de viver",
  "sem (razao|motivo) (para|pra) viver",
  // Spanish
  "quiero morir\\w*",
  "matarme",
  "quitarme la vida",
  "no quiero vivir",
  // Swahili
  "(nataka|ninataka|ningependa|natamani) kufa",
  "\\w*jiua", // najiua, nitajiua, kujiua: kill myself, will kill myself, suicide
  "kujitoa uhai",
  "sitaki (tena )?kuishi",
  "nimechoka (kuishi|na maisha|maisha)",
  "sina sababu ya kuishi",
]);

const MAYBE = words([
  // English
  "hopeless\\w*",
  "(no|lost (all )?|without) hope",
  "(want|wanna|feel like|about) (to )?giv(e|ing) up",
  "giv(e|ing) up on (everything|myself|god)",
  "i (just )?give up$",
  "(can'?t|cannot|can not) (go|carry) on",
  "(can'?t|cannot|can not) live like this",
  "(can'?t|cannot|can not) (take|do|handle|bear|stand) (it|this|life|this life) (any ?more|any longer)",
  "(can'?t|cannot|can not) cope",
  "(want|wanna) (to )?(disappear|vanish|end it|sleep forever|stop existing|not exist|not be here)",
  "(i am|i'?m|im|feel|feeling) (so |completely |totally |utterly )?(worthless|empty inside|numb|useless|a burden)",
  "burden (to|on) (everyone|everybody|my family|others|people)",
  "depress\\w*",
  "despair\\w*",
  "no way out",
  "(nobody|no one|noone) (cares|loves me|understands me|wants me)",
  "don'?t want to be here",
  "dark (thoughts|place)",
  "overdos\\w*",
  "(swallow|take|took|taking) (all )?(the |my |these )?pills",
  "what'?s the point",
  "(life|everything|it all) (is|feels) (so )?(pointless|meaningless)",
  "(my )?life has no (meaning|purpose)",
  "tired of (everything|it all)",
  "(want|wanna) the pain to (stop|end)",
  "unbearable",
  "falling apart",
  "breaking down",
  // Nigerian Pidgin
  "(don|done) tire",
  "life no (sweet|get meaning)",
  "i no fit (again|cope|bear)",
  "wahala don too much",
  // French
  "en finir",
  "en peux plus",
  "desespo\\w*|desesper\\w*",
  "deprim\\w*", // also Portuguese deprimido
  "plus (la )?force",
  "marre de tout",
  // Portuguese
  "nao aguento mais",
  "sem esperanca",
  "cansad[oa] de tudo",
  // Swahili
  "nimechoka",
  "sina (matumaini|tumaini)",
  "msongo wa mawazo",
]);

export type DistressReading = "care" | "maybe" | null;

/** "care", "maybe" or null (see the top of this file). */
export function readDistress(text: string | null | undefined): DistressReading {
  if (!text) return null;
  const said = fold(text).replace(DEVOTIONAL, " ");
  if (CARE.test(said)) return "care";
  return MAYBE.test(said) ? "maybe" : null;
}

/** They plainly say they want to die or to harm themselves. */
export function inDistress(text: string | null | undefined): boolean {
  return readDistress(text) === "care";
}

/** inDistress(), or a wording of despair that may mean it. */
export function maybeDistress(text: string | null | undefined): boolean {
  return readDistress(text) !== null;
}
