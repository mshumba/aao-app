import { memo, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { c, font, gradients, radius, shadows, tabular, textCap, type } from "../theme";
import { Icon, T, Tap, gradient, type IconName } from "../ui";
import { clockText, leftText, spokenText, spokenTime } from "./time";

// ---- PlayPill ------------------------------------------------------------------------

export type PillTone = "navy" | "white" | "sand";
export type PillSize = "sm" | "md" | "lg";

const pillTone: Record<PillTone, { bg: string; fg: string }> = {
  navy: { bg: c.accent, fg: c.onAccent },
  white: { bg: c.white, fg: c.accent },
  sand: { bg: c.featureOnSurface, fg: c.accent },
};

/**
 * Every play control says how long. "Play from 1:52:27" (pass `at`), or
 * any label ("Watch", "Resume"). sm 36pt (44pt to touch), md 48pt (the
 * hero's white "Watch"), lg 56pt full width. Times use tabular figures.
 */
export const PlayPill = memo(function PlayPill({
  at,
  label,
  detail,
  onPress,
  tone = "navy",
  size = "sm",
  icon = "play",
  accessibilityLabel,
  hint,
  testID,
  style,
}: {
  /** Seconds: makes the label "Play from 1:52:27" and reads it as words. */
  at?: number;
  label?: string;
  /** A softer suffix after a dot: "· 48 min left". */
  detail?: string;
  onPress: () => void;
  tone?: PillTone;
  size?: PillSize;
  icon?: "play" | "pause" | "none" | IconName;
  accessibilityLabel?: string;
  hint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const text = label ?? (at != null ? `Play from ${clockText(at)}` : "Play");
  const spoken =
    accessibilityLabel ??
    [label ?? (at != null ? `Play from ${spokenTime(at)}` : "Play"), detail && spokenText(detail)]
      .filter(Boolean)
      .join(", ");
  const { bg, fg } = pillTone[tone];
  const glyph: IconName | null = icon === "none" ? null : icon;
  const sizes = pillSizes[size];
  const { fontScale } = useWindowDimensions();
  // The big call to action keeps every word at large text: the detail
  // takes a second line instead of being cut off.
  const stacked = size === "lg" && !!detail && fontScale >= LARGE_TEXT;
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      onPress={onPress}
      feedback={size === "lg" ? "scaleLarge" : "scale"}
      hitSlop={size === "sm" ? { top: 4, bottom: 4 } : undefined}
      style={[
        styles.pill,
        sizes.box,
        { backgroundColor: bg },
        size === "lg" && { boxShadow: shadows.cta },
        stacked && styles.pillStacked,
        style,
      ]}
    >
      {glyph ? <Icon name={glyph} size={sizes.icon} color={fg} /> : null}
      {stacked ? (
        <View style={styles.lines}>
          <T style={[sizes.text, styles.tabular, styles.centred, { color: fg }]} maxFontSizeMultiplier={textCap.chip}>
            {text}
          </T>
          <T
            style={[type.meta, styles.detail, styles.tabular, styles.centred, { color: fg }]}
            maxFontSizeMultiplier={textCap.chip}
          >
            {detail}
          </T>
        </View>
      ) : (
        <T style={[sizes.text, styles.tabular, { color: fg }]} numberOfLines={1} maxFontSizeMultiplier={textCap.chip}>
          {text}
          {detail ? <T style={[sizes.text, styles.detail, { color: fg }]}>{` · ${detail}`}</T> : null}
        </T>
      )}
    </Tap>
  );
});

const pillSizes: Record<PillSize, { box: ViewStyle; text: TextStyle; icon: number }> = {
  sm: { box: { minHeight: 36, paddingHorizontal: 14, gap: 6 }, text: type.labelSmall, icon: 13 },
  md: { box: { minHeight: 48, paddingHorizontal: 22, gap: 8 }, text: type.button, icon: 16 },
  lg: { box: { minHeight: 56, paddingHorizontal: 24, gap: 8, alignSelf: "stretch" }, text: type.buttonLarge, icon: 16 },
};

// ---- RoundButton ---------------------------------------------------------------------

export type RoundTone = "glass" | "glassSoft" | "surface" | "outlineOnDark" | "navy" | "white";

const roundTone: Record<RoundTone, { box: ViewStyle; fg: string }> = {
  // Over artwork and the dark covers.
  glass: { box: { backgroundColor: c.glass, borderWidth: 1, borderColor: c.glassBorder }, fg: c.white },
  // On the stage's dark panel (save, share).
  glassSoft: { box: { backgroundColor: c.glassOnStage, borderWidth: 1, borderColor: c.glassBorder }, fg: c.white },
  // On ivory and white cards (the save circle in a result).
  surface: { box: { backgroundColor: c.white, borderWidth: 1, borderColor: c.border }, fg: c.text },
  // The speed control: a ring only.
  outlineOnDark: { box: { borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" }, fg: c.white },
  navy: { box: { backgroundColor: c.accent }, fg: c.onAccent },
  white: { box: { backgroundColor: c.white }, fg: c.accent },
};

/**
 * A round icon button: 36, 40, 42, 48 or 56pt drawn, never under 44pt to
 * touch. Give it an icon or short text children ("1×").
 */
export const RoundButton = memo(function RoundButton({
  icon,
  label,
  onPress,
  tone = "glass",
  size = 40,
  iconSize,
  iconColor,
  nudge = 0,
  selected,
  children,
  testID,
  hint,
  style,
}: {
  icon?: IconName;
  label: string;
  onPress: () => void;
  tone?: RoundTone;
  size?: 36 | 40 | 42 | 48 | 56;
  iconSize?: number;
  iconColor?: string;
  /** Optical nudge to the right (a play glyph). */
  nudge?: number;
  selected?: boolean;
  children?: ReactNode;
  testID?: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = roundTone[tone];
  const slop = Math.max(0, (44 - size) / 2);
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      aria-selected={selected}
      onPress={onPress}
      hitSlop={slop ? { top: slop, bottom: slop, left: slop, right: slop } : undefined}
      style={[styles.round, t.box, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      {icon ? (
        <View style={nudge ? { marginLeft: nudge } : null}>
          <Icon name={icon} size={iconSize ?? Math.round(size * 0.45)} color={iconColor ?? t.fg} />
        </View>
      ) : (
        children
      )}
    </Tap>
  );
});

// ---- StickyCTA -----------------------------------------------------------------------

const CTA_HEIGHT = 56;
/** From this text size the big pill puts its detail on a second line. */
const LARGE_TEXT = 1.3;

/** Space to leave at the end of a scroll view under the sticky CTA. */
export function useStickyCTASpace() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const grow = fontScale >= LARGE_TEXT ? Math.round(40 * Math.min(fontScale, textCap.chip)) : 0;
  return CTA_HEIGHT + grow + ctaBottom(insets.bottom) + 24;
}

function ctaBottom(inset: number) {
  // The concept floats it 26pt off the bottom edge on a phone with a home
  // indicator; without one, 16pt.
  return Math.max(16, inset - 8);
}

/**
 * The navy pill that floats above the home indicator on path pages:
 * "▶ Continue Day 3 · 48 min left". Content scrolls under its ivory fade;
 * pad the scroll view by useStickyCTASpace(). Place it last in the screen.
 */
export const StickyCTA = memo(function StickyCTA({
  label,
  detail,
  onPress,
  icon = "play",
  accessibilityLabel,
  hint,
  testID,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  icon?: IconName | "none";
  accessibilityLabel?: string;
  hint?: string;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.ctaWrap, gradient(gradients.ctaFade), { paddingBottom: ctaBottom(insets.bottom) }]}
    >
      <PlayPill
        testID={testID}
        size="lg"
        label={label}
        detail={detail}
        icon={icon}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        hint={hint}
        style={styles.ctaPill}
      />
    </View>
  );
});

// ---- Small pieces ------------------------------------------------------------------

/** "48 min left" with tabular figures, read as "48 minutes left". */
export const TimeLeft = memo(function TimeLeft({
  seconds,
  style,
}: {
  seconds: number;
  style?: StyleProp<TextStyle>;
}) {
  const text = leftText(seconds);
  return (
    <T style={[type.meta, styles.tabular, { color: c.muted }, style]} accessibilityLabel={spokenText(text)}>
      {text}
    </T>
  );
});

/**
 * Which of a few items is showing (the hero's newest sermons). A pager the
 * person moves; it never advances on its own.
 */
export const PagerDots = memo(function PagerDots({
  count,
  index,
  onSelect,
  label = "Newest sermons",
}: {
  count: number;
  index: number;
  onSelect?: (index: number) => void;
  label?: string;
}) {
  return (
    <View
      style={styles.dots}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: `${index + 1} of ${count}` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        if (!onSelect) return;
        if (e.nativeEvent.actionName === "increment") onSelect(Math.min(count - 1, index + 1));
        if (e.nativeEvent.actionName === "decrement") onSelect(Math.max(0, index - 1));
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
      ))}
    </View>
  );
});

