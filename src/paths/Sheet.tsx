import { useEffect, useRef, type ReactNode } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "../motion";
import { motion } from "../onboarding/parts";
import { c, easeOut, space } from "../theme";
import { noWebOutline, returnFocus, web } from "../ui";

/** Wide browser windows get a centred card instead of a bottom sheet. */
const DIALOG_WIDTH = 768;

/**
 * A white sheet over a soft scrim (the doc's Sheet: top radius 24, a 36×5
 * grabber, Level 3 shadow), sized to its content and scrolling past the
 * room on screen (large text). Closes on the scrim, Escape (web) and the
 * Android back button; focus goes back to what opened it (web). It rises
 * 48pt as it fades in, or only fades under Reduce Motion.
 */
export function PathSheet({
  visible,
  onClose,
  label,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  /** The sheet's name for assistive tech: "Day 3 done". */
  label: string;
  children: ReactNode;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const dialog = Platform.OS === "web" && width >= DIALOG_WIDTH;
  // Web: what had focus when the sheet opened, to return to on close.
  const opener = useRef<Element | null>(null);
  const panel = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    opener.current = document.activeElement;
    // Focus the sheet itself, so its name is read out first and the
    // browser doesn't ring the whole window.
    const timer = setTimeout(() => (panel.current as unknown as HTMLElement | null)?.focus(), 0);
    return () => {
      clearTimeout(timer);
      returnFocus(opener.current);
      opener.current = null;
    };
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, dialog && styles.backdropDialog]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.scrim,
            { animationName: motion.fade, animationDuration: 200, animationTimingFunction: easeOut },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessible={false}
            focusable={false}
            {...web({ "aria-hidden": true, tabIndex: -1 })}
          />
        </Animated.View>
        <Animated.View
          ref={panel}
          testID={testID}
          accessibilityViewIsModal
          accessibilityLabel={label}
          {...web({ role: "dialog", "aria-modal": true, "aria-label": label, tabIndex: -1 })}
          style={[
            styles.panel,
            dialog ? styles.panelDialog : styles.panelSheet,
            noWebOutline as ViewStyle | null,
            { maxHeight: height - Math.max(insets.top, 24) - 16 },
            {
              animationName: reduced ? motion.fade : motion.sheet,
              animationDuration: reduced ? 150 : 280,
              animationTimingFunction: easeOut,
            },
          ]}
        >
          {dialog ? null : <View style={styles.grabber} accessible={false} {...web({ "aria-hidden": true })} />}
          <ScrollView
            bounces={false}
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: (dialog ? space.xl : Math.max(insets.bottom, space.lg)) + space.sm },
            ]}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  backdropDialog: { justifyContent: "center", alignItems: "center", padding: space.xl },
  scrim: { backgroundColor: "rgba(17,20,26,0.32)" },
  panel: {
    backgroundColor: c.raised,
    boxShadow: "0 -8px 32px rgba(27,30,36,0.16)",
    width: "100%",
    overflow: "hidden",
  },
  panelSheet: {
    maxWidth: 560,
    alignSelf: "center",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  panelDialog: { maxWidth: 440, borderRadius: 24 },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: c.track,
    marginTop: 8,
  },
  scroll: { flexGrow: 0 },
  content: { paddingHorizontal: space.gutter, paddingTop: 20 },
});
