import { memo, useState, useSyncExternalStore, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { useGo, usePageTitle } from "../navigation";
import { useDockInset } from "../player/useDockInset";
import { c, fontSize, radius, space, textCap, type } from "../theme";
import { dockScrollPadding } from "../ui";
import type { ArtSource } from "./Artwork";
import { T, web } from "./base";
import { RoundButton, useStickyCTASpace } from "./buttons";
import { CardFan } from "./CardFan";
import { useStatusBar } from "./statusBar";
import { keepLastWord } from "./paths";
import { ItalicTitle, Kicker } from "./text";
import { Wash } from "./Wash";

/** How far the ivory panel rides up over the cover's bottom edge. */
const OVERLAP = 20;
const MAX_WIDTH = 760;
/** The pinned header under the status bar: the 40pt buttons and a little air. */
export const BAND = 52;
/** Where the floating buttons end under the status bar (2pt down, 40pt tall). */
export const BUTTONS_END = 42;
/** A longer title steps down a size, so it doesn't run to three lines. */
const LONG_TITLE = 32;
/** How far past `under` the pinned header's fade ends (see CoverBand). */
const BAND_WHOLE = 8;

// ---- The pinned header ----------------------------------------------------------------

/** Where a cover's words are, from the page's top: they start at `top`, the title ends at `bottom`. */
export type CoverWords = { top: number; bottom: number };

type CoverMeasures = {
  view: number;
  content: number;
  wordsTop: number;
  wordsHeight: number;
  /** Where the title ends in the words, when more follows it. */
  titleEnd: number | null;
};

/**
 * A cover page's measurements: its scroll view's height, its content's, and
 * where the cover's words are. Taken at layout only, never while scrolling,
 * and kept out of the page's state: a measurement redraws only what reads
 * it (the pinned header and the buttons, and the room at the page's foot),
 * never the page and the lists it holds.
 *
 * `onLayout` goes on the scroll view and `onContentLayout` on a view
 * holding the rest of its content; `onWordsLayout` on the cover's words
 * (the kicker and title) and, when more follows the title in them,
 * `onTitleLayout` on the title. Until they're laid out, `estimate` stands in.
 */
export class CoverLayout {
  private measured: CoverMeasures;
  private readonly listeners = new Set<() => void>();

  constructor(estimate: CoverWords) {
    this.measured = {
      view: 0,
      content: 0,
      wordsTop: estimate.top,
      wordsHeight: estimate.bottom - estimate.top,
      titleEnd: null,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(next: Partial<CoverMeasures>) {
    const was = this.measured;
    this.measured = { ...was, ...next };
    if ((Object.keys(next) as (keyof typeof next)[]).some((key) => was[key] !== this.measured[key]))
      this.listeners.forEach((listener) => listener());
  }

  onLayout = (e: LayoutChangeEvent) => this.set({ view: Math.round(e.nativeEvent.layout.height) });
  onContentLayout = (e: LayoutChangeEvent) => this.set({ content: Math.round(e.nativeEvent.layout.height) });
  onWordsLayout = (e: LayoutChangeEvent) =>
    this.set({ wordsTop: e.nativeEvent.layout.y, wordsHeight: e.nativeEvent.layout.height });
  onTitleLayout = (e: LayoutChangeEvent) =>
    this.set({ titleEnd: e.nativeEvent.layout.y + e.nativeEvent.layout.height });

  /** The scroll at which the cover's title has gone up under the buttons (`top`: the status bar's inset). */
  under(top: number) {
    const { wordsTop, wordsHeight, titleEnd } = this.measured;
    return wordsTop + (titleEnd ?? wordsHeight) - (top + BAND);
  }

  /**
   * The room a short page needs at its foot (see useCoverScroll), given
   * its content's bottom padding.
   */
  room(top: number, padding: number) {
    const { view, content, wordsTop } = this.measured;
    if (!view || !content) return 0;
    // Where the words reach the buttons' foot, and where the page's scroll ends.
    const from = wordsTop - (top + BUTTONS_END);
    const under = this.under(top);
    const end = content + padding - view;
    return end > from && end < under + BAND_WHOLE ? Math.ceil(under + BAND_WHOLE - end) : 0;
  }
}

/** One measurement from a cover's layout, read by the component that needs it alone. */
function useCoverMeasure(layout: CoverLayout, read: (layout: CoverLayout) => number) {
  return useSyncExternalStore(layout.subscribe, () => read(layout));
}

/**
 * The page's scroll, on the UI thread, for the pinned header, and the
 * page's measurements (CoverLayout), starting from where the cover's words
 * are thought to be (`estimate`, read once).
 *
 * The scroll counts only within the content's own range: iOS's bounce past
 * either end never does, so a flick at the foot of a page that stops short
 * of the title having gone can't flash the header in and out.
 *
 * A page that can scroll its cover's words up under the buttons, but not on
 * until the title has gone, would come to rest with Back over its title and
 * no header. It gets just enough room at its foot for the header to show
 * whole: CoverRoom, after the content the layout measures.
 */
export function useCoverScroll(estimate: () => CoverWords) {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const end =
        e.contentSize && e.layoutMeasurement
          ? Math.max(0, e.contentSize.height - e.layoutMeasurement.height)
          : Number.MAX_VALUE;
      scrollY.set(Math.min(Math.max(e.contentOffset.y, 0), end));
    },
  });
  const [layout] = useState(() => new CoverLayout(estimate()));
  return { scrollY, onScroll, layout };
}

