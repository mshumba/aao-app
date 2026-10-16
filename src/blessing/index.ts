/**
 * The blessing on opening the app (15 October 2026): its own calm screen at
 * a cold start and after 30 minutes or more away, opened from Home. Text
 * only, with the Bible reference; none repeated until all have been seen.
 */
export {
  currentBlessing,
  fixtureBlessings,
  hasBlessings,
  lastShownAt,
  nextBlessing,
  primeBlessings,
  refreshBlessings,
  spokenBlessing,
  takeBlessing,
  type Blessing,
} from "./data";
export { AWAY_MS, dueOpening, takeOpening, type Opening } from "./schedule";
export { BlessingScreen } from "./BlessingScreen";
export { useBlessingOnOpen } from "./useBlessingOnOpen";
