import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextLayoutEventData,
  type ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { headline } from "../data/display";
import type { Sermon } from "../data/sermons";
import { Artwork, Avatar, ItalicTitle, Kicker, PlayPill, RoundButton, Wash, spokenKicker, spokenText, spokenTime } from "../kit";
import { useReducedMotion } from "../motion";
import { motion } from "../onboarding/parts";
import { c, easeOut, font, gradients, radius, shadows, textCap, type } from "../theme";
import { T, Tap, gradient, web, type WebKey } from "../ui";
import { greeting, heroKicker } from "./copy";

/**
 * Home's dark hero (the approved concept's screen 01): the newest sermons
 * as a pager the viewer moves (never on its own), each one's artwork
 * cropped to the preacher on the right and washed into the dark on the
 * left, where the greeting, the kicker and the title sit. Watch and Save act
 * on the sermon showing; the dots say which one it is.
 *
 * The band runs under the status bar. Its height is the concept's 340pt on
 * a phone with a 54pt status bar, and grows only if a title needs a third
 * line, measured once for all four pages so swiping never changes it.
 */

/** The question field overlaps the hero's bottom edge by this much. */
export const HERO_OVERLAP = 56;

const AVATAR = 38;
/** Kicker 14 + 6 + two lines of the masthead (41 each). */
const BODY_MIN = 102;
const ACTIONS = 48;
/** From the hero's bottom edge to the bottom of Watch. */
const ACTIONS_BOTTOM = 70;
/** From the hero's bottom edge to the bottom of the title. */
const BODY_BOTTOM = ACTIONS_BOTTOM + ACTIONS + 14;
// The concept's crop: the artwork 716×403, its right edge 101pt past the
// screen's, its bottom 51pt below the hero's (so the face sits beside the
// title, never under it).
const ART_W = 716;
const ART_RIGHT_BLEED = 101;
const ART_BOTTOM_BLEED = 51;
const ART_H = Math.round((ART_W * 9) / 16);
/** The title column: beside the preacher's face, never across it. */
const TITLE_MAX = 252;
/**
 * The masthead steps down for a long title: 39/41 when it fits on two
 * lines, else 34/37 on two, else 31/34 on up to three. The words never
 * change and are never cut off.
 */
const TITLE_STEPS = [
  { fontSize: 39, lineHeight: 41, letterSpacing: -0.8 },
  { fontSize: 34, lineHeight: 37, letterSpacing: -0.6 },
  { fontSize: 31, lineHeight: 34, letterSpacing: -0.5 },
] as const;
/** Later pages fetch their artwork once the viewer moves the pager, or after this. */
const REST_MS = 2500;
/** On the first launch, the words wait this long at most for the artwork. */
const ART_WAIT_MS = 1200;
/** "Loading the latest sermons" only if the library takes longer than this. */
const LOADING_AFTER_MS = 400;

/**
 * The scrim across a page: dark under the title, clearing just past its
 * longest line (`edge`, in points from the left), so the face stays bright.
 * With the concept's own title (edge 248) these are its 51/61/71/80% stops.
 */
function heroScrim(edge: number | null) {
  if (edge == null) return gradients.heroScrim;
  const e = Math.round(edge);
  return (
    "linear-gradient(180deg, rgba(15,17,21,0.62) 0px, rgba(15,17,21,0) 130px), " +
    `linear-gradient(90deg, rgba(15,17,21,0.99) 0px, rgba(15,17,21,0.98) ${e - 48}px, rgba(15,17,21,0.6) ${e}px, rgba(15,17,21,0.15) ${e + 40}px, rgba(15,17,21,0) ${e + 75}px), ` +
    "linear-gradient(180deg, rgba(15,17,21,0) 40%, rgba(15,17,21,0.5) 70%, rgba(15,17,21,0.3) 84%)"
  );
}

/** Where the hero's first row sits: just under the status bar. */
export function heroTop(insetTop: number) {
  return Math.max(insetTop + 4, 20);
}

export function heroHeight(top: number, body: number) {
  return top + AVATAR + 10 + Math.max(BODY_MIN, body) + 14 + ACTIONS + ACTIONS_BOTTOM;
}

