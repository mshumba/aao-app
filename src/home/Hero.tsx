import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  PixelRatio,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { headline } from "../data/display";
import type { Sermon } from "../data/sermons";
import { Artwork, Avatar, ItalicTitle, Kicker, PlayPill, RoundButton, Wash, artCandidates, artUri, sizedArt, spokenKicker, spokenText, spokenTime } from "../kit";
import { useArtOnDevice } from "../kit/Artwork";
import { useReducedMotion } from "../motion";
import { artFade, c, fontSize, radius, shadows, textCap, type } from "../theme";
import { T, Tap, gradient, web, type WebKey } from "../ui";
import { greeting, heroKicker } from "./copy";

/**
 * Home's dark hero (the approved concept's screen 01): the newest sermons
 * as a pager the viewer moves (never on its own), each one's artwork
 * cropped to the preacher on the right and washed into the dark on the
 * left, where the greeting, the kicker and the title sit. Watch and Save act
 * on the sermon showing; the dots say which one it is. (The blessing has
 * its own screen: src/blessing.)
 *
 * The band runs under the status bar. Its height is the concept's 340pt on
 * a phone with a 54pt status bar, and grows only if a title needs a third
 * line, measured once for all four pages so swiping never changes it.
 *
 * On a wide window the dark band still runs edge to edge, but the artwork,
 * like the words, keeps to Home's centred column (COLUMN): its right edge
 * at the column's, fading into the dark beyond it.
 */

/** The question field overlaps the hero's bottom edge by this much. */
export const HERO_OVERLAP = 56;
/** Home's page column, which the hero's words and artwork keep to. */
export const COLUMN = 760;

