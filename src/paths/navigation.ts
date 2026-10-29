import { router } from "expo-router";
import { useCallback } from "react";
import { requestWatch, useNavigate } from "../navigation";
import { sermonHref } from "./model";

/**
 * Plays a day: opens its sermon and asks the sermon page to start once it
 * has settled (as Continue watching does), so ▶ means play. The whole
 * sermon: it resumes where the viewer left off, else starts where the
 * Apostle starts preaching; `at` jumps to one moment instead (a key
 * moment). With `path`, the sermon page knows which day of which path it
 * is, and so where its teaching starts.
 */
export function usePlayDay() {
  // Ignores a second tap until this screen is back in front (useNavigate).
  const once = useNavigate();
  return useCallback(
    (youtubeId: string, opts: { path?: { id: string; day: number }; at?: number } = {}) =>
      once(() => {
        requestWatch(youtubeId);
        router.push(sermonHref(youtubeId, opts));
      }),
    [once],
  );
}

/**
 * Opens a teaching series of one teaching at its sermon (it has no page of
 * its own), as an ordinary visit to that sermon.
 */
export function useOpenTeaching() {
  const once = useNavigate();
  return useCallback(
    (youtubeId: string) => once(() => router.push(sermonHref(youtubeId))),
    [once],
  );
}