/**
 * The room at a short page's foot (CoverLayout.room), under the content
 * the layout measures; nothing on a page that needs none. `padding` is the
 * content's bottom padding, which the room comes on top of.
 */
export const CoverRoom = memo(function CoverRoom({
  layout,
  top,
  padding,
}: {
  layout: CoverLayout;
  top: number;
  padding: number;
}) {
  const room = useCoverMeasure(layout, (l) => l.room(top, padding));
  return room ? <View style={{ height: room }} /> : null;
});

/**
 * Whether the pinned header shows: true once the page has scrolled `under`
 * (where the cover's title has gone under the buttons), at the middle of
 * the header's fade. Its own state, so only what reads it redraws.
 */
function useBandShown(scrollY: SharedValue<number>, under: number) {
  const [shown, setShown] = useState(false);
  useAnimatedReaction(
    () => scrollY.get() > under - 4,
    (now, was) => {
      if (now !== was) scheduleOnRN(setShown, now);
    },
    [under],
  );
  return shown;
}

/**
 * The light header pinned over a cover page (a path's, a series') once the
 * cover's title has scrolled up under the buttons (Castro's): ivory, a
 * hairline, the title centred, so the name never shows twice. Drawn only;
 * the page's own heading names it. `under` is the scroll at which the title
 * has gone; on a short page it never needs to.
 */
export const CoverBand = memo(function CoverBand({
  title,
  top,
  layout,
  scrollY,
}: {
  title: string;
  top: number;
  layout: CoverLayout;
  scrollY: SharedValue<number>;
}) {
  const under = useCoverMeasure(layout, (l) => l.under(top));
  const fade = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [under - 16, under + BAND_WHOLE], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View
      style={[styles.band, { height: top + BAND, paddingTop: top + 2 }, fade]}
      testID="cover-band"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.bandLine}>
        <T style={styles.bandTitle} numberOfLines={1} aria-hidden>
          {title}
        </T>
      </View>
    </Animated.View>
  );
});

/**
 * Back (and Share, given one) floating over a cover page, with its status
 * bar: glass and light over the dark cover, white and dark once the pinned
 * header shows. Place it after CoverBand, so it's drawn above it.
 */
export const CoverNav = memo(function CoverNav({
  top,
  layout,
  scrollY,
  onBack,
  backTestID,
  share,
}: {
  top: number;
  layout: CoverLayout;
  scrollY: SharedValue<number>;
  onBack: () => void;
  backTestID?: string;
  share?: { label: string; onPress: () => void; testID?: string };
}) {
  const banded = useBandShown(scrollY, useCoverMeasure(layout, (l) => l.under(top)));
  const tone = banded ? "surface" : "glass";
  useStatusBar(banded ? "dark" : "light");
  return (
    <>
      <View style={[styles.nav, { top: top + 2 }]} {...web({ dataSet: banded ? undefined : { dark: "true" } })}>
        <RoundButton icon="chevron-back" label="Back" onPress={onBack} tone={tone} iconSize={20} testID={backTestID} />
        {share ? (
          <RoundButton
            icon="share-outline"
            label={share.label}
            onPress={share.onPress}
            tone={tone}
            iconSize={18}
            testID={share.testID}
          />
        ) : null}
      </View>
    </>
  );
});

// ---- The page -------------------------------------------------------------------------

/**
 * A collection's page (a conference or teaching series, a topic), built as
 * a path's page is: a dark cover under the status bar with a fan of the
 * collection's own sermons, the gold-on-dark kicker ("Series · 5
 * messages"), the name in the serif, and a lead line; then an ivory panel
 * rising over it with the list. Back floats over the cover as a glass
 * button; once the title has scrolled away, a light header pins it with
 * the name, and the status bar turns dark. A `footer` (a StickyCTA) floats
 * over the page's end.
 */