// The text arrives once per launch, after the artwork has faded in.
let introPlayed = false;

type HeroProps = {
  /** Newest first; up to four. Empty while the catalogue loads. */
  sermons: readonly Sermon[];
  /** The viewer's name for the greeting (members only). */
  name: string | null;
  member: boolean;
  isSaved: (id: string) => boolean;
  /** Where Watch would pick up (0: the beginning). */
  resumeAt: (id: string) => number;
  onAccount: () => void;
  onSignIn: () => void;
  onOpen: (id: string) => void;
  onWatch: (id: string) => void;
  onToggleSave: (id: string) => void;
  /** Reports the hero's height (for the status bar's switch to dark text). */
  onHeight?: (height: number) => void;
};

export const HomeHero = memo(function HomeHero({
  sermons,
  name,
  member,
  isSaved,
  resumeAt,
  onAccount,
  onSignIn,
  onOpen,
  onWatch,
  onToggleSave,
  onHeight,
}: HeroProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [intro] = useState(() => !introPlayed);
  useEffect(() => {
    introPlayed = true;
  }, []);

  const top = heroTop(insets.top);
  // Text lines up with the page column (760 wide at most), 24 in.
  const inset = Math.max(0, (width - 760) / 2) + 24;
  const count = sermons.length;

  // Each page's kicker and title, measured; the tallest sets the height.
  const [bodies, setBodies] = useState<Record<string, number>>({});
  const measure = useCallback((id: string, h: number) => {
    setBodies((was) => (Math.abs((was[id] ?? 0) - h) < 1 ? was : { ...was, [id]: h }));
  }, []);
  const tallest = sermons.reduce((m, s) => Math.max(m, bodies[s.id] ?? 0), 0);
  const height = heroHeight(top, tallest);
  useEffect(() => {
    onHeight?.(height);
  }, [height, onHeight]);

  // ---- Arrival: the words rise once the first artwork is in (or soon after) ------
  const [artReady, setArtReady] = useState(!intro);
  const firstArt = useCallback(() => setArtReady(true), []);
  useEffect(() => {
    if (artReady) return;
    const timer = setTimeout(() => setArtReady(true), ART_WAIT_MS);
    return () => clearTimeout(timer);
  }, [artReady]);
  const rising = intro && artReady;
  const waiting = intro && !artReady;

  // ---- Later pages' artwork waits until the viewer moves, or a moment passes -----
  const [rest, setRest] = useState(false);
  useEffect(() => {
    if (rest) return;
    const timer = setTimeout(() => setRest(true), REST_MS);
    return () => clearTimeout(timer);
  }, [rest]);

  // ---- "Loading the latest sermons", only if it takes a while ---------------------
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (count) return;
    const timer = setTimeout(() => setSlow(true), LOADING_AFTER_MS);
    return () => clearTimeout(timer);
  }, [count]);

  // ---- The pager ----------------------------------------------------------------
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  // While a slide asked for by the dots is moving, the scroll position says
  // nothing about which page is chosen; the dots and Watch keep the target.
  const target = useRef<number | null>(null);
  const current = sermons[Math.min(index, Math.max(0, count - 1))];

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      if (target.current != null) {
        if (Math.abs(x - target.current * width) > 2) return;
        target.current = null;
      }
      const i = Math.max(0, Math.min(count - 1, Math.round(x / width)));
      if (i !== indexRef.current) {
        indexRef.current = i;
        setIndex(i);
      }
    },
    [count, width],
  );
  const onDrag = useCallback(() => {
    target.current = null;
    setRest(true);
  }, []);
  const select = useCallback(
    (i: number) => {
      indexRef.current = i;
      target.current = reduced ? null : i;
      setIndex(i);
      setRest(true);
      scroller.current?.scrollTo({ x: i * width, animated: !reduced });
    },
    [width, reduced],
  );
  // A new width (rotation, a resized browser) keeps the same page showing.
  useEffect(() => {
    target.current = null;
    scroller.current?.scrollTo({ x: indexRef.current * width, animated: false });
  }, [width]);
  // The list changed under the pager (the library arrived): back to the newest.
  const firstId = sermons[0]?.id;
  useEffect(() => {
    if (indexRef.current === 0) return;
    indexRef.current = 0;
    target.current = null;
    setIndex(0);
    scroller.current?.scrollTo({ x: 0, animated: false });
  }, [firstId]);

  const saved = current ? isSaved(current.id) : false;
  const resume = current ? resumeAt(current.id) : 0;
  const title = current ? headline(current) : "";

  return (
    <View style={[styles.hero, { height }]} {...web({ dataSet: { dark: "true" } })}>
      {/* Greeting and the avatar (or Sign in), fixed over the pages. First, so
          screen readers and the keyboard meet the page's heading first. */}
      <Rise
        intro={intro}
        rising={rising}
        waiting={waiting}
        reduced={reduced}
        delay={120}
        style={[styles.top, { top, left: inset, right: inset }]}
      >
        <ItalicTitle
          text={greeting(name)}
          italicLast={!!name}
          accessibilityRole="header"
          {...web({ "aria-level": 1 })}
          numberOfLines={1}
          style={[type.greeting, styles.greeting]}
          maxFontSizeMultiplier={textCap.display}
        />
        {member ? (
          <Avatar name={name} onPress={onAccount} testID="home-avatar" />
        ) : (
          <Tap
            testID="home-sign-in"
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            onPress={onSignIn}
            hitSlop={{ top: 4, bottom: 4 }}
            style={styles.signIn}
          >
            <T style={styles.signInText} maxFontSizeMultiplier={textCap.chip}>
              Sign in
            </T>
          </Tap>
        )}
      </Rise>

      {count ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          onScrollBeginDrag={onDrag}
          scrollEventThrottle={16}
          // The dots and Watch are the way through for assistive tech.
          accessible={false}
          style={StyleSheet.absoluteFill}
          testID="hero-pager"
        >
          {sermons.map((sermon, i) => (
            <HeroPage
              key={sermon.id}
              sermon={sermon}
              width={width}
              height={height}
              inset={inset}
              current={i === index}
              first={i === 0}
              load={i === 0 || rest || i === index}
              intro={intro && i === 0}
              rising={rising && i === 0}
              waiting={waiting && i === 0}
              reduced={reduced}
              onOpen={onOpen}
              onMeasure={measure}
              onArt={i === 0 ? firstArt : undefined}
            />
          ))}
        </ScrollView>
      ) : (
        <>
          <Wash kind="heroScrim" />
          {slow ? (
            <View style={[styles.body, { left: inset, right: inset, bottom: BODY_BOTTOM }]}>
              <Kicker tone="onMedia">Loading the latest sermons</Kicker>
              <ActivityIndicator color={c.white} style={styles.spinner} />
            </View>
          ) : null}
        </>
      )}

      <Wash kind="heroFade" band="bottom" height={68} />

      {current ? (
        <Rise
          intro={intro}
          rising={rising}
          waiting={waiting}
          reduced={reduced}
          delay={300}
          style={[styles.actions, { left: inset, right: inset, bottom: ACTIONS_BOTTOM }]}
        >
          <PlayPill
            testID="hero-watch"
            size="md"
            tone="white"
            label={resume ? "Resume" : "Watch"}
            accessibilityLabel={
              resume ? `Resume sermon: ${title}, from ${spokenTime(resume)}` : `Watch sermon: ${title}`
            }
            onPress={() => onWatch(current.id)}
          />
          <RoundButton
            testID="hero-save"
            tone="glass"
            size={48}
            iconSize={20}
            icon={saved ? "bookmark" : "bookmark-outline"}
            label={saved ? `Remove ${title} from saved` : `Save ${title}`}
            selected={saved}
            onPress={() => onToggleSave(current.id)}
          />
          {count > 1 ? (
            <View style={styles.dotsWrap}>
              <HeroDots count={count} index={index} onSelect={select} reduced={reduced} />
            </View>
          ) : null}
        </Rise>
      ) : null}
    </View>
  );
});