const AVATAR = 38;
/** Kicker 16 + 6 + two lines of the masthead (41 each). */
const BODY_MIN = 104;
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
 * A wide window: the artwork fades into the dark band over this much either
 * side of the column's right edge, once the band beyond is at least
 * SIDE_MIN wide (narrower, it runs to the window's edge, as on a phone).
 */
const EDGE_FADE_IN = 40;
const EDGE_FADE_OUT = 48;
const SIDE_MIN = 48;
/**
 * The masthead steps down for a long title: 38/41 when it fits on two
 * lines, else 34/37 on two, else 30/34 on up to three. The words never
 * change and are never cut off.
 */
const TITLE_STEPS = [
  { fontSize: fontSize.hero, lineHeight: 41, letterSpacing: -0.8 },
  { fontSize: fontSize.title, lineHeight: 37, letterSpacing: -0.6 },
  { fontSize: fontSize.question, lineHeight: 34, letterSpacing: -0.5 },
] as const;
/**
 * Later pages fetch their artwork once the first page's is in (at once from
 * the device's cache), the viewer moves the pager, or after this.
 */
const REST_MS = 2500;
/**
 * The first page's artwork, when it isn't on the device yet, comes in two
 * steps: YouTube's 320×180 copy (about 12 KB) first, drawn at full size,
 * then the sharp one (the 1280×720 WebP, about 100 KB) fading in over it.
 * Already on the device, the sharp one is simply there. The words never
 * wait for either.
 */
const PREVIEW_PX = 320;
/** "Loading the latest sermons" only if the library takes longer than this. */
const LOADING_AFTER_MS = 400;
/** The dots: 6pt, and 18pt long in white for the page showing. */
const DOT = 6;
const DOT_ON = 18;
const DOT_COLOR = "rgba(255,255,255,0.45)";

/** Where Home's column sits in a window `width` wide: its left edge and width. */
export function heroColumn(width: number) {
  const w = Math.min(width, COLUMN);
  return { left: Math.max(0, (width - COLUMN) / 2), width: w };
}

/**
 * The scrim across a page, as the concept draws it: dark to 51% of the
 * column (further when the title's longest line runs past that, `edge` in
 * points from the window's left), then fading out by 80%, so busy flyer
 * lettering never shows through the words and the face stays bright. On a
 * wide window the artwork then fades into the dark past the column's right
 * edge, so it never ends in a hard line.
 */
function heroScrim(edge: number | null, width: number) {
  const col = heroColumn(width);
  const w = col.width;
  const d = Math.round(col.left + Math.max(w * 0.51, edge != null ? edge - col.left - 32 : 0));
  const right = col.left + w;
  const side =
    width - right >= SIDE_MIN
      ? `linear-gradient(90deg, rgba(15,17,21,0) ${Math.round(right - EDGE_FADE_IN)}px, rgba(15,17,21,1) ${Math.round(right + EDGE_FADE_OUT)}px), `
      : "";
  return (
    "linear-gradient(180deg, rgba(15,17,21,0.62) 0px, rgba(15,17,21,0) 130px), " +
    side +
    `linear-gradient(90deg, rgba(15,17,21,0.99) 0px, rgba(15,17,21,0.98) ${d}px, rgba(15,17,21,0.6) ${Math.round(d + w * 0.1)}px, rgba(15,17,21,0.15) ${Math.round(d + w * 0.2)}px, rgba(15,17,21,0) ${Math.round(d + w * 0.29)}px), ` +
    "linear-gradient(180deg, rgba(15,17,21,0) 40%, rgba(15,17,21,0.5) 70%, rgba(15,17,21,0.3) 84%)"
  );
}

/** Where the hero's first row sits: just under the status bar. */
export function heroTop(insetTop: number) {
  return Math.max(insetTop + 4, 20);
}

/** `row`: the greeting's row, taller than the avatar when the greeting wraps (large text). */
export function heroHeight(top: number, body: number, row = AVATAR) {
  return top + Math.max(AVATAR, row) + 10 + Math.max(BODY_MIN, body) + 14 + ACTIONS + ACTIONS_BOTTOM;
}

// ---- Drawn in full, for the launch ------------------------------------------------

/**
 * Whether the hero has drawn itself in full once: every page's title at its
 * final size (so the band's height won't change again) and, on iOS and
 * Android, the first page's artwork. When the app opens onto Home, the
 * splash waits for this (src/app/_layout.tsx), so it lifts onto a finished
 * hero rather than one still settling.
 */
let drawn = false;
const drawnListeners = new Set<() => void>();

export function heroDrawn() {
  return drawn;
}

export function onHeroDrawn(listener: () => void) {
  drawnListeners.add(listener);
  return () => {
    drawnListeners.delete(listener);
  };
}

function markDrawn() {
  if (drawn) return;
  drawn = true;
  for (const listener of Array.from(drawnListeners)) listener();
}

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

  const top = heroTop(insets.top);
  // Text lines up with the page column (760 wide at most), 24 in.
  const inset = heroColumn(width).left + 24;
  const count = sermons.length;

  // Each page's kicker and title, measured; the tallest sets the height.
  const [bodies, setBodies] = useState<Record<string, number>>({});
  const measure = useCallback((id: string, h: number) => {
    setBodies((was) => (Math.abs((was[id] ?? 0) - h) < 1 ? was : { ...was, [id]: h }));
  }, []);
  const tallest = sermons.reduce((m, s) => Math.max(m, bodies[s.id] ?? 0), 0);
  // The greeting never loses the name: a step smaller on a narrow phone, and
  // a second line at large text, which the band grows to hold.
  const [row, setRow] = useState(AVATAR);
  const onRow = useCallback((e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    setRow((was) => (Math.abs(was - h) < 1 ? was : h));
  }, []);
  const height = heroHeight(top, tallest, row);
  useEffect(() => {
    onHeight?.(height);
  }, [height, onHeight]);

  // ---- Later pages' artwork waits for the first's, the viewer, or a moment --------
  const [rest, setRest] = useState(false);
  useEffect(() => {
    if (rest) return;
    const timer = setTimeout(() => setRest(true), REST_MS);
    return () => clearTimeout(timer);
  }, [rest]);
  // The first page's artwork drawn (either copy), and its sharp copy settled.
  const [firstArt, setFirstArt] = useState(Platform.OS === "web");
  const onFirstArt = useCallback(() => setFirstArt(true), []);
  const onFirstSharp = useCallback(() => {
    setFirstArt(true);
    setRest(true);
  }, []);

  // ---- Drawn in full (see heroDrawn) ------------------------------------------------
  const [fitted, setFitted] = useState<Record<string, true>>({});
  const onFitted = useCallback((id: string) => {
    setFitted((was) => (was[id] ? was : { ...was, [id]: true }));
  }, []);
  const settled = count > 0 && sermons.every((s) => fitted[s.id] && bodies[s.id] != null);
  useEffect(() => {
    if (settled && firstArt) markDrawn();
  }, [settled, firstArt]);

  // ---- "Loading the latest sermons", only if it takes a while ---------------------
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (count) return;
    const timer = setTimeout(() => setSlow(true), LOADING_AFTER_MS);
    return () => clearTimeout(timer);
  }, [count]);

  // ---- The pager ----------------------------------------------------------------
  // A swipe renders nothing until it ends: the dots follow the pager's
  // offset on the UI thread, and the page showing (`index`, which Watch,
  // Save and screen readers follow) is chosen once the pager rests on it.
  const scroller = useAnimatedRef<Animated.ScrollView>();
  const offset = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const chosen = useSharedValue(0);
  // While a slide asked for by the dots is moving, the pages it passes
  // aren't chosen; the dots and Watch keep the target (-1: none).
  const target = useSharedValue(-1);
  const current = sermons[Math.min(index, Math.max(0, count - 1))];

  const onDrag = useCallback(() => setRest(true), []);
  // Native says when a swipe has ended; the web only stops scrolling, so
  // resting on a page (to the point) is the sign on both.
  const settle = (x: number) => {
    "worklet";
    const i = Math.max(0, Math.min(count - 1, Math.round(x / width)));
    if (Math.abs(x - i * width) > 1) return;
    if (target.get() >= 0) {
      if (i !== target.get()) return;
      target.set(-1);
    }
    if (i === chosen.get()) return;
    chosen.set(i);
    scheduleOnRN(setIndex, i);
  };
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      offset.set(e.contentOffset.x);
      settle(e.contentOffset.x);
    },
    onBeginDrag: () => {
      target.set(-1);
      scheduleOnRN(onDrag);
    },
    onEndDrag: (e) => settle(e.contentOffset.x),
    onMomentumEnd: (e) => settle(e.contentOffset.x),
  });
  const select = useCallback(
    (i: number) => {
      chosen.set(i);
      target.set(reduced ? -1 : i);
      setIndex(i);
      setRest(true);
      scroller.current?.scrollTo({ x: i * width, animated: !reduced });
    },
    [chosen, target, scroller, width, reduced],
  );
  // A new width (rotation, a resized browser) keeps the same page showing.
  useEffect(() => {
    target.set(-1);
    scroller.current?.scrollTo({ x: chosen.get() * width, animated: false });
  }, [chosen, target, scroller, width]);
  // The list changed under the pager (the library arrived): back to the
  // newest, which is then chosen as any page the pager rests on.
  const firstId = sermons[0]?.id;
  useEffect(() => {
    if (chosen.get() === 0) return;
    target.set(-1);
    scroller.current?.scrollTo({ x: 0, animated: false });
  }, [chosen, target, scroller, firstId]);

  const saved = current ? isSaved(current.id) : false;
  const resume = current ? resumeAt(current.id) : 0;
  const title = current ? headline(current) : "";

  return (
    <View style={[styles.hero, { height }]} {...web({ dataSet: { dark: "true" } })}>
      {/* Greeting and the avatar (or Sign in), fixed over the pages. First, so
          screen readers and the keyboard meet the page's heading first. */}
      <View style={[styles.top, { top, left: inset, right: inset }]} onLayout={onRow}>
        <View style={styles.greetingRow}>
          <ItalicTitle
            text={greeting(name)}
            italicLast={!!name}
            accessibilityRole="header"
            {...web({ "aria-level": 1 })}
            style={[type.greeting, styles.greeting, width < 360 && styles.greetingNarrow]}
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
        </View>
      </View>

      {count ? (
        <Animated.ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
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
              reduced={reduced}
              onOpen={onOpen}
              onMeasure={measure}
              onFitted={onFitted}
              onArt={i === 0 ? onFirstArt : undefined}
              onSharp={i === 0 ? onFirstSharp : undefined}
            />
          ))}
        </Animated.ScrollView>
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
        <View style={[styles.actions, { left: inset, right: inset, bottom: ACTIONS_BOTTOM }]}>
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
              <HeroDots count={count} index={index} offset={offset} width={width} onSelect={select} />
            </View>
          ) : null}
        </View>
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
  reduced,
  onOpen,
  onMeasure,
  onFitted,
  onArt,
  onSharp,
}: {
  sermon: Sermon;
  width: number;
  height: number;
  inset: number;
  current: boolean;
  first: boolean;
  /** false: the tint only, until the first page's art is in or the viewer moves the pager. */
  load: boolean;
  reduced: boolean;
  onOpen: (id: string) => void;
  onMeasure: (id: string, height: number) => void;
  /** The title has found its size (see TITLE_STEPS). */
  onFitted: (id: string) => void;
  /** Some artwork is drawn (the small copy or the sharp one). */
  onArt?: () => void;
  /** The sharp copy has loaded (or can't). */
  onSharp?: () => void;
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
      onFitted(sermon.id);
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
    [step, fontScale, fitKey, inset, onFitted, sermon.id],
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
  const scrim = useMemo(() => gradient(heroScrim(edge, width)), [edge, width]);

  // The concept's crop, grown to cover a taller band (a three-line title), so
  // the artwork's top edge never shows under the status bar. Its right edge
  // is the column's (the window's on a phone), plus the concept's bleed.
  const artH = Math.max(ART_H, height + ART_BOTTOM_BLEED + 12);
  const artW = Math.round((artH * 16) / 9);
  const bleed = Math.round((ART_RIGHT_BLEED * artW) / ART_W);
  const col = heroColumn(width);
  const artRight = col.left + col.width + bleed;
  const artBox = { left: artRight - artW, top: height + ART_BOTTOM_BLEED - artH };

  // The first page: the small copy first, until the sharp one is in. Only
  // when there is a smaller copy (YouTube's sd or maxres for the sharp one),
  // and only when the sharp one isn't on the device already (then it's
  // simply there; null while that's being checked, a frame or so).
  const previewW = Math.floor(PREVIEW_PX / PixelRatio.get());
  const uri = artUri(sermon);
  const sharpUri = sizedArt(uri, artW);
  const sharpOnDevice = useArtOnDevice(first && load ? artCandidates(sermon, artW)[0] : null);
  const preview =
    first &&
    load &&
    sharpOnDevice === false &&
    /(sd|maxres)default/.test(sharpUri) &&
    sizedArt(uri, previewW) !== sharpUri;
  const [sharp, setSharp] = useState(false);
  const onSharpIn = useCallback(() => {
    setSharp(true);
    onSharp?.();
  }, [onSharp]);

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
        onSettled={first ? onSharpIn : undefined}
        priority={first ? "high" : "low"}
        testID={first ? "hero-art" : undefined}
        style={[styles.art, artBox]}
      />
      {preview ? (
        <Animated.View
          testID="hero-art-preview"
          style={[
            styles.art,
            styles.noTouch,
            artBox,
            { width: artW, height: artH, opacity: sharp ? 0 : 1 },
            // The sharp copy fades in under it first, so the art never dims
            // to the navy behind both halfway through.
            {
              transitionProperty: "opacity",
              transitionDuration: reduced ? 0 : artFade,
              transitionDelay: reduced ? 0 : artFade,
            },
          ]}
        >
          <Artwork
            art={sermon}
            width={previewW}
            radius={0}
            lift="none"
            priority="high"
            onSettled={onArt}
            style={{
              position: "absolute",
              left: (artW - previewW) / 2,
              top: (artH - (previewW * 9) / 16) / 2,
              transform: [{ scale: artW / previewW }],
            }}
          />
        </Animated.View>
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.noTouch, scrim]} aria-hidden />
      <View style={bodyBox} onLayout={onLayout}>
        {/* A Tap on every page, the one showing reachable by the keyboard:
            the words never remount as the pager settles. */}
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`${spokenText(spokenKicker(kicker))}. ${title}`}
          accessibilityHint="Opens the sermon"
          tabIndex={current ? 0 : -1}
          onPress={() => onOpen(sermon.id)}
          feedback="dim"
          unstable_pressDelay={60}
        >
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
        </Tap>
      </View>
    </View>
  );
});

