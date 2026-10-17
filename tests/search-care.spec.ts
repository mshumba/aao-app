import type { Page } from "@playwright/test";
import { inDistress, maybeDistress } from "../src/search/care";
import { expect, shown, test } from "./fixtures";

// Someone who may be in distress: a calm card comes first, whether search
// says so (`care`) or their words plainly do, and when search can't answer
// it stays, with one calm line and never raw matches for their words. In
// local mode the stand-in search reads distress as the search function does
// (src/learning/fixtures.ts); development-only switches set its flag and
// its faults.

const TITLE = "You don’t have to carry this alone.";
const BODY = "If you might act on these thoughts, call your local emergency number now.";

type Fake = { delay?: number; care?: boolean };
type Fault = "offline" | "unavailable" | "empty" | null;

const setFake = (page: Page, fake: Fake) =>
  page.addInitScript((f) => {
    (globalThis as { __aaoSearchFake?: Fake }).__aaoSearchFake = f;
  }, fake);
const setFault = (page: Page, fault: Fault) =>
  page.addInitScript((f) => {
    (globalThis as { __aaoSearchFault?: Fault }).__aaoSearchFault = f;
  }, fault);

const card = (page: Page) => shown(page.getByTestId("care-card"));
const results = (page: Page) => shown(page.getByTestId("moment-result"));
const live = (page: Page) => page.getByTestId("search-status");
const search = (page: Page, q: string) => page.goto(`/search?q=${encodeURIComponent(q)}`);

/** The card says all three things, and nothing on it closes it. */
async function expectCard(page: Page) {
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole("heading", { level: 2, name: TITLE })).toBeVisible();
  await expect(card(page)).toContainText(BODY);
  await expect(card(page).getByRole("link", { name: "Find a helpline", exact: true })).toBeVisible();
  await expect(card(page).getByRole("button")).toHaveCount(0);
}

