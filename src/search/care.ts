/**
 * Someone saying they want to die or to harm themselves. Search answers such
 * a question with `care: true` (and comforting teaching, never the words as
 * typed); this is the app's own check for when it can't tell, such as a
 * search that fails or an older answer without the flag. The same wordings
 * as the search function's CARE (supabase/functions/_shared/prompts.ts):
 * "die to self" and "dying to the flesh" are teaching phrases, not distress.
 *
 * Plain TypeScript, no React Native, so the tests can run it directly.
 */
const CARE =
  /\b(suicid\w*|kill(ing)? my ?self|end(ing)? (it all|my life|my own life)|take my (own )?life|(want|wanna|wish|ready) (to|i could|i was|i were) (die|be dead|dead)(?! to (self|myself|the flesh|sin))|wanna die(?! to)|don'?t want to (live|be alive|wake up)|do not want to (live|be alive|wake up)|no (reason|point) (to|in) (live|living|go on|going on)|self[- ]?harm\w*|(hurt|hurting|cut|cutting) my ?self|better off dead)\b/i;

/** Lower-case words only, as the search function compares questions. */
function normalise(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inDistress(text: string | null | undefined): boolean {
  return !!text && CARE.test(normalise(text));
}

/** Where "Find a helpline" goes: helplines by country, free and confidential. */
export const HELPLINE_URL = "https://findahelpline.com";

export const careText = {
  title: "You don’t have to carry this alone.",
  body: "If you might act on these thoughts, call your local emergency number now.",
  link: "Find a helpline",
  /** Under the card when search couldn't answer, or found nothing. */
  failed: "The Apostle’s teaching couldn’t load just now.",
  empty: "There’s nothing to show for this yet.",
};
