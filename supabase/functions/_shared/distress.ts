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
// slowly with sin", "Take my life and let it be", "are you ready to die?", and
// fear of dying ("I don't want to die", "Lord, don't let me die"). The rest of
// the sentence is still read, so "I want to die to self, I want to kill myself"
// is still care. Each is kept as narrow as its teaching use: "I want to die
// every day", "die for God's sake" (or "for God sake"), "suicide prevention
// hotline" and "take my life and let it be over" are still care.
//
// Text is compared as normalise() leaves it, without accents ("não" → "nao",
// "désespoir" → "desespoir"). The phrase table in tests/search-care.spec.ts
// checks every wording here, both ways.

/**
 * Bump when either list or the devotional phrases change: it is part of the
 * search cache key, so answers given under an older list aren't served again.
 * 1: the list until October 2026. 2: languages, maybe-list, devotional phrases.
 * 3: the review's further wordings ("for God sake", poison, kms, stop living).
 * 4: prayers and wishes to die, means, misspellings, fillers ("abeg"), rarer
 *    apostrophes and "don t" in normalise(), more French, Portuguese, Spanish,
 *    Swahili and Pidgin, and more teaching phrases taken out.
 */
export const DISTRESS_LIST_VERSION = 4;

/**
 * Lower-case words only: how a search is compared with a need's wording and
 * keyed in the cache (case, spacing and punctuation don't matter).
 */
