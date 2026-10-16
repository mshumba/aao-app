import { router, useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Directions, Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../auth/AccountProvider";
import { FlowButton } from "../auth/ui";
import { greeting } from "../home/copy";
import { ItalicTitle, Kicker } from "../kit";
import { useReducedMotion } from "../motion";
import { usePageTitle } from "../navigation";
import { motion } from "../onboarding/parts";
import { c, easeOut, font, space, textCap, type } from "../theme";
import { T, gradient, web } from "../ui";
import { currentBlessing, primeBlessings, spokenBlessing, takeBlessing, type Blessing } from "./data";
import { blessingIsOnScreen, setBlessingOnScreen, type Opening } from "./schedule";
import { BlessingWall } from "./Wall";

/** The words arrive over this long (a fade alone under Reduce Motion). */
const ENTER_MS = 400;
const ENTER_REDUCED_MS = 250;
/** Web: the screen fades away over Home this long before it closes. */
const LEAVE_MS = 280;
const LEAVE_REDUCED_MS = 180;

/** From this window width (a tablet, a laptop) the blessing is set larger. */
const WIDE = 700;
/** The words' column: the welcome's on a phone, a little wider on a laptop. */
const COLUMN = 560;
const COLUMN_WIDE = 640;
/** The phone column the type sizes are set for (a 390pt phone). */
const PHONE_MEASURE = 390 - 2 * space.gutter;

// Whether the blessing screen showing is already on its way out (one at a time).
let leaving = false;

/**
 * The blessing, on its own calm screen (15 October 2026: "like a splash
 * screen then you click continue and go into the app"): the greeting, the
 * blessing in large Newsreader italic with its Bible reference, the
 * Apostle's name, and one way on. Text only: nothing to play or open.
 *
 * In the welcome's style: its wall of the sermons' artwork, in soft focus
 * (src/blessing/Wall.tsx), as a band that fades into the ivory page before
 * the words begin, and the welcome's button.
 * Continue stays on screen, below the words, which scroll above it if
 * they ever need to (small phones, very large text). Continue, a swipe down
 * (native, when nothing scrolls), Escape (web) or the screen reader's
 * escape gesture all go on to the app with a gentle fade.
 */
export function BlessingScreen({ opening }: { opening: Opening | null }) {
  usePageTitle("A blessing for you");
  const account = useAccount();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
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

  // ---- Whether the words scroll (small phones, very large text) ------------------
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const scrolls = viewport > 0 && content > viewport + 1;
  const onViewport = useCallback((event: LayoutChangeEvent) => {
    setViewport(Math.round(event.nativeEvent.layout.height));
  }, []);
  const onContent = useCallback((_: number, h: number) => setContent(Math.round(h)), []);

  // ---- A swipe down goes on, as Continue does: native only (on the web it
  // would fight the page's own scrolling, and Escape or Continue do it), and
  // only while nothing scrolls, so pulling the words back down never closes
  // the screen by mistake. Continue is always on screen either way. --------
  const fling = useMemo(
    () =>
      Gesture.Fling()
        .enabled(native && !scrolls)
        .direction(Directions.DOWN)
        .runOnJS(true)
        .onStart(() => leave()),
    [native, scrolls, leave],
  );

  const name = account.user ? account.displayName?.trim() || null : null;
  const spoken = blessing ? spokenBlessing(blessing) : "";
  const wide = width >= WIDE;
  const column = wide ? COLUMN_WIDE : COLUMN;
  const measure = Math.min(width, column) - 2 * space.gutter;
  const size = blessing ? sizeFor(blessing.text, wide, measure) : null;
  const greetingSize = greetingFor(wide, measure);
  // The sermons' wall: as tall as the room the words leave allows, within
  // these limits. It fades fully into the page above the words, and when
  // they need more room it gives way first (down to a sliver).
  const bandMin = Math.round(Math.min(96, Math.max(48, height * 0.14))) + insets.top;
  const bandMax = Math.round(Math.min(340, Math.max(160, height * 0.4))) + insets.top;
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
          <ScrollView
            style={styles.fill}
            bounces={false}
            overScrollMode="never"
            onLayout={onViewport}
            onContentSizeChange={onContent}
            contentContainerStyle={styles.scroll}
          >
            <View
              testID="blessing-band"
              style={[styles.band, { flexBasis: bandMin, minHeight: bandMin, maxHeight: bandMax }]}
            >
              <BlessingWall reach={bandMax} reduced={reduced} />
              <View style={[StyleSheet.absoluteFill, styles.bandFade]} />
            </View>

            <View style={[styles.column, { maxWidth: column }, styles.words, wide && styles.wordsWide]}>
              {blessing && size ? (
                <>
                  <Rise delay={60} duration={enter} reduced={reduced}>
                    <ItalicTitle
                      nativeID="blessing-greeting"
                      text={greeting(name)}
                      italicLast={!!name}
                      accessibilityRole="header"
                      {...web({ "aria-level": 1 })}
                      style={[type.greeting, styles.greeting, greetingSize]}
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
                      style={[styles.blessingWords, wide && styles.blessingWordsWide]}
                    >
                      <T
                        testID="blessing-text"
                        style={[styles.blessingText, size]}
                        maxFontSizeMultiplier={textCap.display}
                      >
                        {blessing.text}
                      </T>
                      {blessing.scriptureRef ? (
                        <T
                          testID="blessing-reference"
                          style={[styles.reference, wide && styles.referenceWide]}
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
          </ScrollView>

          {/* Native: words scrolled up stay clear of the clock. */}
          {scrolls && insets.top > 0 ? (
            <View style={[styles.statusScrim, { height: insets.top + space.md }]} />
          ) : null}

          <View
            style={[
              styles.column,
              styles.actions,
              { maxWidth: column, paddingBottom: Math.max(insets.bottom, space.lg) + space.sm },
            ]}
          >
            {/* Words scrolling under Continue fade out rather than cut off. */}
            {scrolls ? <View style={styles.actionsFade} /> : null}
            {blessing ? (
              <Rise delay={360} duration={enter} reduced={reduced}>
                <FlowButton
                  shape="rounded"
                  label="Continue"
                  testID="blessing-continue"
                  onPress={leave}
                />
              </Rise>
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

/**
 * The blessing's size: large enough to lead the screen, stepping down with
 * its length so the longer ones still sit comfortably. On a 390pt phone the
 * shortest (40 characters) takes two lines at 36pt and the longest (185) six
 * at 26pt; on a narrower phone the type steps down a little (to 0.86× at
 * most) rather than run to more lines: seven at 22pt on a 320pt phone. From
 * 700pt wide (a tablet, a laptop) it's set larger, 36 to 46pt, in a measure
 * of about 30 characters a line: the longest takes six lines there. Nothing
 * is ever cut off: the words scroll above Continue if they must.
 */
function sizeFor(text: string, wide: boolean, measure: number): TextStyle {
  const n = text.length;
  const step = n <= 64 ? 0 : n <= 110 ? 1 : n <= 150 ? 2 : 3;
  const [fontSize, lineHeight, letterSpacing] = (wide ? WIDE_SIZES : PHONE_SIZES)[step];
  const scale = narrowing(wide, measure);
  return {
    fontSize: Math.round(fontSize * scale),
    lineHeight: Math.round(lineHeight * scale),
    letterSpacing,
    // About 30 characters a line.
    maxWidth: wide ? Math.round(fontSize * 13.5) : undefined,
  };
}

/** The greeting: a step below the blessing, and smaller with it on a narrow phone. */
function greetingFor(wide: boolean, measure: number): TextStyle {
  if (wide) return { fontSize: 24, lineHeight: 30 };
  const scale = narrowing(wide, measure);
  return { fontSize: Math.round(22 * scale), lineHeight: Math.round(28 * scale) };
}

/** Narrower than a 390pt phone, the type steps down a little (to 0.86× at most). */
function narrowing(wide: boolean, measure: number) {
  return wide ? 1 : Math.min(1, Math.max(0.86, measure / PHONE_MEASURE));
}

/** [size, line height, tracking] by length: up to 64, 110, 150 characters, longer. */
const PHONE_SIZES = [
  [36, 44, -0.5],
  [32, 40, -0.4],
  [28, 36, -0.3],
  [26, 34, -0.2],
] as const;
const WIDE_SIZES = [
  [46, 54, -0.6],
  [42, 50, -0.5],
  [38, 46, -0.4],
  [36, 44, -0.3],
] as const;

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
  // The band takes the room the words leave (between its limits), and the
  // words sit in the middle of whatever is left after that.
  scroll: { flexGrow: 1 },
  band: { flexGrow: 4, flexShrink: 0, overflow: "hidden" },
  // Under the clock, a light wash; then the artwork; then fully the page
  // before the words begin, whatever the band's height.
  bandFade: gradient(
    `linear-gradient(180deg, ${c.bg}cc 0%, ${c.bg}00 22%, ${c.bg}00 46%, ${c.bg}99 70%, ${c.bg}f0 88%, ${c.bg} 100%)`,
  ),
  column: {
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: space.gutter,
  },
  words: {
    flexGrow: 1,
    flexShrink: 0,
    justifyContent: "center",
    gap: 28,
    paddingTop: space.sm,
    paddingBottom: space.xl,
  },
  wordsWide: { gap: 36 },
  greeting: { color: c.text },
  blessing: { gap: space.md },
  blessingWords: { gap: space.md },
  blessingWordsWide: { gap: space.lg },
  blessingText: { fontFamily: font.serifRegularItalic, color: c.text },
  // Quieter than the label above: the page's own serif, upright, in grey.
  reference: { fontFamily: font.serifRegular, fontSize: 17, lineHeight: 24, color: c.muted },
  referenceWide: { fontSize: 19, lineHeight: 26 },
  byline: { flexDirection: "row", alignItems: "center", gap: 10 },
  bylineRule: { width: 20, height: 1.5, borderRadius: 1, backgroundColor: c.gold },
  bylineText: { ...type.meta, color: c.muted },
  statusScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: "none",
    ...gradient(`linear-gradient(180deg, ${c.bg} 70%, ${c.bg}00 100%)`),
  },
  // The welcome's "Get started": flat, rounded, the column's full width.
  actions: { paddingTop: space.md },
  actionsFade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -space.xl,
    height: space.xl,
    pointerEvents: "none",
    ...gradient(`linear-gradient(180deg, ${c.bg}00 0%, ${c.bg} 100%)`),
  },
  unseen: { position: "absolute", width: 1, height: 1, overflow: "hidden", left: -1, top: 0 },
});