// ---- One page -------------------------------------------------------------------------

/** How many lines a measured title takes at a step (Dynamic Type included). */
function linesOf(height: number, step: number, fontScale: number) {
  const lh = TITLE_STEPS[step].lineHeight * Math.min(Math.max(1, fontScale), textCap.display);
  return Math.round(height / lh);
}

const HeroPage = memo(function HeroPage({
  sermon,
  width,
  height,
  inset,
  current,
  first,
  load,
  intro,
  rising,
  waiting,
  reduced,
  onOpen,
  onMeasure,
  onArt,
}: {
  sermon: Sermon;
  width: number;
  height: number;
  inset: number;
  current: boolean;
  first: boolean;
  /** false: the tint only until the viewer moves the pager. */
  load: boolean;
  intro: boolean;
  rising: boolean;
  waiting: boolean;
  reduced: boolean;
  onOpen: (id: string) => void;
  onMeasure: (id: string, height: number) => void;
  onArt?: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const kicker = useMemo(() => heroKicker(sermon), [sermon]);
  const title = headline(sermon);
  const column = Math.min(width - 2 * inset, TITLE_MAX);

  // The title's size: the largest step that fits (see TITLE_STEPS), found by
  // measuring; it starts again when the title, the column or the text size
  // changes.
  const fitKey = `${title}|${column}|${fontScale}`;
  const [fit, setFit] = useState({ key: fitKey, step: 0, edge: null as number | null });
  const step = fit.key === fitKey ? fit.step : 0;
  const edge = fit.key === fitKey ? fit.edge : null;
  const titleRef = useRef<Text>(null);

  const onTitleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const lines = linesOf(e.nativeEvent.layout.height, step, fontScale);
      const fits = step === 0 ? lines <= 2 : step === 1 ? lines <= 2 : true;
      if (!fits) {
        setFit({ key: fitKey, step: step + 1, edge: null });
        return;
      }
      // Web: the longest line, read from the text itself (no onTextLayout there).
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const node = titleRef.current as unknown as HTMLElement | null;
        if (node) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const box = node.getBoundingClientRect();
          let right = 0;
          for (const r of Array.from(range.getClientRects())) right = Math.max(right, r.right - box.left);
          if (right > 0)
            setFit((was) =>
              was.key === fitKey && was.step === step && was.edge === inset + right
                ? was
                : { key: fitKey, step, edge: inset + right },
            );
        }
      }
    },
    [step, fontScale, fitKey, inset],
  );
  const onTextLayout = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      const longest = e.nativeEvent.lines.reduce((m, l) => Math.max(m, l.width), 0);
      if (longest > 0)
        setFit((was) =>
          was.key === fitKey && was.step === step && was.edge === inset + longest
            ? was
            : { key: fitKey, step, edge: inset + longest },
        );
    },
    [fitKey, step, inset],
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => onMeasure(sermon.id, e.nativeEvent.layout.height),
    [onMeasure, sermon.id],
  );
  const scrim = useMemo(() => gradient(heroScrim(edge)), [edge]);

  // The concept's crop, grown to cover a taller band (a three-line title), so
  // the artwork's top edge never shows under the status bar.
  const artH = Math.max(ART_H, height + ART_BOTTOM_BLEED + 12);
  const artW = Math.round((artH * 16) / 9);
  const bleed = Math.round((ART_RIGHT_BLEED * artW) / ART_W);

  const words = (
    <>
      <Kicker tone="onMedia">{kicker}</Kicker>
      <ItalicTitle
        ref={titleRef}
        text={title}
        italicLast
        onLayout={onTitleLayout}
        onTextLayout={Platform.OS === "web" ? undefined : onTextLayout}
        style={[type.masthead, TITLE_STEPS[step], styles.title, { maxWidth: column }]}
        maxFontSizeMultiplier={textCap.display}
      />
    </>
  );
  const bodyBox = [styles.body, { left: inset, right: inset, bottom: BODY_BOTTOM }];
  return (
    <View
      style={[styles.page, { width, height }]}
      // Only the page showing is read; the others are a swipe (or the dots) away.
      accessibilityElementsHidden={!current}
      importantForAccessibility={current ? "auto" : "no-hide-descendants"}
      {...(current ? null : web({ "aria-hidden": true }))}
    >
      <Artwork
        art={sermon}
        width={artW}
        radius={0}
        lift="none"
        load={load}
        onSettled={onArt}
        priority={first ? "high" : "low"}
        style={[styles.art, { left: width + bleed - artW, top: height + ART_BOTTOM_BLEED - artH }]}
      />
      <View style={[StyleSheet.absoluteFill, styles.noTouch, scrim]} aria-hidden />
      <Rise
        intro={intro}
        rising={rising}
        waiting={waiting}
        reduced={reduced}
        delay={200}
        style={bodyBox}
        onLayout={onLayout}
      >
        {current ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={`${spokenText(spokenKicker(kicker))}. ${title}`}
            accessibilityHint="Opens the sermon"
            onPress={() => onOpen(sermon.id)}
            feedback="dim"
            unstable_pressDelay={60}
          >
            {words}
          </Tap>
        ) : (
          <View>{words}</View>
        )}
      </Rise>
    </View>
  );
});