export const CoverPage = memo(function CoverPage({
  title,
  italic,
  kicker,
  lead,
  fan,
  children,
  footer,
  testID,
}: {
  title: string;
  /** The phrase of the title in italics, only when an editor chose one. */
  italic?: string | null;
  kicker?: string;
  lead?: string | null;
  /** The collection's sermons for the fan, front first (one is enough). */
  fan: readonly ArtSource[];
  children: ReactNode;
  /** A sticky call to action over the end of the page. */
  footer?: ReactNode;
  testID?: string;
}) {
  usePageTitle(title);
  const go = useGo();
  const insets = useSafeAreaInsets();
  const dock = useDockInset();
  const ctaSpace = useStickyCTASpace();
  const { width } = useWindowDimensions();
  const scale = Math.min(0.9, (Math.min(width, MAX_WIDTH) - 40) / 340);
  const top = Math.max(insets.top, 12);

  // Where the title's last line ends on the page: the words' place on the
  // cover (about this, until they're laid out), then the title's in them.
  const { scrollY, onScroll, layout } = useCoverScroll(() => {
    const y = top + 60 + 124 * scale + 18;
    return { top: y, bottom: y + 60 };
  });
  const padding = (footer ? ctaSpace : 48 + insets.bottom) + dock;
  // Never one word alone on the title's last line.
  const shown = keepLastWord(title, italic);

  return (
    <View style={styles.screen} testID={testID}>
      {/* Drawn above the page, and first in order, so Back is read first. */}
      <CoverBand title={title} top={top} layout={layout} scrollY={scrollY} />
      <CoverNav top={top} layout={layout} scrollY={scrollY} onBack={go.back} />
      <Animated.ScrollView
        onScroll={onScroll}
        onLayout={layout.onLayout}
        scrollEventThrottle={16}
        style={dockScrollPadding(dock)}
        contentContainerStyle={{ paddingBottom: padding }}
      >
        <View onLayout={layout.onContentLayout}>
          <View style={[styles.cover, { paddingTop: top + 60 }]} {...web({ dataSet: { dark: "true" } })}>
            <Wash kind="pathCover" />
            {fan.length ? (
              <CardFan
                sermons={fan.slice(0, 3)}
                size="cover"
                scale={scale}
                style={styles.fan}
                priority="high"
                dimBack
              />
            ) : null}
            <View style={styles.words} onLayout={layout.onWordsLayout}>
              {kicker ? (
                <Kicker tone="onMedia" style={styles.center}>
                  {kicker}
                </Kicker>
              ) : null}
              <ItalicTitle
                text={shown.text}
                italic={shown.italic}
                accessibilityLabel={title}
                accessibilityRole="header"
                {...web({ "aria-level": 1 })}
                style={[type.coverTitle, styles.title, title.length > LONG_TITLE && styles.titleLong]}
                maxFontSizeMultiplier={textCap.display}
                onLayout={layout.onTitleLayout}
              />
              {lead ? <T style={styles.lead}>{lead}</T> : null}
            </View>
          </View>
          <View style={styles.panel}>
            <View style={styles.column}>{children}</View>
          </View>
        </View>
        <CoverRoom layout={layout} top={top} padding={padding} />
      </Animated.ScrollView>
      {footer ? <View style={[styles.footer, { bottom: dock, height: ctaSpace - 24 + 44 }]}>{footer}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  cover: {
    backgroundColor: c.media,
    overflow: "hidden",
    paddingBottom: 28 + OVERLAP,
  },
  fan: { alignSelf: "center", marginBottom: 18 },
  words: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    alignItems: "center",
    paddingHorizontal: space.gutter,
  },
  center: { textAlign: "center" },
  title: { color: c.white, textAlign: "center", marginTop: 8 },
  // Over 32 characters (Cameroon for Jesus Crusade & Conference 2026): two lines, not three.
  titleLong: { fontSize: fontSize.sermon, lineHeight: 32 },
  lead: { ...type.body, color: c.onMediaSoft, textAlign: "center", marginTop: 10 },
  panel: {
    marginTop: -OVERLAP,
    backgroundColor: c.bg,
    borderTopLeftRadius: radius.r28,
    borderTopRightRadius: radius.r28,
    paddingTop: space.xl,
  },
  column: {
    width: "100%",
    maxWidth: MAX_WIDTH,
    alignSelf: "center",
    paddingHorizontal: space.gutter,
  },
  nav: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    pointerEvents: "box-none",
    zIndex: 20,
  },
  band: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    // Solid: at 0.96 the cover's white title showed through it as a ghost.
    backgroundColor: c.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
    paddingHorizontal: 76,
    zIndex: 10,
    pointerEvents: "none",
  },
  bandLine: { height: 40, justifyContent: "center" },
  bandTitle: { ...type.label, color: c.text, textAlign: "center" },
  footer: { position: "absolute", left: 0, right: 0, pointerEvents: "box-none", zIndex: 30 },
});