/** Whether the card comes before every result in reading order. */
function cardFirst(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector('[data-testid="care-card"]');
    const results = [...document.querySelectorAll('[data-testid="moment-result"], [data-testid="sermon-row"]')];
    return !!c && results.every((r) => c.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
}

// Every wording the shared list (supabase/functions/_shared/distress.ts, used
// by the search function and the app) must read, both ways. "care": the card
// always shows and their words are never searched as typed. "maybe": the card
// shows when search can't read it (the model failed, or search failed).
// null: neither. The first block is the audit's appendix (16 October 2026).
const PHRASES: [phrase: string, reads: "care" | "maybe" | null][] = [
  // Matched before, still matched
  ["I want to die", "care"],
  ["I want to kill myself", "care"],
  ["suicidal", "care"],
  ["end it all", "care"],
  ["no reason to live", "care"],
  ["better off dead", "care"],
  ["self harm", "care"],
  ["cutting myself", "care"],
  ["I wan kill myself", "care"],
  ["je veux me suicider", "care"],
  // Missed before
  ["tired of living", "care"],
  ["I'm tired of living", "care"],
  ["I can't go on", "care"],
  ["i cant go on anymore", "care"],
  ["I hate my life", "care"],
  ["nobody would miss me", "care"],
  ["I wan die", "care"],
  ["I don tire for this life", "care"],
  ["wan comot for this world", "care"],
  ["je veux mourir", "care"],
  ["quero morrer", "care"],
  ["vou me matar", "care"],
  ["nataka kufa", "care"],
  ["najiua", "care"],
  // Teaching and grief, rightly not matched
  ["die to self", null],
  ["dying to self", null],
  ["kill the flesh", null],
  ["how to die to sin", null],
  ["death of a loved one", null],
  ["my father died", null],
  ["grief", null],
  // False positives before, not now
  ["I want to die to my flesh", null],
  ["I want to die daily", null],
  ["ready to die for Christ", null],
  ["suicide prevention sermon", null],
  ["killing myself slowly with sin", null],
  ["I want to die to the world", null],
  ["I want to die to self", null],
  ["dying to the flesh", null],
  ["I will die for Jesus", null],
  ["ready to die for Jesus", null],
  ["I want to die empty", null],
  ["to live is Christ and to die is gain", null],
  ["I don't want to die", null],
  ["mourir à soi-même", null],
  ["morrer para o mundo", null],
  // More plain wordings
  ["I want to end my life", "care"],
  ["thinking about suicide", "care"],
  ["There is no reason to live", "care"],
  ["Everyone would be better off dead without me", "care"],
  ["I don’t want to live anymore", "care"],
  ["I feel hopeless and can't go on", "care"],
  ["I wish I was never born", "care"],
  ["what's the point of living", "care"],
  ["life isn't worth living", "care"],
  ["I have nothing to live for", "care"],
  ["I'm ready to die", "care"],
  ["I want to die to self, but honestly I want to kill myself", "care"],
  ["I no wan live again", "care"],
  ["make I just die", "care"],
  ["j'ai envie de mourir", "care"],
  ["je vais me tuer", "care"],
  ["je ne veux plus vivre", "care"],
  ["Não quero mais viver", "care"],
  ["cansada de viver", "care"],
  ["nitajiua", "care"],
  ["sitaki kuishi", "care"],
  ["nimechoka na maisha", "care"],
  // Despair that may mean it
  ["I can't go on like this", "maybe"],
  ["I feel hopeless", "maybe"],
  ["everything feels pointless", "maybe"],
  ["I feel like a burden to my family", "maybe"],
  ["I'm so depressed", "maybe"],
  ["sermon on depression", "maybe"],
  ["I can't take it anymore", "maybe"],
  ["I just want to disappear", "maybe"],
  ["I don tire", "maybe"],
  ["je n'en peux plus", "maybe"],
  ["désespoir", "maybe"],
  ["não aguento mais", "maybe"],
  ["nimechoka", "maybe"],
  ["sina matumaini", "maybe"],
  // Still care: a devotional phrase mustn't hide these ("die daily" is
  // teaching, "die every day" isn't; nor is "for God's sake")
  ["I want to die every day", "care"],
  ["I want to die each day", "care"],
  ["I wanna die every day", "care"],
  ["I wish I could die every day", "care"],
  ["I just want to die for God's sake", "care"],
  ["I wanna die for god's sake", "care"],
  ["I want to die for christ's sake", "care"],
  ["suicide prevention hotline", "care"],
  ["I need suicide prevention help", "care"],
  // Wordings neither list had
  ["I feel like dying", "care"],
  ["I don't wanna live anymore", "care"],
  ["I'd rather be dead", "care"],
  ["I wish I would die", "care"],
  ["I want to unalive myself", "care"],
  ["I took too many pills", "care"],
  ["I took all my pills", "care"],
  ["I wan drink sniper", "care"],
  ["I go drink sniper", "care"],
  ["je veux pas vivre", "care"],
  ["I want to sleep and never wake up", "care"],
  ["I hope I never wake up", "care"],
  ["I'm done with life", "maybe"],
  ["I want to end everything", "maybe"],
  ["I'm going to end it tonight", "maybe"],
  ["I want to leave this world", "maybe"],
  ["I no fit continue", "maybe"],
  ["je veux en finir", "maybe"],
  ["la vie n'a plus de sens", "maybe"],
  ["vou acabar com tudo", "maybe"],
  ["quero sumir", "maybe"],
  ["I feel like dying to self", null],
  ["I wish I could die to self", null],
  // Apostrophe look-alikes (´ and ʼ) read as an apostrophe
  ["I don´t want to live", "care"],
  ["I can´t go on", "care"],
  ["I donʼt want to live", "care"],
  // Care only as the whole thought; with more after it, the model reads it
  ["I'm tired of living in sin", "maybe"],
  ["tired of living in fear", "maybe"],
  ["I'm tired of living for the world", "maybe"],
  ["tired of living like this", "maybe"],
  ["tired of living in my parents house", "maybe"],
  ["sick of living in sin", "maybe"],
  ["I hate living in fear", "maybe"],
  ["I hate my life of sin", "maybe"],
  ["I never wake up for prayer", "maybe"],
  ["I never wake up early for prayer", "maybe"],
  ["what's the point of life", "maybe"],
  ["I feel empty inside", "maybe"],
  // Afraid of dying, in Portuguese and Spanish
  ["não quero morrer, estou doente", null],
  ["no quiero morir", null],
  // Sermon searches, not despair
  ["breaking down strongholds", null],
  ["breaking down the walls of Jericho", null],
  ["when your marriage is falling apart", null],
  ["my family is falling apart", null],
  ["what's the point of fasting", null],
  ["should a Christian take pills", null],
  ["God makes a way when there is no way out", null],
  ["en finir avec le péché", null],
  ["unbearable pain in my back", null],
  // "For God sake" (no s) says it as plainly as "for God's sake"
  ["I want to die for God sake", "care"],
  ["I just want to die for God sake", "care"],
  ["I wan die for God sake", "care"],
  ["I wanna die for God sake", "care"],
  ["I wish I could die for God sake", "care"],
  ["I want to die for Christ sake", "care"],
  ["I want to die for Jesus sake", "care"],
  ["I want to die for Jesus Christ's sake", "care"],
  ["I will die for Jesus' sake", null],
  ["dying for Christ's sake", null],
  ["die for the gospel's sake", null],
  ["I want to die to self for Christ's sake", null],
  // Plain wordings the lists still missed
  ["I want to stop living", "care"],
  ["I just want to stop living", "care"],
  ["I drank poison", "care"],
  ["I've taken poison", "care"],
  ["I want to drink poison", "care"],
  ["I wan drink poison", "care"],
  ["what is the point of living", "care"],
  ["I wish I wasn't alive", "care"],
  ["I don't see the point in living", "care"],
  ["I hope I don't wake up tomorrow", "care"],
  ["I took a handful of pills", "care"],
  ["I want to kms", "care"],
  ["I'll kms", "care"],
  ["estoy cansado de vivir", "care"],
  ["unforgiveness is like drinking poison", null],
  ["I want to stop living in fear", null],
  ["stop living in sin", null],
  ["pray I don't wake up late", null],
  ["what is the point of prayer", null],
  // Despair the narrowed maybe-wordings had dropped
  ["what's the point of my life", "maybe"],
  ["what's the point of this life", "maybe"],
  ["what's the point of trying", "maybe"],
  ["what's the point of me", "maybe"],
  ["what's the point of my existence", "maybe"],
  ["what is the point of my life", "maybe"],
  ["I see no way out of this", "maybe"],
  ["there's no way out for me", "maybe"],
  ["no way out", "maybe"],
  ["I can't see a way out", "maybe"],
  ["life is so unbearable", "maybe"],
  ["the pain is too unbearable", "maybe"],
  ["everything is so unbearable", "maybe"],
  ["I'm completely falling apart", "maybe"],
  ["my whole life is falling apart", "maybe"],
  ["I keep breaking down", "maybe"],
  ["there is no way out of hell", null],
  ["how to stop breaking down in prayer", null],
  ["the world is falling apart", null],
  // Wanting to sleep and never wake up is care; fearing it is maybe
  ["I just want to go to sleep and never wake up", "care"],
  ["I wish I could fall asleep and never wake up", "care"],
  ["I wanna sleep and never wake up", "care"],
  ["I hope I sleep and never wake up", "care"],
  ["what if I sleep and never wake up", "maybe"],
  ["afraid I will fall asleep and never wake up", "maybe"],
  ["I'm scared to sleep and never wake up", "maybe"],
  ["I don't want to sleep and never wake up", "maybe"],
  // A wish or prayer to die (third review): in a church app the likeliest way to say it
  ["I hope I die", "care"],
  ["I hope I die tonight", "care"],
  ["I hope I die in my sleep tonight", "care"],
  ["I pray to die", "care"],
  ["I pray that I die", "care"],
  ["God please let me die", "care"],
  ["Lord just let me die", "care"],
  ["Lord please let me die in my sleep", "care"],
  ["Lord let me die in peace", "care"],
  ["I pray God takes my life tonight", "care"],
  ["I wish I'd die in my sleep", "care"],
  ["I wish I could just die already", "care"],
  ["I wish I had died", "care"],
  ["I need to die", "care"],
  ["I deserve to die", "care"],
  ["I should just die", "care"],
  ["I think I should die", "care"],
  ["I keep wanting to die", "care"],
  ["God did not let me die", null],
  ["don't let me die before my time", null],
  ["Lord don't let me die", null],
  ["I pray I don't die young", null],
  ["I pray I die at a good old age", null],
  ["I hope I die well", null],
  ["Lord let me die well", null],
  ["I hope to die in the faith", null],
  ["cross my heart and hope to die", null],
  ["let me die to self", null],
  ["Jesus let me die to my flesh", null],
  ["If I should die before I wake, I pray the Lord my soul to take", null],
  ["I need to die to selfishness", null],
  ["I need to die to my sinful nature", null],
  ["dead to the law", null],
  // Other plain wordings of intent
  ["I want my life to end", "care"],
  ["I just want it all to end", "care"],
  ["I want to end myself", "care"],
  ["I want to off myself", "care"],
  ["I don't deserve to live", "care"],
  ["I wish I wasn't born", "care"],
  ["everyone would be better without me", "care"],
  ["the world would be better off if I was gone", "care"],
  ["Everyone will be better off when I'm gone", "care"],
  ["I have no reason to keep going", "care"],
  ["I don't see a reason to live", "care"],
  ["i might kms", "care"],
  // Naming a way
  ["I want to jump in front of a train", "care"],
  ["I want to jump off the third mainland bridge", "care"],
  ["I want to throw myself off a bridge", "care"],
  ["I want to cut my wrists", "care"],
  ["how many pills does it take to die", "care"],
  ["most painless way to die", "care"],
  ["I want to OD", "care"],
  ["I want to drink bleach", "care"],
  ["I want to drink rat poison", "care"],
  ["I swallowed a bottle of pills", "care"],
  ["I wan drink otapiapia", "care"],
  ["I go drink gammalin", "care"],
  ["I've been cutting again", "care"],
  ["I burn myself", "care"],
  ["I'm going to hang myself", "care"],
  ["throw myself out of my comfort zone", null],
  ["I want to throw myself into ministry", null],
  ["how many people had to die for the gospel", null],
  ["cutting back on sugar during the fast", null],
  ["burning myself out for ministry", null],
  ["I cut myself off from church", null],
  ["I keep shooting myself in the foot", null],
  // Misspelt, text-speak, or without "to"
  ["i want 2 die", "care"],
  ["i wnat to die", "care"],
  ["I wan't to die", "care"],
  ["Iwant to die", "care"],
  ["i want to dieee", "care"],
  ["sucide", "care"],
  ["suiside thoughts", "care"],
  ["kil myself", "care"],
  ["i want to kil my self", "care"],
  ["I want die", "care"],
  ["I just feel to die", "care"],
  ["I feel like to die", "care"],
  ["I no want die", null],
  ["I dont want 2 die", null],
  ["I don't wish to die", null],
  ["I want to diet", null],
  ["I want to dye my hair for church", null],
  ["succeeding in ministry", null],
  // A filler word after a wording that is the whole thought
  ["I want to stop living for real", "care"],
  ["I just want to stop living abeg", "care"],
  ["I want to stop living honestly", "care"],
  ["I hope I don't wake up tomorrow for real", "care"],
  ["I hope I don't wake up tomorrow honestly", "care"],
  ["I've given up on life sha", "care"],
  ["I give up for real", "maybe"],
  ["I'm going to end it tonight for real", "maybe"],
  ["there is no way out for me abeg", "maybe"],
  ["je veux en finir une fois pour toutes", "maybe"],
  ["I want to stop living like this", "maybe"],
  ["I want to stop living for myself", null],
  ["I want to stop living like the world", null],
  ["what is the point of prayer now", null],
  // Rarer apostrophes, a doubled one, and a dropped one
  ["I donʹt want to live", "care"],
  ["I canʻt go on", "care"],
  ["I don‛t want to live anymore", "care"],
  ["I don''t want to live", "care"],
  ["I don t want to live anymore", "care"],
  ["I can t go on anymore", "care"],
  ["I wish I weren t alive", "care"],
  // French
  ["je voudrais mourir", "care"],
  ["j'aimerais mourir", "care"],
  ["je souhaite mourir", "care"],
  ["je veux crever", "care"],
  ["j'ai envie de crever", "care"],
  ["je préférerais être mort", "care"],
  ["je vais me pendre", "care"],
  ["je veux me foutre en l'air", "care"],
  ["je ne veux plus exister", "care"],
  ["la vie ne vaut pas la peine d'être vécue", "care"],
  ["je voudrais ne plus me réveiller", "care"],
  ["je veux disparaître", "maybe"],
  ["je veux mourir à moi-même", null],
  ["je n'ai pas envie de mourir", null],
  // Portuguese
  ["queria morrer", "care"],
  ["eu queria estar morta", "care"],
  ["tô querendo morrer", "care"],
  ["quero me enforcar", "care"],
  ["não tenho motivo para viver", "care"],
  ["melhor eu morrer", "care"],
  ["queria parar de viver", "care"],
  ["não quero mais acordar", "care"],
  ["não vejo sentido na vida", "maybe"],
  ["quero desaparecer", "maybe"],
  ["eu não queria morrer", null],
  ["quero me jogar de cabeça no ministério", null],
  // Spanish
  ["me quiero matar", "care"],
  ["me voy a matar", "care"],
  ["quisiera morirme", "care"],
  ["deseo morir", "care"],
  ["tengo ganas de morir", "care"],
  ["no quiero seguir viviendo", "care"],
  ["quiero acabar con mi vida", "care"],
  ["estoy harta de vivir", "care"],
  ["estoy cansada de la vida", "care"],
  ["no tengo razón para vivir", "care"],
  ["ojalá me muera", "care"],
  ["no quiero despertar mañana", "care"],
  ["quiero dejar de vivir", "care"],
  ["quiero morir", "care"],
  ["ya no aguanto más", "maybe"],
  ["me voy a morir de risa", null],
  ["no me quiero morir", null],
  ["no deseo morir", null],
  ["quiero morir a mi mismo", null],
  ["como morir a la carne", null],
  // Swahili
  ["nataka nife", "care"],
  ["natamani nife", "care"],
  ["ni bora nife", "care"],
  ["nataka nijiue", "care"],
  ["nataka kujinyonga", "care"],
  ["nitajinyonga", "care"],
  ["sitaki kuendelea kuishi", "care"],
  ["maisha hayana maana", "maybe"],
  ["nimekata tamaa", "maybe"],
  ["Samsoni alijiua", null],
  ["Yuda alijinyonga", null],
  // Nigerian Pidgin
  ["Na only die remain for me", "care"],
  ["I don taya for this life", "care"],
  ["I don taya for life", "care"],
  ["I no wan dey this world again", "care"],
  ["I wan end am", "maybe"],
  ["Make God just take me", "maybe"],
  ["Lord take me now", "maybe"],
  ["I bought sniper", "maybe"],
  ["Lord take me higher", null],
  ["God take me deeper", null],
  // Despair that may mean it, so search fails closed on it
  ["I keep thinking about dying", "maybe"],
  ["I wanted to die", "maybe"],
  ["I wanted to die last night", "maybe"],
  ["I've wanted to die for years", "maybe"],
  ["I never wanted to die until now", "maybe"],
  ["I want everything to end", "maybe"],
  ["why am I still alive", "maybe"],
  ["no one would care if I disappeared", "maybe"],
  ["I can't keep going", "maybe"],
  ["my life is over", "maybe"],
  ["I'm tired of this world", "maybe"],
  ["I can't live with this pain anymore", "maybe"],
  ["Elijah wanted to die under the juniper tree", null],
  // Teaching the open wordings had read as care
  ["what is the point of living a holy life", null],
  ["what's the point of living for God", null],
  ["what is the point of living by faith", null],
  ["what is the point of living right", null],
  ["what is the point of going on a fast", null],
  ["what's the point of going on a mission trip", null],
  ["what's the point of living fr", "care"],
  ["what's the point of living like this", "maybe"],
  ["no reason to live in fear", null],
  ["there is no reason to live in fear when God is with you", null],
  ["no reason to live in sin", null],
  ["no point in living in the past", null],
  ["no point in living without Christ", "maybe"],
  ["no reason to live in this world", "maybe"],
  ["no reason to live anymore", "care"],
  ["I have no reason to live on", "care"],
  ["take my life and let it be", null],
  ["Take my life and let it be consecrated Lord to thee", null],
  ["Lord take my life I surrender all", null],
  ["Lord take my life and use it for your glory", null],
  ["Jesus takes my life and makes it new", null],
  ["God take my life", "care"],
  ["I want to take my own life", "care"],
  ["Lord take my life and let it be over", "care"],
  ["Lord take my life I give up", "care"],
  ["don't give up on life", null],
  ["never give up on living", null],
  ["I've given up on life", "care"],
  ["are you ready to die", null],
  ["are you ready to die and meet God", null],
  ["ready to die for the cause of Christ", null],
  ["how to end my life of sin", null],
  ["I'm ready to die tonight", "care"],
  ["I want to die for the Lord's sake", "care"],
  ["did Jesus want to die", null],
  ["Jesus did not want to die on the cross", null],
  ["I didn't want to die but now I do", "care"],
  // Ordinary searches the maybe-wordings had over-read
  ["should I stop taking my pills and trust God for healing", null],
  ["is taking pills a lack of faith", null],
  ["God meets you in your dark place", null],
  ["a light that shines in a dark place", null],
  ["when nobody cares about you God cares", null],
  ["nobody understands me but God", null],
  ["tired of life's battles", null],
  ["I can't go on without God", null],
  ["I can't carry on in my own strength", null],
  ["I'm in a dark place", "maybe"],
  ["I keep having dark thoughts", "maybe"],
  ["nobody cares", "maybe"],
  // Still maybe: the model reads these
  ["no hope without Christ", "maybe"],
  ["my boyfriend is cheating should I end it", "maybe"],
  ["when life is unbearable trust God", "maybe"],
  // Wordings found while checking the above
  ["I wish I died", "care"],
  ["I wish I'd died", "care"],
  ["I wish I'd never been born", "care"],
  ["it would be better if I died", "care"],
  ["everyone would be happier if I was dead", "care"],
  ["how much tramadol kills you", "care"],
  ["ways to die", "maybe"],
  ["I want to go and be with the Lord now", "maybe"],
  ["if I should die tonight would I go to heaven", null],
  ["if I should die no one would care", "care"],
  ["throwing myself under the blood of Jesus", null],
  ["I keep throwing myself off balance", null],
  ["prefiero morir que pecar", null],
  ["prefiero morir que vivir así", "care"],
  ["quiero morir, Jesús ayúdame", "care"],
  ["me quiero morir por Dios", "care"],
  ["quiero morir por Cristo", null],
  ["je préfère mourir que renier Christ", null],
  ["je veux mourir pour Christ", null],
  ["prefiro morrer do que pecar", null],
  ["é melhor morrer em Cristo", null],
  ["estoy harto de la vida de pecado", "maybe"],
  ["no quiero despertar tarde", null],
  ["I don't see the point of going on a mission trip", "maybe"],
  ["I don't see the point of living a life without her", "maybe"],
  ["Jesus didn't want to die but obeyed", null],
  // Ordinary searches
  ["I keep falling into the same sin", null],
  ["I'm afraid of what's coming", null],
  ["fear of death", null],
  ["how to give up smoking", null],
  ["life is worth living", null],
  ["the joy of the Lord is my strength", null],
  ["", null],
];

test("the phrase table: each wording reads as care, maybe or neither", () => {
  for (const [phrase, reads] of PHRASES) {
    expect(inDistress(phrase), `care: ${phrase}`).toBe(reads === "care");
    expect(maybeDistress(phrase), `maybe: ${phrase}`).toBe(reads !== null);
  }
});

test("search's care flag puts the card first, above comforting moments", async ({ page }) => {
  // Words the app's own list doesn't settle ("maybe"); search's reading does.
  await search(page, "I feel hopeless");
  await expectCard(page);
  await expect(results(page)).toHaveCount(4);
  expect(await cardFirst(page)).toBe(true);
  await expect(shown(page.getByText("Moments about finding hope and comfort in God", { exact: true }))).toBeVisible();
  // Screen readers hear the card before what was found.
  await expect(live(page)).toHaveText(`${TITLE} ${BODY} 4 moments found`);
  // No sermon titles matched to their words.
  await expect(page.getByTestId("result-count")).toHaveCount(0);
});

test("plain words of distress show the card even when search doesn't flag them", async ({ page }) => {
  await setFake(page, { care: false });
  await search(page, "I want to end my life");
  await expectCard(page);
  await expect(results(page).first()).toBeVisible();
  expect(await cardFirst(page)).toBe(true);
  await expect(live(page)).toContainText(TITLE);
});

/** Everything the live region says, in order, from the page's start. */
async function recordLive(page: Page) {
  await page.addInitScript(() => {
    const said: string[] = ((window as unknown as { __said: string[] }).__said = []);
    new MutationObserver(() => {
      const text = document.querySelector('[data-testid="search-status"]')?.textContent ?? "";
      if (text && said[said.length - 1] !== text) said.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __said: string[] }).__said);
}

test("the card shows as soon as they search, and is read first", async ({ page }) => {
  await setFake(page, { delay: 2500 });
  const said = await recordLive(page);
  await search(page, "I want to die");
  await expectCard(page);
  await expect(page.getByTestId("search-loader")).toBeVisible();
  await expect(results(page)).toHaveCount(0);
  await expect(results(page)).toHaveCount(4);
  await expectCard(page);
  const heard = await said();
  expect(heard[0]).toBe(`${TITLE} ${BODY}`);
  expect(heard[heard.length - 1]).toBe(`${TITLE} ${BODY} 4 moments found`);
});

test("Find a helpline opens findahelpline.com outside the app", async ({ page, context }) => {
  await context.route("https://findahelpline.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Find A Helpline</title>" }),
  );
  await search(page, "I want to die");
  const opened = context.waitForEvent("page");
  await card(page).getByRole("link", { name: "Find a helpline", exact: true }).click();
  const helpline = await opened;
  await expect(helpline).toHaveURL(/^https:\/\/findahelpline\.com\/?$/);
  // The app stays where it was.
  await expect(page).toHaveURL(/\/search\?q=/);
});

