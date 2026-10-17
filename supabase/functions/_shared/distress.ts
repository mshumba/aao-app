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
// to self, I want to kill myself" is still care. Each is kept as narrow as its
// teaching use: "I want to die every day", "die for God's sake" and "suicide
// prevention hotline" are still care.
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
  // Apostrophe look-alikes first: NFKC turns ´ into a space and an accent, and
  // keeps ʼ as a letter, so "don´t" and "donʼt" would never read as "don't".
  return s
    .replace(/[’‘`´ʼ′＇]/g, "'")
    .normalize("NFKC")
    .toLowerCase()
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

// "Die daily" is 1 Corinthians 15:31; "suicide prevention" only with the sermon
// or event it names.
const DEVOTIONAL = words(
  [
    `(die|dies|died|dying|dead|death) (to|unto) (${DIES_TO})(?!'?s sake)`,
    "(die|dies|dying) daily",
    `(die|dies|died|dying|lay down my life) for (${DIES_FOR})(?!'?s sake)`,
    "die empty",
    "to die is gain",
    "suicide (prevention|awareness) (sermons?|messages?|teachings?|series|month|week|day|ministry|sunday|service)",
    "kill(ing)? my ?self (slowly )?(with|by|through|in) (sin|sins|my sins?|sinning)",
    // Afraid of dying (sickness, danger), not wanting to: "I don't want to die".
    "(don'?t|do not|no) (want|wan|wanna) (to )?die",
    "(nao|no) (quero|quiero) (mais )?(morrer|morir\\w*)",
    // "God makes a way where there is no way": not "no way out" (maybe).
    "(make|makes|made|making) a way (when|where) there('?s| is| was| seems to be) no way( out)?",
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
  "wish i (would|could) die",
  "feel like dying",
  "(rather|better) be dead",
  "unalive\\w*",
  "(don'?t|do not|no longer) want to (live|be alive|wake up|exist|be here any ?more)",
  "(don'?t|do not) wanna (live|be alive|exist|wake up)",
  "no (reason|point) (to|in|for) (live|living|go on|going on|being alive|life)",
  "nothing (left )?to live for",
  "self ?harm\\w*",
  "(hurt|hurting|harm|harming|cut|cutting) my ?self",
  "(hang|hanging|drown|drowning|poison|poisoning|shoot|shooting|stab|stabbing) my ?self",
  "slit(ting)? my wrists?",
  "jump(ing)? (off|from) (a |the )?(bridge|building|roof|cliff)",
  "(took|taken|swallowed?) (too many|a lot of|all( of)?( my| the| these)?) pills",
  "(drink|drank|drinking|take|took|swallow\\w*) sniper", // Sniper: a pesticide, in Nigeria
  "better off (dead|without me)",
  "(nobody|no one|noone) (would|will|is going to|gonna) (miss me|notice i'?m gone|care if i (die|died|was gone|were gone))",
  // As the whole thought: "tired of living in sin" or "I hate living in fear"
  // is maybe (the model reads it).
  "tired of (living|being alive|life|this life|my life|existing)( any ?more| any longer)?$",
  "(sick|weary) of (living|being alive|life)( any ?more| any longer)?$",
  "(hate|hating) (my life|living|being alive)( so much)?$",
  // "I can't go on" as the whole thought; "can't go on like this" is maybe.
  "(can'?t|cannot|can not) (go|carry) on( (any ?more|any longer|living|with (my |this )?life))?$",
  "(can'?t|cannot|can not) live (any ?more|any longer)",
  "(give|giving|given|gave) up on (life|living)",
  "(lost|losing|no|have no) (the )?will to live",
  // Not "I never wake up for prayer" (maybe).
  "(want|wish|hope|pray)( that)?( i| to)?( could| would| will)? never wake up",
  "(sleep|asleep) and never wake up",
  "(wish|wishing) i (was|were|had) never (been )?born",
  "(life|living) (isn'?t|is not|ain'?t) worth (living|it)",
  "not worth living",
  "what'?s the point (of|in) (living|being alive|going on)",
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
  "je (ne )?veux pas vivre",
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
  // Not "God makes a way when there is no way out" (a devotional phrase).
  "(there'?s|there is|i see|i have) no way out$",
  "(nobody|no one|noone) (cares|loves me|understands me|wants me)",
  "don'?t want to be here",
  "dark (thoughts|place)",
  "overdos\\w*",
  // Not "should a Christian take pills".
  "(swallow\\w*|took|taking|take all) (all )?(the |my |these )?pills",
  // Not "what's the point of fasting".
  "what'?s the point( (of|in) (it all|life|anything))?( any ?more)?$",
  "(life|everything|it all) (is|feels) (so )?(pointless|meaningless)",
  "(my )?life has no (meaning|purpose)",
  "tired of (everything|it all)",
  // "Tired of living in sin" and the like: the care list takes these only as the whole thought.
  "tired of (living|being alive|life|this life|my life|existing)",
  "(sick|weary) of (living|being alive|life)",
  "(hate|hating) (my life|living|being alive)",
  "never wake up",
  "done with (life|living)",
  "(end|ending) (it|everything)( tonight| today)?$",
  "(want to|going to|wan) (leave|comot) this world",
  "(want|wanna) the pain to (stop|end)",
  // Not "unbearable pain in my back", "breaking down strongholds" or "my family is falling apart".
  "(it'?s|it is|this is|life is|everything is|the pain is|this pain is) unbearable",
  "(i am|i'?m|im|i feel|my life is|my world is|everything is) (falling apart|breaking down)",
  // Nigerian Pidgin
  "(don|done) tire",
  "life no (sweet|get meaning)",
  "i no fit (again|cope|bear|continue)",
  "wahala don too much",
  // French ("en finir avec le péché" is not; "en finir avec la vie" is care)
  "en finir( avec tout( ca)?)?$",
  "en peux plus",
  "desespo\\w*|desesper\\w*",
  "deprim\\w*", // also Portuguese deprimido
  "plus (la )?force",
  "marre de tout",
  "(la|ma) vie n'?a plus (de )?sens",
  // Portuguese
  "nao aguento mais",
  "sem esperanca",
  "cansad[oa] de tudo",
  "acabar com tudo",
  "quero sumir",
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
