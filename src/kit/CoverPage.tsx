import { useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { memo, useCallback, useRef, useState, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGo, usePageTitle } from "../navigation";
import { useDockInset } from "../player/useDockInset";
import { c, easeOut, radius, space, textCap, type } from "../theme";
import { dockScrollPadding } from "../ui";
import type { ArtSource } from "./Artwork";
import { T, web } from "./base";
import { RoundButton } from "./buttons";
import { CardFan } from "./CardFan";
import { ItalicTitle, Kicker } from "./text";
import { Wash } from "./Wash";

/** How far the ivory panel rides up over the cover's bottom edge. */
const OVERLAP = 20;
const MAX_WIDTH = 760;

/**
 * A collection's page (a conference or teaching series, a topic), built as
 * a path's page is: a dark cover under the status bar with a fan of the
 * collection's own sermons, the gold-on-dark kicker ("Series · 5
 * messages"), the name in the serif, and a lead line; then an ivory panel
 * rising over it with the list. Back floats over the cover as a glass
 * button and stays put as the page scrolls. The status bar turns dark once
 * the cover has gone.
 */
export const CoverPage = memo(function CoverPage({
  title,
  italic,
  kicker,
  lead,
  fan,
  children,
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
  testID?: string;
}) {
  usePageTitle(title);
  const go = useGo();
  const insets = useSafeAreaInsets();
  const dock = useDockInset();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const scale = Math.min(0.9, (Math.min(width, MAX_WIDTH) - 40) / 340);
  const top = Math.max(insets.top, 12);

  // The status bar: light over the cover, dark once it has scrolled by.
  const [cover, setCover] = useState(320);
  const [past, setPast] = useState(false);
  const pastRef = useRef(false);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = e.nativeEvent.contentOffset.y > cover - insets.top - OVERLAP;
      if (next !== pastRef.current) {
        pastRef.current = next;
        setPast(next);
      }
    },
    [cover, insets.top],
  );

  return (
    <View style={styles.screen} testID={testID}>
      {focused ? <StatusBar style={past ? "dark" : "light"} animated /> : null}
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={dockScrollPadding(dock)}
        contentContainerStyle={{ paddingBottom: 48 + insets.bottom + dock }}
      >
        <View
          style={[styles.cover, { paddingTop: top + 60 }]}
          onLayout={(e) => setCover(e.nativeEvent.layout.height)}
          {...web({ dataSet: { dark: "true" } })}
        >
          <Wash kind="pathCover" />
          {fan.length ? (
            <CardFan sermons={fan.slice(0, 3)} size="cover" scale={scale} style={styles.fan} priority="high" />
          ) : null}
          <View style={styles.words}>
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
              style={[type.coverTitle, styles.title]}
              maxFontSizeMultiplier={textCap.display}
            />
            {lead ? <T style={styles.lead}>{lead}</T> : null}
          </View>
        </View>
        <View style={styles.panel}>
          <View style={styles.column}>{children}</View>
        </View>
      </ScrollView>

      {/* Under the status bar once the cover has gone, so the time stays legible. */}
      {insets.top > 0 ? (
        <Animated.View
          style={[
            styles.statusShade,
            {
              height: insets.top,
              opacity: past ? 1 : 0,
              transitionProperty: "opacity",
              transitionDuration: 200,
              transitionTimingFunction: easeOut,
            },
          ]}
        />
      ) : null}
      <View style={[styles.bar, { top: top + 4 }]}>
        <RoundButton icon="chevron-back" label="Back" tone="glass" size={40} iconSize={20} onPress={go.back} />
      </View>
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
  bar: { position: "absolute", left: 16, zIndex: 5 },
  statusShade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    // A soft fade rather than a hard band over whatever scrolls under it.
    backgroundColor: "rgba(247,244,238,0.94)",
    pointerEvents: "none",
  },
});
