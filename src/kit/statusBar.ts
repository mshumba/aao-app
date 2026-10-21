import { useIsFocused, useNavigation } from "expo-router";
import { useLayoutEffect } from "react";

type StatusBarOptions = {
  statusBarStyle: "light" | "dark";
  statusBarHidden: boolean;
  navigationBarHidden: boolean;
};
type Navigation = {
  getState(): { type: string } | undefined;
  getParent(): Navigation | undefined;
  setOptions(options: StatusBarOptions): void;
};

/**
 * A screen's status bar: light over dark artwork, dark on the ivory page
 * (every screen's default, set in the root layout), hidden for a sermon in
 * full screen. It's set through the native stack's screen options: the app
 * runs with view-controller-based status bar appearance (app.json), since
 * iOS 27 ignores the old app-wide calls (hiding it did nothing there), so no
 * part of the app sets it any other way.
 *
 * Full screen hides Android's navigation bar too (an option iOS ignores),
 * which also makes both bars come back only for a moment after a swipe;
 * hiding the status bar alone would let a swipe bring it back for good.
 *
 * A tab sets it on the stack screen that holds the tabs while it's the tab
 * in front, so each tab says what it wants. `null` leaves it to another
 * part of the screen (a page that hands it to its cover once it has loaded).
 */
export function useStatusBar(style: "light" | "dark" | null, fullscreen = false) {
  const navigation = useNavigation() as unknown as Navigation;
  const focused = useIsFocused();
  useLayoutEffect(() => {
    if (!focused || !style) return;
    let screen: Navigation | undefined = navigation;
    while (screen && screen.getState()?.type !== "stack") screen = screen.getParent();
    screen?.setOptions({
      statusBarStyle: style,
      statusBarHidden: fullscreen,
      navigationBarHidden: fullscreen,
    });
  }, [focused, navigation, style, fullscreen]);
}
