import { router, usePathname } from "expo-router";
import { useEffect, useReducer, useState, useSyncExternalStore } from "react";
import { Linking, Platform } from "react-native";
import { useAccount } from "../auth/AccountProvider";
import { learningMode } from "../learning/session";
import { TAB_PATHS } from "../player/layout";
import { hasBlessings, primeBlessings, refreshBlessings, takeBlessing } from "./data";
import {
  automatedSkip,
  coverState,
  dueOpening,
  markOpening,
  onDue,
  setCover,
  settleDue,
  subscribeCover,
  watchAway,
} from "./schedule";

/** At a cold start with nothing kept yet, wait this long at most for the list. */
const LIST_WAIT_MS = 1500;

/**
 * Web: the address the page was opened at (react-native-web keeps it from
 * the page's load). A page opened at another tab (/paths, /search,
 * /account, or a reload there) mounts Home only when it's visited later,
 * so the pathname alone would take that visit for a launch onto Home.
 * Native: "/" (an app opened from a link lands on a screen over Home, which
 * mounts with it).
 */
async function openedAt(): Promise<string> {
  if (Platform.OS !== "web") return "/";
  try {
    const url = await Linking.getInitialURL();
    return url ? new URL(url).pathname || "/" : "/";
  } catch {
    return "/";
  }
}

/**
 * Opens the blessing screen from Home when one is due (see schedule.ts):
 * - at a cold start, only when the app opens onto Home: never over a shared
 *   or deep link (/s/…, /sermon/…, /path/…), the welcome, onboarding or a
 *   sign-in step, nor later on Home after the web page opened at another
 *   tab (/paths, /search, /account);
 * - coming back after 30 minutes or more, only on one of the tabs (not
 *   mid-sermon, mid-sign-in or on a sheet).
 * Returns true while Home should stay covered at a cold start (deciding, or
 * the blessing screen still opening), so Home doesn't flash first.
 */
export function useBlessingOnOpen(): boolean {
  const account = useAccount();
  const pathname = usePathname();
  const [primed, setPrimed] = useState(false);
  // The list is in (fetched, failed, or waited for long enough).
  const [listSettled, setListSettled] = useState(learningMode === "local");
  const [opened, setOpened] = useState<string | null>(Platform.OS === "web" ? null : "/");
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  const cover = useSyncExternalStore(subscribeCover, coverState, coverState);

  useEffect(() => {
    let alive = true;
    watchAway();
    openedAt().then((path) => alive && setOpened(path));
    primeBlessings().then(() => alive && setPrimed(true));
    refreshBlessings().finally(() => alive && setListSettled(true));
    const wait = setTimeout(() => alive && setListSettled(true), LIST_WAIT_MS);
    // Coming back: this blessing from the device's copy; the list freshens
    // behind it for next time.
    const off = onDue(() => {
      refreshBlessings();
      bump();
    });
    return () => {
      alive = false;
      clearTimeout(wait);
      off();
    };
  }, []);

  const due = dueOpening();
  const firstRun = !account.welcomed && !account.user;
  useEffect(() => {
    if (!due || !account.ready || !primed || opened == null) return;
    // The welcome opens instead (first launch), or a link opened the app
    // (including one to another tab, with Home visited after).
    const place =
      due === "launch" ? pathname === "/" && opened === "/" : TAB_PATHS.includes(pathname);
    if (firstRun || !place || automatedSkip()) {
      settleDue();
      setCover("done");
      return;
    }
    if (!hasBlessings()) {
      // Nothing kept yet: a moment for the first fetch, then go without.
      if (due === "launch" && !listSettled) return;
      settleDue();
      setCover("done");
      return;
    }
    settleDue();
    takeBlessing();
    markOpening(due);
    setCover(due === "launch" ? "opening" : "done");
    router.push("/blessing");
  }, [due, tick, account.ready, firstRun, primed, listSettled, pathname, opened]);

  return cover !== "done";
}