// ---- Dots ------------------------------------------------------------------------------

/**
 * Which of the newest sermons is showing. One control: a tap (or a click)
 * shows the next, arrow keys and the screen reader's adjust gestures move
 * either way. Never advances on its own. The dots follow the pager as it
 * moves (`offset`); what they announce is the page chosen (`index`).
 */
const HeroDots = memo(function HeroDots({
  count,
  index,
  offset,
  width,
  onSelect,
}: {
  count: number;
  index: number;
  offset: SharedValue<number>;
  /** One page's width: the pager's offset per dot. */
  width: number;
  onSelect: (index: number) => void;
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
        <HeroDot key={i} page={i} offset={offset} width={width} />
      ))}
    </Tap>
  );
});

/** One dot: long and white for its page, as much so as the page is in view. */
function HeroDot({ page, offset, width }: { page: number; offset: SharedValue<number>; width: number }) {
  const look = useAnimatedStyle(() => {
    const on = interpolate(Math.abs(offset.get() - page * width), [0, width], [1, 0], Extrapolation.CLAMP);
    return {
      width: DOT + (DOT_ON - DOT) * on,
      backgroundColor: interpolateColor(on, [0, 1], [DOT_COLOR, c.white]),
    };
  });
  return <Animated.View style={[styles.dot, look]} />;
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
    pointerEvents: "box-none",
  },
  greetingRow: {
    minHeight: AVATAR,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  greeting: { color: c.white, flexShrink: 1 },
  greetingNarrow: { fontSize: fontSize.heading, lineHeight: 26 },
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
  signInText: { ...type.button, color: c.white },
  body: { position: "absolute", pointerEvents: "box-none" },
  // The concept keeps the title off the preacher's face (TITLE_MAX).
  title: { color: c.white, marginTop: 6, alignSelf: "flex-start" },
  noTouch: { pointerEvents: "none" },
  spinner: { alignSelf: "flex-start", marginTop: 14 },
  actions: {
    position: "absolute",
    pointerEvents: "box-none",
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
  dot: { height: DOT, borderRadius: DOT / 2 },
});
