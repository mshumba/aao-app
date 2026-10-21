import type { WatchProgress } from "./auth/types";
import { isFinished } from "./player/progress";

/**
 * Watched to the end, or near enough (isFinished): a series marks the
 * session done, and Home's topic rail leaves the sermon out.
 */
export function watched(watch: WatchProgress | null) {
  return !!watch && (watch.finished || isFinished(watch.positionSeconds, watch.durationSeconds));
}
