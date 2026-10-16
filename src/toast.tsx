import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInUp, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "./motion";
import { DOCK_MARGIN, useChrome } from "./player/layout";
import { useDockAboveTabs, useDockInset } from "./player/useDockInset";
import { radius, space, type } from "./theme";
import { Icon, IconName, T, c, web } from "./ui";

type Toast = { id: number; message: string; icon: IconName };
type ShowToast = (message: string, icon?: IconName) => void;

const ToastContext = createContext<ShowToast | null>(null);

const ease = Easing.bezier(0.23, 1, 0.32, 1);
const enter = FadeInUp.duration(200).easing(ease).withInitialValues({
  opacity: 0,
  transform: [{ translateY: 8 }],
});
// Exits run a little faster than entrances, along the same path.
const exit = FadeOut.duration(160).easing(ease);

/**
 * Brief confirmations ("Saved", "Link copied", "Signed out") above the tab
 * bar and docked player. One at a time; each is also announced.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const next = useRef(0);

  const show = useCallback<ShowToast>((message, icon = "checkmark-circle") => {
    if (timer.current) clearTimeout(timer.current);
    next.current += 1;
    setToast({ id: next.current, message, icon });
    // Native announces here; web uses the status region below.
    if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(message);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <ToastLayer toast={toast} />
    </ToastContext.Provider>
  );
}

function ToastLayer({ toast }: { toast: Toast | null }) {
  const insets = useSafeAreaInsets();
  const chrome = useChrome();
  const aboveTabs = useDockAboveTabs();
  const dock = useDockInset();
  const reduced = useReducedMotion();
  // Clear of the tab bar, and of the docked player when one is showing.
  const base = aboveTabs ? (chrome.tabBar ?? 72 + insets.bottom) : insets.bottom + DOCK_MARGIN;
  const bottom = base + dock + space.sm;
  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { justifyContent: "flex-end" }]}
    >
      <View
        pointerEvents="none"
        style={{ paddingBottom: bottom, alignItems: "center" }}
        {...web({ role: "status", "aria-live": "polite" })}
      >
        {toast && (
          <Animated.View
            key={toast.id}
            entering={reduced ? FadeIn.duration(150) : enter}
            exiting={exit}
            style={styles.toast}
            testID="toast"
          >
            <Icon name={toast.icon} size={20} color={c.white} />
            <T style={styles.text}>{toast.message}</T>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside ToastProvider.");
  return show;
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    maxWidth: 420,
    marginHorizontal: space.gutter,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    // Inverted (ink with white text): nearly everything near the bottom of
    // the screen is a white surface with a hairline, so a white toast would
    // read as one more pill rather than a passing message.
    backgroundColor: c.text,
    boxShadow: "0 8px 24px rgba(27,30,36,0.18)",
  },
  text: { ...type.label, color: c.white, flexShrink: 1 },
});
