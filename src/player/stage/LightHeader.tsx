import { memo, type Ref } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { RoundButton } from "../../kit";
import { c, easeOut, radius, space, type } from "../../theme";
import { T, Tap, web } from "../../ui";
import { PlaylistIcon } from "./icons";

export const LIGHT_HEADER_HEIGHT = 56;

export type LightHeaderProps = {
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
  rightRef?: Ref<View>;
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
  title,
  scrollTitle,
  scrollTitleShown = false,
  onBack,
  onRightPress,
  rightLabel,
  rightHint,
  rightRef,
  skipToPlayer = false,
  onSkipToPlayer,
}: LightHeaderProps) {
  const staticTitle = title?.trim() || null;
  const dynamicTitle = !staticTitle && scrollTitle ? scrollTitle : null;

  return (
    <View style={styles.bar}>
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
      <View
        style={styles.titleSlot}
        accessible={!!staticTitle}
        accessibilityRole={staticTitle ? "header" : undefined}
      >
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
      <View ref={rightRef} collapsable={false}>
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
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Go to video player"
      onPress={onPress}
      feedback="dim"
      style={styles.skipLink}
    >
      <T style={styles.skipLinkText}>Go to video player</T>
    </Tap>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: LIGHT_HEADER_HEIGHT,
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.bg,
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
    left: -10000,
    width: 1,
    height: 1,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    ...web({
      ":focus": {
        left: 64,
        top: 6,
        width: "auto",
        height: 44,
        paddingHorizontal: space.md,
        zIndex: 10,
      },
    }),
  },
  skipLinkText: {
    ...type.label,
    color: c.accent,
  },
});