export function normalise(s: string): string {
  // Apostrophe look-alikes first: NFKC turns ´ into a space and an accent, and
  // keeps ʼ ʻ ʹ as letters, so "don´t" and "donʼt" would never read as "don't".
  // Then "don''t" and a split "don t" (a dropped apostrophe) read as "don't".
  return s
    .replace(/[’‘‛`´ʼʻʹ′‵＇]/g, "'")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/'{2,}/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\b(don|can|won|isn|wasn|ain|didn|doesn|weren|wouldn|couldn|shouldn|haven|hasn|hadn|aren) t\b/g, "$1't")
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
  "(my |the )?ego|(my )?pride|(my |my own |self )?will|my desires?|(the )?carnal (man|nature|mind)|carnality|lust|" +
  "(my )?selfishness|(my |the |our )?sinful (nature|desires|ways)|the law|" +
  "(my |our )?(own )?(ambitions?|plans|agenda|reputation|opinions?|rights|comfort|old ways)";
// After a wish or prayer to die, the death a Christian hopes for, not a wish
// to die now: "I hope I die well", "let me die at a good old age".
const DIE_WELL =
  "(?! (well|old|at a good old age|in (a good )?old age|in (christ|jesus|the lord|faith|the faith)|full of days)\\b)";
// After "want to die" in French, Portuguese and Spanish: dying for or in
// Christ, or rather than sin ("prefiero morir que pecar"), is teaching. Not "por
// Dios" (for God's sake), "que vivir así" (than live like this) or a name
// called on ("quiero morir, Jesús ayúdame").
const NOT_MARTYR = "(?! ((do |plutot |antes )?(que|qu'?) ?(de |d'?)?" +
  "(pecar|pecher|renier|negar|trair|trahir|desobedecer|desobeir|ofender|offenser)|" +
  "(em|en|pour|por|no|na) (cristo|christ|jesus|jesucristo|o senhor|el senor|le seigneur))\\w*\\b)";
const DIES_FOR =
  "christ|jesus( christ)?|christ jesus|the lord|my lord|god|the gospel|the faith|my faith|(the |his |god'?s )?kingdom|" +
  "the cross|him|my saviou?r|(the |his )?cause( of (christ|the gospel))?|(my |our |the )?(beliefs?|convictions?)|" +
  "the truth|righteousness|the church|the brethren|(the |his )?name of (jesus|the lord|christ)|his name";
// Said after a wording that ends at its last word ($): "abeg", "for real".
const FILLER =
  "(( any ?more| any longer| at all| for real| fr| abeg| biko| o+| sha| jare| honestly| tbh| lol| now| today| tonight|" +
  " please| pls| lord| god))*$";

// "Die daily" is 1 Corinthians 15:31; "suicide prevention" only with the sermon
// or event it names. Never before "sake": "die for God's sake", "for God sake",
// "for Jesus Christ's sake" say it.
const DEVOTIONAL = words(
  [
    `(die|dies|died|dying|dead|death) (to|unto) (${DIES_TO})(?!( \\w+)?'?s? sake)`,
    "(die|dies|dying) daily",
    `(die|dies|died|dying|lay down my life) for (${DIES_FOR})(?!( \\w+)?'?s? sake)`,
    "die empty",
    "to die is gain",
    "suicide (prevention|awareness) (sermons?|messages?|teachings?|series|month|week|day|ministry|sunday|service)",
    "kill(ing)? my ?self (slowly )?(with|by|through|in) (sin|sins|my sins?|sinning)",
    // Afraid of dying (sickness, danger), not wanting to: "I don't want to die",
    // "I dont want 2 die", "Lord don't let me die", "no me quiero morir".
    "(don'?t|do not|no) (want|wan|wanna|wana|wish)( to| 2| too| tu)? die+",
    "(nao|no) (quero|quiero|queria|quisiera|deseo|desejo|gostaria de) (mais )?(morrer|morir\\w*)",
    "no me (quiero|gustaria) morir\\w*",
    "(pas|plus|jamais) (envie|besoin) de (mourir|crever)",
    "(don'?t|do not|never|please don'?t|did not|didn'?t|will not|won'?t|would not|wouldn'?t) let me die",
    // "Did Jesus want to die?", "He didn't want to die" (not "I never wanted
    // to die until now").
    "(did|does) (jesus|christ|he|god|the lord) (not |really )?want to die",
    "(didn'?t|did not|doesn'?t|does not|never) (want|wanted) to die(?! (until|till|before|but now)\\b)",
    // The bedtime prayer "If I should die before I wake", and "if I should die
    // tonight, would I go to heaven?" (not "if I should die, would anyone care").
    "if i (should|were to) die( tonight| today| tomorrow| now)? (would i (go|be|make it)|will i (go|be|make it)|" +
    "where (would|will) i (go|spend)|am i (saved|ready|going)|before i wake)",
    // Afraid of dying in their sleep: "I don't want to sleep and never wake up"
    // keeps "never wake up" (maybe), not "want to sleep and never wake up" (care).
    "(don'?t|do not) (want|wanna) (to )?(go to |fall )?(sleep|asleep) and",
    // "God makes a way where there is no way": not "no way out" (maybe).
    "(make|makes|made|making) a way (when|where) there('?s| is| was| seems to be) no way( out)?",
    // French, Portuguese and Spanish: dying to self, to the flesh, to the world.
    "mourir (a|au) (moi meme|soi meme|(la |ma )?chair|monde|peche)",
    "morrer (para|ao|a) (mim mesmo|si mesmo|(a )?carne|(o )?mundo|pecado)",
    "morir (a|al) (mi mismo|si mismo|yo|(la |mi )?carne|mundo|pecado)",
    // Evangelism, consecration and perseverance: "are you ready to die?", the
    // hymn "Take my life and let it be" (not "...let it be over"), "don't give
    // up on life", "end my life of sin".
    "are (you|we|they|u) (ready|prepared) to die",
    "tak(e|es) my (whole )?life (and (let it be(?! (over|done|finished|the end)\\b)|uses? it|" +
    "makes? it (new|yours|thine|count|whole|beautiful)|molds? it|moulds? it)|" +
    "for (your|thy|his) (glory|use|service|kingdom|purpose)|as a living sacrifice|i surrender)",
    "(don'?t|do not|never) (ever )?(give|giving) up on (life|living)",
    "end(ing)? my (old )?life of (sin|sins|sinning|bondage|addiction|lust)",
    "cross my heart and hope to die",
  ],
  "g",
);

const CARE = words([
  // English
  "su[ia]{0,2}[cs]{1,2}[ia]{0,2}d\\w*", // suicide, sucide, suiside; also French suicider, Portuguese suicidio, Spanish suicidarme
  "kil+(ing|in)? my ?self",
  "end(ing)? (it all|my life|my own life)",
  "tak(e|es|ing) my (own )?life",
  "(want|wanna|wish|ready|longing) (to|i could|i was|i were) (die|be dead|dead)",
  // Misspelt or without "to": "i want 2 die", "wan't", "wnat", "Iwant", "I want die" (Nigerian English).
  "(i ?want|want|wan'?t|wnat|wamt|wanna|wana)( to| 2| too| tu)? die+",
  "i( just| really)? (feel|feel like) (to )?die",
  // A prayer or wish to die: "I hope I die", "I pray to die", "God let me die".
  `(hope|pray|praying|wish|wishing)( that| to)?( i| i'?d| i could| i would| i will| i can| i might)?( just)? (die|be dead)${DIE_WELL}`,
  `let me (just )?die${DIE_WELL}`,
  "i( just| really)? (need|deserve|should|ought) (to )?(just )?die",
  "(i'?m|i am|im|i keep|keep|kept|i'?ve been|been|still) wanting to (die|be dead)",
  "(end|ending) my ?self",
  "(want to|wanna|gonna|going to|i will|i'?ll|might|about to) off my ?self",
  "(want|wish|need) (my life|it all|this life) to (end|be over|stop)",
  "i (don'?t|do not) deserve to (live|be alive|exist)",
  // Ways and means.
  "(jump|jumping|throw my ?self|throwing my ?self|step|stepping|lie|lying) (in front of|under) (a |an |the )?(moving )?(train|bus|car|truck|lorry|trailer|tanker|danfo|vehicle)",
  // Not "throw myself off balance" or "under the blood of Jesus".
  "(throw|throwing) my ?self ((off|from) (a|an|the|my|this|that)|in front of)\\b",
  "(cut|cutting|slash|slashing|slit|slitting) my (wrists?|veins?|arms?|throat)",
  "(painless|easiest|quickest|fastest|surest|peaceful) (way|ways|method|methods) to (die|kill my ?self|end (it|it all|my life))",
  "how (many|much) (\\w+ ){0,2}(pills?|tablets?|paracetamol|panadol|tylenol|ibuprofen|xanax|insulin|bleach|poison|tramadol|codeine)\\b.{0,25}\\b(to die|kills? (me|you|a person|someone|my ?self|a human|an adult)|overdose|od|lethal|fatal|deadly)",
  "(want to|wanna|gonna|going to|i will|i'?ll|might|about to|plan to|planning to) od",
  "(been|started|start|keep|kept|relapsed( and)?|back to) cutting( again)?" + FILLER,
  "cutting again",
  "wish i (wasn'?t|was not|weren'?t|were not) alive",
  "wanna die",
  "wish i (would|could) die",
  "feel like dying",
  "(rather|better) be dead",
  "unalive\\w*",
  "(don'?t|do not|no longer) want to (live|be alive|wake up|exist|be here any ?more)",
  "(don'?t|do not) wanna (live|be alive|exist|wake up)",
  "no (reason|point) (to|in|for) (live|living|go on|going on|being alive|life)(?! (in|without|by|a|an|on (a|an|the)|under|with)\\b)",
  `no (reason|point) (to|in) keep(ing)? (going|living)( on)?${FILLER}`,
  // Not "...the point of going on a mission trip" or "...of living a holy life" (maybe has the rest).
  "(don'?t|do not|can'?t|cannot) see (the|any|a) (point|reason) (of|in|to|for) (live|living|life|go on|going on|being alive)" +
  "(?! (a|an|on (a|an|the)|in (fear|sin|the past))\\b)",
  // As the whole thought: "I want to stop living in fear" is neither.
  `(want to|wanna|going to|gonna) stop living${FILLER}`,
  "nothing (left )?to live for",
  "self ?harm\\w*",
  "(hurt|hurting|harm|harming|cut|cutting|burn|burning) my ?self(?! (off|out)\\b)",
  "(hang|hanging|drown|drowning|poison|poisoning|shoot|shooting|stab|stabbing) my ?self(?! in the foot)",
  "jump(ing)? (off|from) (a |the )?(\\w+ ){0,2}(bridge|building|roof|cliff|balcony)",
  "(took|taken|swallowed?) (too many|a lot of|all( of)?( my| the| these)?|a handful of|a bunch of|loads of|lots of|(a|the|a whole|the whole|an entire) (bottle|pack|packet) of) pills",
  "(drink|drank|drinking|drunk|take|took|swallow\\w*|eat|ate)( some| the| a bottle of| a cup of| a sachet of)? (sniper|snipper|otapiapia|gammalin\\w*|bleach|jik|hypo|rat poison|insecticide|pesticide|herbicide|paraquat|kerosene|dettol|izal|weed killer|antifreeze)", // Sniper, otapiapia, gammalin: poisons in Nigeria
  // Their own act or wish: not "unforgiveness is like drinking poison".
  "i('ve| have)?( just)? (drank|drunk|took|taken|swallowed) (some |the )?poison",
  "(want|wanna|wan|going|gonna) (to )?(drink|take|swallow) (some |the )?poison",
  "(want to|wanna|gonna|going to|i will|i'?ll|might|could|about to|finna) kms", // kill myself
  "better (off )?(dead|without me)",
  "(better|happier|easier)( off)? (if|when|once) (i|i'?m|i am|i was|i were) (gone|dead|not here|not around|never born)",
  "(better|happier|easier)( off)? if i (died|wasn'?t here|weren'?t here|wasn'?t around|didn'?t exist)",
  "(nobody|no one|noone) (would|will|is going to|gonna) (miss me|notice i'?m gone|care if i (die|died|was gone|were gone))",
  // As the whole thought: "tired of living in sin" or "I hate living in fear"
  // is maybe (the model reads it).
  `tired of (living|being alive|life|this life|my life|existing)${FILLER}`,
  `(sick|weary) of (living|being alive|life)${FILLER}`,
  `(hate|hating) (my life|living|being alive)( so much)?${FILLER}`,
  // "I can't go on" as the whole thought; "can't go on like this" is maybe.
  `(can'?t|cannot|can not) (go|carry) on( (living|with (my |this )?life))?${FILLER}`,
  "(can'?t|cannot|can not) live (any ?more|any longer)",
  "(give|giving|given|gave) up on (life|living)",
  "(lost|losing|no|have no) (the )?will to live",
  // Not "I never wake up for prayer", "what if I sleep and never wake up" or
  // "pray I don't wake up late" (maybe or neither).
  "(want|wish|hope|pray)( that)?( i| to)?( could| would| will)? never wake up",
  "(want|wanna|wish|hope|pray)( that)?( to| i| i could| i would| i can| i will| i'?d)?( just)?( go to| fall)? (sleep|asleep) and never wake up",
  `(hope|pray|wish) i (don'?t|do not|won'?t|will not) wake up( tomorrow| again)?${FILLER}`,
  "(wish|wishing) i( was never| were never| had never been|'d never been| was not| wasn'?t| weren'?t| were not|" +
  " hadn'?t been| had not been|'d not been) (ever )?born",
  "wish i( had|'d)? died",
  "(life|living) (isn'?t|is not|ain'?t) worth (living|it)",
  "not worth living",
  `what('?s| is) the point (of|in) (living|being alive|going on)${FILLER}`,
  // Nigerian Pidgin
  "wan (go )?die", // I wan die, I wan go die
  "make i (just )?die",
  "(tire|taya|taia) (for|of|with) (this |my )?(life|world)", // I don tire (taya) for this life
  "no (wan|want|wanna) (to )?(dey|stay|remain) (for |for this |in this |inside this )?(this )?world",
  "na (only )?die remain",
  "com+ot (for |from )?(this )?world", // I wan comot for this world
  "no (wan|want|wanna) (to )?live",
  // French
  `(veux|voudrais|veuille|aimerais|souhaite|souhaiterais|prefere|prefererais) (mourir|crever|etre mort|etre morte)${NOT_MARTYR}`,
  "(envie|besoin|desir) de (mourir|crever)",
  "me (pendre|jeter (sous|du haut|d'?un pont|par la fenetre|dans le vide))",
  "me foutre en l'?air",
  "(veux|voudrais|aimerais|souhaite) (ne )?(plus|pas) me reveiller",
  "veux (plus|pas) exister",
  "(la )?vie ne vaut (pas|plus) la peine",
  "me tuer",
  "me (donner|foutre) la mort",
  "veux plus vivre",
  "je (ne )?veux pas vivre",
  "(plus|pas) envie de vivre",
  "en finir avec (la|ma) vie",
  "mettre fin a (mes jours|ma vie)",
  "(marre|fatigue|fatiguee|las|lasse) de (vivre|la vie)",
  // Portuguese
  `(quero|queria|querendo|gostaria de|preferia|prefiro) (morrer|estar mort[oa])${NOT_MARTYR}`,
  "me (enforcar|envenenar|jogar (da|do|de uma|de um) (ponte|predio|janela|viaduto|alto)|jogar na frente)",
  `melhor (eu )?morrer${NOT_MARTYR}`,
  "(vontade|desejo) de morrer",
  "me matar|matar me",
  "nao quero (mais )?viver",
  "tirar (a )?minha (propria )?vida",
  "acabar com (a )?minha (propria )?vida",
  // Portuguese and Spanish; not "harto de la vida de pecado" (maybe has it).
  "((cansad[oa]|hart[oa]) de (viver|vivir|la vida|a vida)|cansad[oa] da vida)" +
  "(?! (de|do|da|em|en|no|na) (pecado|pecar|pecador\\w*|mundo|carne)\\b)",
  "(sem|nao tenho|nenhum[a]?) (razao|motivo|razoes|motivos) (para|pra) viver",
  // Spanish
  `(quiero|quisiera|deseo|ganas de|prefiero|preferiria) (morir\\w*|estar muert[oa]|matarme)${NOT_MARTYR}`,
  "me (quiero|gustaria) (matar|morir|suicidar)|me voy a (matar|suicidar)",
  "acabar con mi (propia )?vida",
  "(no tengo|sin) (razon|razones|motivo|motivos) (para|pa) vivir",
  "ojala (me muera|me muriera|estuviera muert[oa]|no despierte)",
  "matarme",
  "quitarme la vida",
  "no quiero (seguir )?(vivir|viviendo)",
  "(no quiero (despertar|despertarme)|nao quero (mais )?acordar)(?! (tarde|temprano|cedo|de este|deste|desse)\\b)",
  "(quiero|quisiera) dejar de vivir|(quero|queria) parar de viver",
  // Swahili
  "(nataka|ninataka|ningependa|natamani) kufa",
  "(nataka|ninataka|natamani|ningependa|bora|ni bora|heri|afadhali) nife",
  "(ku|na|ni|nina|nita|ninge|nime)jiua|nijiue", // kill myself, will kill myself, suicide; not alijiua (he killed himself)
  "(ku|na|nina|nita|ninge)jinyonga|nijinyonge", // hang myself
  "kujitoa uhai",
  "(sitaki|sipendi) (tena )?(kuendelea )?kuishi",
  "nimechoka (kuishi|na maisha|maisha)",
  "sina sababu ya kuishi",
]);

const MAYBE = words([
  // English
  "hopeless\\w*",
  "(no|lost (all )?|without) hope",
  "(want|wanna|feel like|about) (to )?giv(e|ing) up",
  "giv(e|ing) up on (everything|myself|god)",
  `i (just )?give up${FILLER}`,
  "(can'?t|cannot|can not) (go|carry) on(?! (without (god|christ|jesus|the lord|you)|in my own strength)\\b)",
  "(keep|always|can'?t stop|been|i'?m|im|i am) thinking (about|of) (dying|death|ending it)",
  "(can'?t|cannot|can not) live like this",
  "(can'?t|cannot|can not) (take|do|handle|bear|stand) (it|this|life|this life) (any ?more|any longer)",
  "(can'?t|cannot|can not) cope",
  "(can'?t|cannot|can not) (live|go on|cope) (with|like) (this|the) (pain|life)",
  "(buy|bought|buying|got) (some )?(sniper|otapiapia|rat poison|gammalin\\w*)",
  "(want|wanna) (to )?(disappear|vanish|end it|sleep forever|stop existing|not exist|not be here)",
  "(i am|i'?m|im|feel|feeling) (so |completely |totally |utterly )?(worthless|empty inside|numb|useless|a burden)",
  "burden (to|on) (everyone|everybody|my family|others|people)",
  "depress\\w*",
  "despair\\w*",
  // The whole thought; not "there is no way out of hell" ("God makes a way
  // when there is no way out" is a devotional phrase).
  `(^|(there'?s|there is|i see|i have) )no way out( for me| of this)?${FILLER}`,
  "i (can'?t|cannot|don'?t) see (a|any) way out",
  "(nobody|no one|noone) (cares(?! about (you|them|him|her|us))|loves me|understands me|wants me)(?! but\\b)",
  "don'?t want to be here",
  "dark thoughts|(i'?m|i am|im|been|i feel|feeling|stuck|living) in (a|such a|this|my) (very |really |real )?dark place",
  "overdos\\w*",
  // Not "should a Christian take pills".
  "(swallow\\w*|took|taking all|take all) (all )?(the |my |these )?pills",
  // Not "what's the point of fasting" or "what is the point of prayer".
  `what('?s| is) the point( (of|in) (it all|life|this life|my life|anything|trying|me|my existence|living like this))?${FILLER}`,
  "(life|everything|it all) (is|feels) (so )?(pointless|meaningless)",
  "(my )?life has no (meaning|purpose)",
  "tired of (everything|it all)",
  // "Tired of living in sin" and the like: the care list takes these only as the whole thought.
  "tired of (living|being alive|life|this life|my life|existing)(?!'s)",
  "(sick|weary) of (living|being alive|life)",
  "(hate|hating) (my life|living|being alive)",
  "never wake up",
  "(hope|pray|wish) i (don'?t|do not|won'?t|will not) wake up(?! (late|early|on time|in time|for|to)\\b)",
  // Not "stop living in fear", "for myself", "like the world"; "like this" is.
  "(want to|wanna|going to|gonna) stop living(?! (in|for|by|a|an|under)\\b| like (?!this\\b))",
  "what('?s| is) the point (of|in) (living|being alive|going on)(?! (a|an|for|by|on|to|in|with|under|right|righteously|holy|godly)\\b)",
  "no (reason|point) (to|in|for) (live|living|go on|going on|being alive|life)(?! in (fear|sin|the past|shame|guilt|condemnation|defeat|bondage|darkness|the flesh|regret)\\b)",
  "(can'?t|cannot|can not) keep (going|living)( on)?" + FILLER,
  "(don'?t|do not|can'?t|cannot) see (the|any|a) (point|reason) (of|in|to|for) (live|living|life|go on|going on|being alive)" +
  "(?! in (fear|sin|the past)\\b)",
  `(ways?|how|best way|easy way|a way) to die${FILLER}`,
  // First person only: "Elijah wanted to die" is teaching.
  "i('ve| have)?( always| often| sometimes| just| never)? wanted to die",
  "why am i (still )?alive",
  "my life is over",
  "(tired|sick|weary) of (this|the) world" + FILLER,
  "(nobody|no one|noone) (would|will) (care|notice) if i (disappeared|disappear|left|vanished)",
  "(want|wish) (everything|it|this|all of this) to (end|be over|stop)" + FILLER,
  "(god|lord|jesus|father)( please| abeg| just)* take me( home| away)?" + FILLER,
  "going home to (jesus|the lord|god|glory)( now| tonight| today)",
  `(want|wanna|ready|longing) to (go )?(home )?(and |to )?(be )?with (the lord|jesus|god|christ)( now| tonight| today| already)${FILLER}`,
  "(wan|want to|wanna|i go) end am",
  "(don|done) (taya|taia)",
  "^kms$",
  "done with (life|living)",
  `(end|ending) (it|everything)${FILLER}`,
  "(want to|going to|wan) (leave|comot) this world",
  "(want|wanna) the pain to (stop|end)",
  // Not "unbearable pain in my back", "breaking down strongholds" or "my family is falling apart".
  "(it'?s|it is|this is|life is|everything is|the pain is|this pain is)( so| too| just)? unbearable",
  "(i am|i'?m|im|i feel|i keep|my life is|my whole life is|my world is|everything is)( so| completely| totally| just)? (falling apart|breaking down)",
  // Nigerian Pidgin
  "(don|done) tire",
  "life no (sweet|get meaning)",
  "i no fit (again|cope|bear|continue)",
  "wahala don too much",
  // French ("en finir avec le péché" is not; "en finir avec la vie" is care)
  `en finir( avec tout( ca)?)?( une fois pour toutes)?${FILLER}`,
  "(veux|voudrais|aimerais) disparaitre",
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
  "(cansad[oa]|hart[oa]) (de|da) (viver|vivir|la vida|a vida|vida)",
  "acabar com tudo",
  "(quero|queria) (sumir|desaparecer)",
  "(nao vejo|sem) sentido (na|em) (vida|viver)",
  "no aguanto mas|(ya )?no puedo mas",
  // Swahili
  "nimechoka",
  "maisha (yangu )?(hayana|hayana tena) maana",
  "nimekata tamaa",
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