// ---- Dots ------------------------------------------------------------------------------

/**
 * Which of the newest sermons is showing. One control: a tap (or a click)
 * shows the next, arrow keys and the screen reader's adjust gestures move
 * either way. Never advances on its own.
 */
const HeroDots = memo(function HeroDots({
  count,
  index,
  onSelect,
  reduced,
}: {
  count: number;
  index: number;
  onSelect: (index: number) => void;
  reduced: boolean;
}) {
  const step = (by: number) => onSelect((index + by + count) % count);
  return (
    <Tap
      testID="hero-dots"
      accessibilityRole="adjustable"
      accessibilityLabel="Newest sermons"
      accessibilityHint="Shows the next one"
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={index + 1}
      aria-valuetext={`${index + 1} of ${count}`}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "increment") step(1);
        if (e.nativeEvent.actionName === "decrement") step(-1);
      }}
      onWebKey={(e: WebKey) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          step(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          step(-1);
        }
      }}
      onPress={() => step(1)}
      feedback="dim"
      style={styles.dots}
    >
      {Array.from({ length: count }, (_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            i === index && styles.dotOn,
            {
              transitionProperty: ["width", "backgroundColor"],
              transitionDuration: reduced ? 0 : 220,
              transitionTimingFunction: easeOut,
            },
          ]}
        />
      ))}
    </Tap>
  );
});

