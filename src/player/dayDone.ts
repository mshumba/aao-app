import * as Haptics from "expo-haptics";
import { usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { usePaths } from "../learning";
import { pathWords } from "../paths/model";
import { useToast } from "../toast";
import { usePlayerSession } from "./PlayerProvider";

/**
 * When playback marks a path day done (its sermon watched, wherever the
 * viewer is by then), says so quietly: "Day 3 done" as a toast with a light
 * tap, no streaks or confetti. The path's own page says it with its Day
 * complete sheet instead.
 */
export function useDayDoneNotice() {
  const { dayDone } = usePlayerSession();
  const toast = useToast();
  const { paths, daysOf } = usePaths();
  const pathname = usePathname();
  const latest = useRef({ toast, paths, daysOf, pathname });
  useEffect(() => {
    latest.current = { toast, paths, daysOf, pathname };
  });
  useEffect(() => {
    if (!dayDone) return;
    const { toast: show, paths: all, daysOf: daysFor, pathname: here } = latest.current;
    if (here === `/path/${dayDone.pathId}`) return;
    const path = all.find((p) => p.id === dayDone.pathId);
    const words = pathWords(path ?? { kind: "path" });
    // Only the next day due is ever marked, so the last day finishes it.
    const last = !!path && dayDone.day >= daysFor(dayDone.pathId).length;
    show(last ? `${path.name} complete` : `${words.unit} ${dayDone.day} done`, "checkmark-circle");
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [dayDone]);
}
