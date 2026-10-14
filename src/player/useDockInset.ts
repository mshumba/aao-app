import { usePathname } from "expo-router";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DOCK_MARGIN, TAB_PATHS, dockFrame, useChrome } from "./layout";
import { usePlayerSession } from "./PlayerProvider";

/** Whether the dock sits above the tab bar: on a tab, or while returning to one. */
export function useDockAboveTabs() {
  const pathname = usePathname();
  const { dockAboveTabs } = usePlayerSession();
  return TAB_PATHS.includes(pathname) || dockAboveTabs;
}

/** Extra bottom space a screen needs so its content can scroll clear of the dock. */
export function useDockInset() {
  const { sermon, stage } = usePlayerSession();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const aboveTabs = useDockAboveTabs();
  const chrome = useChrome();
  if (!sermon || stage === sermon.id) return 0;
  return dockFrame(window, insets, aboveTabs, chrome).height + DOCK_MARGIN;
}
