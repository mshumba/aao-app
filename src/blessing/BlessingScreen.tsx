import { router, useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Directions, Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../auth/AccountProvider";
import { greeting } from "../home/copy";
import { ItalicTitle, Kicker, PlayPill } from "../kit";
import { useReducedMotion } from "../motion";
import { usePageTitle } from "../navigation";
import { ArtworkCollage } from "../onboarding/ArtworkCollage";
import { motion } from "../onboarding/parts";
import { c, easeOut, font, fontSize, space, textCap, type } from "../theme";
import { T, web } from "../ui";
import { currentBlessing, primeBlessings, spokenBlessing, takeBlessing, type Blessing } from "./data";
import { blessingIsOnScreen, setBlessingOnScreen, type Opening } from "./schedule";

/** The words arrive over this long (a fade alone under Reduce Motion). */
const ENTER_MS = 400;
const ENTER_REDUCED_MS = 250;
/** Web: the screen fades away over Home this long before it closes. */
const LEAVE_MS = 280;
const LEAVE_REDUCED_MS = 180;

// Whether the blessing screen showing is already on its way out (one at a time).
let leaving = false;

/**
 * The blessing, on its own calm screen (15 October 2026: "like a splash
 * screen then you click continue and go into the app"): the greeting, the
 * blessing in large Newsreader italic with its Bible reference, the
 * Apostle's name, and one way on. Text only: nothing to play or open.
 *
 * In the welcome's style: the ivory page under a quiet band of the sermons'
 * artwork. Continue, a swipe down, Escape (web) or the screen reader's
 * escape gesture all go on to the app with a gentle fade.
 */
export function BlessingScreen({ opening }: { opening: Opening | null }) {
  usePageTitle("A blessing for you");
  const account = useAccount();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const focused = useIsFocused();
  // The entrance plays once, as it started, even if the setting changes.
  const live = useReducedMotion();
  const [reduced] = useState(live);
  const [blessing, setBlessing] = useState<Blessing | null>(currentBlessing);
  const [fading, setFading] = useState(false);
  const root = useRef<View>(null);
  const native = Platform.OS !== "web";

  // ---- Leaving --------------------------------------------------------------------
  useEffect(() => {
    leaving = false;
  }, []);
  const leave = useCallback(() => {
    // Once: a second tap (or a tap and a swipe) mustn't close what's under it too.
    if (leaving) return;
    leaving = true;
    const go = () => (router.canGoBack() ? router.back() : router.replace("/"));
    // Native: the modal fades away itself (its animation is "fade").
    if (native) return go();
    setFading(true);
    // Unless it went meanwhile (the browser's Back), which would make this
    // close the screen under it instead.
    setTimeout(() => blessingIsOnScreen() && go(), reduced ? LEAVE_REDUCED_MS : LEAVE_MS);
  }, [native, reduced]);

  // A link straight here (or a reload of it): the next blessing, or Home if
  // there's none on the device yet.
  useEffect(() => {
    if (blessing) return;
    let alive = true;
    primeBlessings().then(() => {
      if (!alive) return;
      const next = currentBlessing() ?? takeBlessing();
      if (next) setBlessing(next);
      else leave();
    });
    return () => {
      alive = false;
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setBlessingOnScreen(true);
    return () => setBlessingOnScreen(false);
  }, []);

  // ---- Web: a modal dialog, read out, with focus on Continue ---------------------
  const shown = !!blessing;
  useEffect(() => {
    if (native || !focused || !shown) return;
    const node = root.current as unknown as HTMLElement | null;
    if (!node) return;
    const silenced = silenceOutside(node);
    // The dialog's name (the greeting) and description (the blessing) are
    // read as focus arrives on its one control. Enter goes on; the focus
    // ring waits for the keyboard's first use, so the page opens clean.
    node
      .querySelector<HTMLElement>('[data-testid="blessing-continue"]')
      ?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      leave();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      for (const sibling of silenced) sibling.inert = false;
    };
  }, [native, focused, shown, leave]);

  // ---- A swipe down goes on, as Continue does (native: on the web it would
  // fight the page's own scrolling, and Escape or Continue do it) ----------------
  const fling = useMemo(
    () =>
      Gesture.Fling()
        .enabled(native)
        .direction(Directions.DOWN)
        .runOnJS(true)
        .onStart(() => leave()),
    [native, leave],
  );

  const name = account.user ? account.displayName?.trim() || null : null;
  const spoken = blessing ? spokenBlessing(blessing) : "";
  // The sermons' wall, kept low and quiet: a soft band above the words.
  const band = Math.round(Math.min(260, Math.max(150, height * 0.26))) + insets.top;
  const enter = reduced ? ENTER_REDUCED_MS : ENTER_MS;

  return (
    <GestureHandlerRootView style={styles.fill}>
      {focused ? <StatusBar style="dark" animated /> : null}
      <GestureDetector gesture={fling}>
        <Animated.View
          ref={root}
          testID="blessing-screen"
          style={[
            styles.screen,
            // Web, coming back to the app: the page fades in over Home (the
            // native modal fades itself). At a launch it's there at once.
            !native &&
              opening === "return" && {
                animationName: motion.fade,
                animationDuration: enter,
                animationTimingFunction: easeOut,
              },
            !native && {
              opacity: fading ? 0 : 1,
              transitionProperty: "opacity",
              transitionDuration: reduced ? LEAVE_REDUCED_MS : LEAVE_MS,
              transitionTimingFunction: easeOut,
            },
          ]}
          role={native ? undefined : "dialog"}
          aria-modal={native ? undefined : true}
          aria-labelledby={native ? undefined : "blessing-greeting"}
          {...web({ "aria-describedby": "blessing-spoken" })}
          accessibilityViewIsModal
          onAccessibilityEscape={leave}
        >
          <View style={[styles.band, { height: band }]}>
            <ArtworkCollage reduced={reduced} />
          </View>

          <ScrollView
            bounces={false}
            overScrollMode="never"
            contentContainerStyle={[styles.scroll, { paddingTop: Math.round(band * 0.62) }]}
          >
            <View style={[styles.column, styles.words]}>
              {blessing ? (
                <>
                  <Rise delay={60} duration={enter} reduced={reduced}>
                    <ItalicTitle
                      nativeID="blessing-greeting"
                      text={greeting(name)}
                      italicLast={!!name}
                      accessibilityRole="header"
                      {...web({ "aria-level": 1 })}
                      style={[type.greeting, styles.greeting]}
                      maxFontSizeMultiplier={textCap.display}
                    />
                  </Rise>
                  <Rise delay={160} duration={enter} reduced={reduced} style={styles.blessing}>
                    {/* Said once, as "Blessing: …" below, so the label is unseen to screen readers. */}
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      {...web({ "aria-hidden": true })}
                    >
                      <Kicker>A blessing for you</Kicker>
                    </View>
                    {/* Web: what screen readers say (the dialog's description). */}
                    {native ? null : (
                      <T nativeID="blessing-spoken" style={styles.unseen}>
                        {spoken}
                      </T>
                    )}
                    <View
                      testID="blessing"
                      accessible={native}
                      accessibilityLabel={native ? spoken : undefined}
                      {...web({ "aria-hidden": true })}
                      style={styles.blessingWords}
                    >
                      <T
                        testID="blessing-text"
                        style={[styles.blessingText, sizeFor(blessing.text)]}
                        maxFontSizeMultiplier={textCap.quote}
                      >
                        {blessing.text}
                      </T>
                      {blessing.scriptureRef ? (
                        <T
                          testID="blessing-reference"
                          style={styles.reference}
                          maxFontSizeMultiplier={textCap.section}
                        >
                          {blessing.scriptureRef}
                        </T>
                      ) : null}
                    </View>
                  </Rise>
                  <Rise delay={260} duration={enter} reduced={reduced} style={styles.byline}>
                    <View style={styles.bylineRule} />
                    <T style={styles.bylineText}>Apostle Arome Osayi</T>
                  </Rise>
                </>
              ) : null}
            </View>

            <View
              style={[
                styles.column,
                styles.actions,
                { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm },
              ]}
            >
              {blessing ? (
                <Rise delay={360} duration={enter} reduced={reduced}>
                  <PlayPill
                    testID="blessing-continue"
                    tone="navy"
                    size="lg"
                    icon="none"
                    label="Continue"
                    onPress={leave}
                  />
                </Rise>
              ) : null}
            </View>
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

/**
 * The blessing's size: as large as reads well for its length, so the longest
 * (185 characters) still takes five lines at most on a 390pt phone and none
 * is ever cut off.
 */
function sizeFor(text: string) {
  const n = text.length;
  if (n <= 90) return styles.sizeLarge;
  if (n <= 130) return styles.sizeMedium;
  return styles.sizeSmall;
}

/** Up 8pt as it fades in (a fade alone under Reduce Motion), once. */
function Rise({
  delay,
  duration,
  reduced,
  style,
  children,
}: {
  delay: number;
  duration: number;
  reduced: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Animated.View
      style={[
        style,
        {
          animationName: reduced ? motion.fade : motion.rise,
          animationDuration: duration,
          animationDelay: delay,
          animationTimingFunction: easeOut,
          animationFillMode: "backwards",
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Web: everything on the page outside `root` becomes inert (Home underneath,
 * the tab bar, the docked player) while the blessing is in front. Returns
 * what it changed, to undo exactly that.
 */
function silenceOutside(root: HTMLElement) {
  const silenced: HTMLElement[] = [];
  let node = root;
  while (node !== document.body && node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
      if (sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE") continue;
      sibling.inert = true;
      silenced.push(sibling);
    }
    node = node.parentElement;
  }
  return silenced;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { flex: 1, backgroundColor: c.bg },
  band: { position: "absolute", top: 0, left: 0, right: 0, opacity: 0.5 },
  scroll: { flexGrow: 1 },
  column: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: space.gutter,
  },
  // The words sit in the middle of the room the band and Continue leave.
  words: { flexGrow: 1, justifyContent: "center", gap: space.xxl, paddingVertical: space.xl },
  greeting: { color: c.text },
  blessing: { gap: space.md },
  blessingWords: { gap: space.lg },
  blessingText: { fontFamily: font.serifRegularItalic, color: c.text },
  sizeLarge: { fontSize: fontSize.question, lineHeight: 38, letterSpacing: -0.4 },
  sizeMedium: { fontSize: fontSize.sermon, lineHeight: 35, letterSpacing: -0.3 },
  sizeSmall: { fontSize: fontSize.section, lineHeight: 32, letterSpacing: -0.2 },
  reference: { ...type.overline, color: c.gold },
  byline: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: -space.sm },
  bylineRule: { width: 20, height: 1.5, borderRadius: 1, backgroundColor: c.gold },
  bylineText: { ...type.meta, color: c.muted },
  actions: { paddingTop: space.lg },
  unseen: { position: "absolute", width: 1, height: 1, overflow: "hidden", left: -1, top: 0 },
});
