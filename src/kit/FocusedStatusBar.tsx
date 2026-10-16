import { useIsFocused } from "expo-router";
import { StatusBar, type StatusBarStyle } from "expo-status-bar";

/**
 * A screen's status bar, set while the screen is in front. Its own small
 * component, so moving to another screen and back re-renders this alone,
 * never the screen around it.
 */
export function FocusedStatusBar({
  style,
  animated = true,
}: {
  style: StatusBarStyle;
  animated?: boolean;
}) {
  return useIsFocused() ? <StatusBar style={style} animated={animated} /> : null;
}