// A request that times out reaches the screen as "offline", like no connection.
const failures = { unavailable: "isn’t answering", offline: "times out or has no connection" } as const;
for (const fault of ["unavailable", "offline"] as const) {
  test(`when search ${failures[fault]}, the card stays with one calm line, and nothing else`, async ({
    page,
  }) => {
    await setFault(page, fault);
    await search(page, "I want to die");
    await expectCard(page);
    const calm = shown(page.getByTestId("care-calm"));
    await expect(calm).toContainText("The Apostle’s teaching couldn’t load just now.");
    // Not the usual states: no other needs to try, no sermon titles for their words.
    await expect(page.getByTestId("search-unavailable")).toHaveCount(0);
    await expect(page.getByTestId("search-offline")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Try one of these" })).toHaveCount(0);
    await expect(shown(page.getByTestId("sermon-row"))).toHaveCount(0);
    await expect(results(page)).toHaveCount(0);
    expect(await cardFirst(page)).toBe(true);
    await expect(live(page)).toHaveText(`${TITLE} ${BODY} The Apostle’s teaching couldn’t load just now.`);
    // Try again searches again.
    await page.evaluate(() => {
      (globalThis as { __aaoSearchFault?: Fault }).__aaoSearchFault = null;
    });
    await calm.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(results(page)).toHaveCount(4);
    await expectCard(page);
  });
}

// The search function answers care with nothing in it when its database is
// down: that is search failing too, not an answer to keep.
test("a care answer with nothing in it offers Try again, and isn't kept for the session", async ({ page }) => {
  await setFault(page, "empty");
  await search(page, "I want to die");
  await expectCard(page);
  const calm = shown(page.getByTestId("care-calm"));
  await expect(calm).toContainText("The Apostle’s teaching couldn’t load just now.");
  await expect(calm.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await expect(live(page)).toHaveText(`${TITLE} ${BODY} The Apostle’s teaching couldn’t load just now.`);
  await page.evaluate(() => {
    (globalThis as { __aaoSearchFault?: Fault }).__aaoSearchFault = null;
  });
  // Something else, then the same words again: searched again, not the empty answer.
  const field = page.getByRole("searchbox", { name: "What are you going through?" });
  await field.fill("grief");
  await field.press("Enter");
  await expect(results(page).first()).toBeVisible();
  await field.fill("I want to die");
  await field.press("Enter");
  await expect(results(page)).toHaveCount(4);
  await expectCard(page);
});

// Words that may mean distress: the card when search can't read them
// (failing closed), never otherwise.
const fails = { unavailable: "isn’t answering", busy: "is busy" } as const;
for (const fault of ["unavailable", "busy"] as const) {
  test(`words that may mean distress get the card when search ${fails[fault]}`, async ({ page }) => {
    await page.addInitScript((f) => {
      (globalThis as { __aaoSearchFault?: string }).__aaoSearchFault = f;
    }, fault);
    await search(page, "everything feels pointless");
    await expectCard(page);
    await expect(shown(page.getByTestId("care-calm"))).toContainText("The Apostle’s teaching couldn’t load just now.");
    await expect(page.getByTestId("search-unavailable")).toHaveCount(0);
    await expect(page.getByTestId("search-busy")).toHaveCount(0);
    await expect(shown(page.getByTestId("sermon-row"))).toHaveCount(0);
    expect(await cardFirst(page)).toBe(true);
  });
}

test("words that may mean distress, read as ordinary by search, show no card", async ({ page }) => {
  await search(page, "everything feels pointless");
  await expect(results(page).first()).toBeVisible();
  await expect(page.getByTestId("care-card")).toHaveCount(0);
});

test("a prayer to die to the flesh is not a crisis", async ({ page }) => {
  await search(page, "I want to die to my flesh");
  await expect(results(page).first()).toBeVisible();
  await expect(page.getByTestId("care-card")).toHaveCount(0);
});

test("words of distress aren't kept in recent searches", async ({ page }) => {
  await search(page, "I want to die");
  await expect(results(page)).toHaveCount(4);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(shown(page.getByRole("group", { name: "Common needs" }))).toBeVisible();
  await expect(page.getByRole("button", { name: "Search again: I want to die", exact: true })).toHaveCount(0);
  await expect(card(page)).toHaveCount(0);
});

test("an ordinary search shows no care card", async ({ page }) => {
  await search(page, "I keep falling into the same sin");
  await expect(results(page)).toHaveCount(6);
  await expect(page.getByTestId("care-card")).toHaveCount(0);
});