/** The viewer's initial in a navy circle with a white ring (opens Account). */
export const Avatar = memo(function Avatar({
  name,
  onPress,
  size = 38,
  testID,
}: {
  name: string | null | undefined;
  onPress: () => void;
  size?: number;
  testID?: string;
}) {
  const initial = (name?.trim()[0] ?? "").toLocaleUpperCase();
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Account"
      onPress={onPress}
      hitSlop={(44 - size) / 2 > 0 ? (44 - size) / 2 : undefined}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
    >
      {initial ? (
        <T style={styles.avatarText} maxFontSizeMultiplier={1.2}>
          {initial}
        </T>
      ) : (
        <Icon name="person" size={18} color={c.onAccent} />
      )}
    </Tap>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  tabular,
  detail: { fontFamily: font.medium, opacity: 0.82 },
  pillStacked: { paddingVertical: 8, borderRadius: 30 },
  lines: { flexShrink: 1, alignItems: "center" },
  centred: { textAlign: "center" },
  round: { alignItems: "center", justifyContent: "center" },
  ctaWrap: {
    position: "absolute",
    pointerEvents: "box-none",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 44,
    paddingHorizontal: 20,
    zIndex: 30,
  },
  ctaPill: { width: "100%", maxWidth: 560, alignSelf: "center" },
  dots: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 24 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.45)" },
  dotOn: { width: 18, backgroundColor: c.white },
  avatar: {
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: shadows.avatarRing,
  },
  avatarText: { fontFamily: font.bold, fontSize: 15, lineHeight: 18, color: c.onAccent },
});
