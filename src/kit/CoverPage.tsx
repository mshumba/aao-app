import { memo, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
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
import { FocusedStatusBar } from "./FocusedStatusBar";
import { ItalicTitle, Kicker } from "./text";
import { Wash } from "./Wash";

/** How far the ivory panel rides up over the cover's bottom edge. */
const OVERLAP = 20;
const MAX_WIDTH = 760;
/** The pinned header under the status bar: the 40pt buttons and a little air. */
export const BAND = 52;
/** A longer title steps down a size, so it doesn't run to three lines. */
const LONG_TITLE = 32;

// ---- The pinned header ----------------------------------------------------------------

/** The page's scroll, on the UI thread, for the pinned header. */
export function useCoverScroll() {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y);
    },
  });
  return { scrollY, onScroll };
}

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
  under,
  scrollY,
}: {
  title: string;
  top: number;
  under: number;
  scrollY: SharedValue<number>;
}) {
  const fade = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [under - 16, under + 8], [0, 1], Extrapolation.CLAMP),
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
  under,
  scrollY,
  onBack,
  backTestID,
  share,
}: {
  top: number;
  under: number;
  scrollY: SharedValue<number>;
  onBack: () => void;
  backTestID?: string;
  share?: { label: string; onPress: () => void; testID?: string };
}) {
  const banded = useBandShown(scrollY, under);
  const tone = banded ? "surface" : "glass";
  return (
    <>
      <FocusedStatusBar style={banded ? "dark" : "light"} />
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
  // cover, then the title's in them.
  const [wordsY, setWordsY] = useState(() => top + 60 + 124 * scale + 18);
  const [titleEnd, setTitleEnd] = useState(60);
  const under = wordsY + titleEnd - (top + BAND);
  const { scrollY, onScroll } = useCoverScroll();

  return (
    <View style={styles.screen} testID={testID}>
      {/* Drawn above the page, and first in order, so Back is read first. */}
      <CoverBand title={title} top={top} under={under} scrollY={scrollY} />
      <CoverNav top={top} under={under} scrollY={scrollY} onBack={go.back} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={dockScrollPadding(dock)}
        contentContainerStyle={{ paddingBottom: (footer ? ctaSpace : 48 + insets.bottom) + dock }}
      >
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
          <View style={styles.words} onLayout={(e) => setWordsY(e.nativeEvent.layout.y)}>
            {kicker ? (
              <Kicker tone="onMedia" style={styles.center}>
                {kicker}
              </Kicker>
            ) : null}
            <ItalicTitle
              text={title}
              italic={italic}
              accessibilityRole="header"
              {...web({ "aria-level": 1 })}
              style={[type.coverTitle, styles.title, title.length > LONG_TITLE && styles.titleLong]}
              maxFontSizeMultiplier={textCap.display}
              onLayout={(e) => setTitleEnd(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
            />
            {lead ? <T style={styles.lead}>{lead}</T> : null}
          </View>
        </View>
        <View style={styles.panel}>
          <View style={styles.column}>{children}</View>
        </View>
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
