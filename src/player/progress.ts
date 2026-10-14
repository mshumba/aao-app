import type { WatchProgress } from "../auth/types";

/** While a sermon plays, its position is saved this often. */
export const SAVE_EVERY = 15_000;

/** Less than this in, a sermon starts from the beginning again. */
export const MIN_RESUME = 15;

/**
 * Near enough the end to count as watched: the last 30 seconds, or the last
 * 2% of a long sermon (about four minutes of a three-hour one), which is
 * usually the closing prayer and announcements.
 */
export function isFinished(position: number, duration: number) {
  if (!duration) return false;
  return duration - position <= Math.max(30, duration * 0.02);
}

/** Where a sermon should start for this viewer, in whole seconds. */
export function resumePoint(progress: WatchProgress | null) {
  if (!progress || progress.finished) return 0;
  const at = Math.floor(progress.positionSeconds);
  if (at < MIN_RESUME) return 0;
  if (progress.durationSeconds && isFinished(at, progress.durationSeconds)) return 0;
  return at;
}

/** Watched part of the sermon, 0 to 1. */
export function fraction(progress: WatchProgress) {
  if (!progress.durationSeconds) return 0;
  return Math.min(1, Math.max(0, progress.positionSeconds / progress.durationSeconds));
}

/** "42 min left", "1 hr 5 min left", "Under a minute left". */
export function timeLeft(progress: WatchProgress) {
  const left = Math.max(0, progress.durationSeconds - progress.positionSeconds);
  const minutes = Math.round(left / 60);
  if (minutes < 1) return "Under a minute left";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min left`;
  return m ? `${h} hr ${m} min left` : `${h} hr left`;
}
