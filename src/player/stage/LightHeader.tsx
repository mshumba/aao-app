import { memo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { RoundButton } from "../../kit";
import { STAGE_BAR } from "../layout";
import { c, easeOut, radius, space, type } from "../../theme";
import { T, Tap } from "../../ui";
import { PlaylistIcon } from "./icons";

type LightHeaderProps = {
  /** Column width on wide viewports. */
  width?: number;
  /** Path or series name centred in the header (null/empty for a lone sermon). */
  title?: string | null;
  /** Optional fallback title that fades in only after the main title scrolls out of view. */
  scrollTitle?: string | null;
  scrollTitleShown?: boolean;
  onBack: () => void;
  /** Opens the path's days or jumps to the sermon's moments. */
  onRightPress: () => void;
  rightLabel: string;
  rightHint?: string;
  /** Web: offer a keyboard skip link straight to the video player after Back. */
  skipToPlayer?: boolean;
  onSkipToPlayer?: () => void;
};

/**
 * Light header above the edge-to-edge video: a round Back button on the left,
 * the path or series name centred (or nothing for a lone sermon), and on the
 * right a round button that opens the path's days or the sermon's moments.
 */
export const LightHeader = memo(function LightHeader({
  width,
  title,
  scrollTitle,
  scrollTitleShown = false,
  onBack,
  onRightPress,
  rightLabel,
  rightHint,
  skipToPlayer = false,
  onSkipToPlayer,
}: LightHeaderProps) {
  const staticTitle = title?.trim() || null;
  const dynamicTitle = !staticTitle && scrollTitle ? scrollTitle : null;

  return (
    <View style={styles.barWrap}>
      <View style={[styles.bar, width ? { width } : null]}>
        <RoundButton
          tone="surface"
          size={40}
          icon="chevron-back"
          iconSize={20}
          label="Back"
          onPress={onBack}
        />
        {skipToPlayer && Platform.OS === "web" && onSkipToPlayer ? (
          <SkipToPlayer onPress={onSkipToPlayer} />
        ) : null}
        <View style={styles.titleSlot}>
          {staticTitle ? (
            <T style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.25}>
              {staticTitle}
            </T>
          ) : dynamicTitle ? (
            <Animated.View
              style={{
                alignSelf: "stretch",
                opacity: scrollTitleShown ? 1 : 0,
                transitionProperty: "opacity",
                transitionDuration: 200,
                transitionTimingFunction: easeOut,
              }}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <T style={styles.title} numberOfLines={1} aria-hidden maxFontSizeMultiplier={1.2}>
                {dynamicTitle}
              </T>
            </Animated.View>
          ) : null}
        </View>
        <RoundButton
          tone="surface"
          size={40}
          label={rightLabel}
          hint={rightHint}
          onPress={onRightPress}
          testID="stage-header-right"
        >
          <PlaylistIcon size={20} color={c.text} />
        </RoundButton>
      </View>
    </View>
  );
});

function SkipToPlayer({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Go to video player"
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      feedback="dim"
      style={[styles.skipLink, !focused && styles.offscreen]}
    >
      <T style={styles.skipLinkText}>Go to video player</T>
    </Tap>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    backgroundColor: c.bg,
    zIndex: 3,
  },
  bar: {
    height: STAGE_BAR,
    alignSelf: "center",
    width: "100%",
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
  },
  titleSlot: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...type.label,
    color: c.text,
    textAlign: "center",
  },
  skipLink: {
    position: "absolute",
    left: space.lg + 48,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  offscreen: {
    left: -9999,
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
  skipLinkText: {
    ...type.label,
    color: c.accent,
  },
});
