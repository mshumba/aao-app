/**
 * Someone who may want to die or to harm themselves. Search answers such a
 * question with `care: true` (and comforting teaching, never the words as
 * typed); this is the app's own check for when it can't tell, such as a
 * search that fails or an older answer without the flag.
 *
 * The wordings are the search function's own: one file, imported here and by
 * the function (supabase/functions/_shared/distress.ts). `inDistress`: they
 * plainly say it, so the card always shows. `maybeDistress`: that, or a
 * wording of despair that may mean it ("I can't go on like this",
 * "hopeless"); the card shows when search can't answer. Devotional phrases
 * ("die to self", "ready to die for Christ") are neither.
 *
 * Plain TypeScript, no React Native, so the tests can run it directly.
 */
export { inDistress, maybeDistress } from "../../supabase/functions/_shared/distress";

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