// ---- Arrival -----------------------------------------------------------------------

/**
 * On the first Home of a launch: up 8pt as it fades in (a fade alone under
 * Reduce Motion), once the first artwork is in. Until then (`waiting`) the
 * words hold back, so they never rise over an empty band.
 */
function Rise({
  intro,
  rising,
  waiting,
  reduced,
  delay,
  style,
  onLayout,
  children,
}: {
  intro: boolean;
  rising: boolean;
  waiting: boolean;
  reduced: boolean;
  delay: number;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        style,
        { pointerEvents: "box-none" },
        waiting && { opacity: 0 },
        intro &&
          rising && {
            animationName: reduced ? motion.fade : motion.rise,
            animationDuration: reduced ? 200 : 360,
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

const styles = StyleSheet.create({
  hero: { backgroundColor: c.media, overflow: "hidden" },
  // Each page crops its own artwork, so a neighbour's never shows through.
  page: { overflow: "hidden" },
  art: { position: "absolute" },
  top: {
    position: "absolute",
    zIndex: 2,
    minHeight: AVATAR,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  greeting: { color: c.white, flexShrink: 1 },
  // Navy with the avatar's white ring, so it holds on bright artwork too.
  signIn: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: c.accent,
    boxShadow: shadows.avatarRing,
    alignItems: "center",
    justifyContent: "center",
  },
  signInText: { fontFamily: font.bold, fontSize: 14, lineHeight: 18, color: c.white },
  body: { position: "absolute" },
  // The concept keeps the title off the preacher's face (TITLE_MAX).
  title: { color: c.white, marginTop: 6, alignSelf: "flex-start" },
  noTouch: { pointerEvents: "none" },
  spinner: { alignSelf: "flex-start", marginTop: 14 },
  actions: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dotsWrap: { marginLeft: "auto" },
  // Drawn small, touched at 44pt.
  dots: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 8,
    marginRight: -8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.45)" },
  dotOn: { width: 18, backgroundColor: c.white },
});
