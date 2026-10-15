import { memo, useMemo, type ReactNode, type Ref } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { trustLine } from "../learning/format";
import type { PathStatus } from "../learning/types";
import { c, font, textCap, type } from "../theme";
import { Heading, Icon, T, TextButton, web } from "../ui";
import { splitItalic } from "./italic";
import { spokenKicker, spokenText } from "./time";

// ---- ItalicTitle -------------------------------------------------------------------

export { splitItalic };

export type ItalicTitleProps = TextProps & {
  text: string;
  /** The phrase to set in italics (a path's `italic`). */
  italic?: string | null;
  /** Italicise the last word instead (the hero and sermon page titles). */
  italicLast?: boolean;
  /** Start the italic phrase on a new line, as the concept's covers do. */
  breakBeforeItalic?: boolean;
  /** Extra style for the italic phrase (its colour, say). */
  italicStyle?: StyleProp<TextStyle>;
  ref?: Ref<Text>;
};

/**
 * A serif title with one phrase in Newsreader italic, at the same size:
 * "Breaking free from *habitual sin*". Pass the role as `style`
 * (type.title, type.pathName, …) and cap Dynamic Type with
 * maxFontSizeMultiplier (textCap.display for display sizes).
 */
export const ItalicTitle = memo(function ItalicTitle({
  text,
  italic,
  italicLast = false,
  breakBeforeItalic = false,
  italicStyle,
  style,
  ...rest
}: ItalicTitleProps) {
  const parts = useMemo(() => splitItalic(text, italic, italicLast), [text, italic, italicLast]);
  const before = breakBeforeItalic && parts.italic ? parts.before.replace(/\s+$/, "") : parts.before;
  return (
    <T style={[styles.serif, style]} accessibilityLabel={rest.accessibilityLabel ?? text} {...rest}>
      {before}
      {breakBeforeItalic && parts.italic ? "\n" : null}
      {parts.italic ? <Text style={[styles.italic, italicStyle]}>{parts.italic}</Text> : null}
      {parts.after}
    </T>
  );
});

// ---- Kicker --------------------------------------------------------------------------

export type KickerTone = "gold" | "muted" | "onMedia" | "onFeature" | "accent";

const kickerColor: Record<KickerTone, string> = {
  gold: c.gold,
  muted: c.muted,
  onMedia: c.onMediaKicker,
  onFeature: c.mutedOnFeature,
  accent: c.accent,
};

/**
 * The concept's eyebrow: 13/16, tracked, uppercase. Write it in sentence
 * case ("Your path · Day 3 of 7"); it's read aloud with full stops.
 * Gold on ivory and white; onFeature on sand (gold fails contrast there);
 * onMedia on the dark surfaces.
 */
export const Kicker = memo(function Kicker({
  children,
  tone = "gold",
  small = false,
  style,
  numberOfLines,
}: {
  children: string;
  tone?: KickerTone;
  /** Tracked a little tighter, for the compact path card. */
  small?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <T
      style={[type.overline, { color: kickerColor[tone] }, small && styles.kickerSmall, style]}
      accessibilityLabel={spokenKicker(children)}
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={textCap.section}
    >
      {children}
    </T>
  );
});

// ---- Quote ---------------------------------------------------------------------------

/** Curly quotes round a verbatim quote; the words are never touched. */
export function curly(quote: string) {
  return `“${quote.trim()}”`;
}

/**
 * A verbatim quote in Newsreader, in curly quotes, with the opening mark
 * hung outside the text column so every line starts on the same edge.
 */
export const Quote = memo(function Quote({
  text,
  size = "card",
  numberOfLines,
  hang = true,
  style,
}: {
  text: string;
  /** "card": 17.5/24 (results); "row": 16/22 (moment rows); "large": 24/32 italic. */
  size?: "card" | "row" | "large";
  numberOfLines?: number;
  hang?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const role = size === "row" ? type.quoteSmall : size === "large" ? type.quoteLarge : type.quote;
  // The opening mark is about 0.42em wide in Newsreader.
  const offset = Math.round(role.fontSize * 0.42);
  return (
    <View style={hang ? { paddingLeft: 0 } : null}>
      {hang ? (
        <Text
          style={[role, styles.quoteText, styles.hung, { left: -offset }, style]}
          accessible={false}
          importantForAccessibility="no"
          aria-hidden
          maxFontSizeMultiplier={textCap.quote}
        >
          {"“"}
        </Text>
      ) : null}
      <T
        style={[role, styles.quoteText, prettyWrap, style]}
        numberOfLines={numberOfLines}
        maxFontSizeMultiplier={textCap.quote}
        accessibilityLabel={`Quote: ${text.trim()}`}
        // Lines broken evenly, so no word is left alone on the last one.
        lineBreakStrategyIOS="push-out"
        textBreakStrategy="highQuality"
      >
        {hang ? `${text.trim()}”` : curly(text)}
      </T>
    </View>
  );
});

/** Web: balanced line breaks (no stranded last word). */
const prettyWrap = web({ textWrap: "pretty" }) as TextStyle;

// ---- SectionHeader -----------------------------------------------------------------

/**
 * A section's serif heading, with "See all" (navy, 44pt target) or a muted
 * count on the right, sharing the title's baseline.
 */
export const SectionHeader = memo(function SectionHeader({
  title,
  action,
  count,
  kicker,
  size = "lg",
  inset = 0,
  style,
}: {
  title: string;
  action?: { label?: string; onPress: () => void; hint?: string };
  /** "4 moments", "14 found". */
  count?: string;
  kicker?: string;
  /** "lg" 24/28 (Home); "md" 22/28 (Search results); "sermon" 24/28 (moments on a sermon). */
  size?: "lg" | "md" | "sermon";
  /** Horizontal padding (24 when it sits directly on a page). */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ paddingHorizontal: inset }, style]}>
      {kicker ? <Kicker style={styles.sectionKicker}>{kicker}</Kicker> : null}
      {/* With a count, a title that needs the room keeps its line and the
          count moves under it, rather than the title breaking. */}
      <View style={[styles.sectionRow, !action && count ? styles.sectionWrap : null]}>
        <Heading
          level={2}
          style={[
            type.section,
            size === "md" && styles.sectionMd,
            size === "sermon" && styles.sectionSermon,
            styles.sectionTitle,
            !action && count ? styles.sectionTitleWhole : null,
          ]}
          maxFontSizeMultiplier={textCap.section}
        >
          {title}
        </Heading>
        {action ? (
          <View style={styles.sectionAction}>
            <TextButton label={action.label ?? "See all"} onPress={action.onPress} hint={action.hint} align="end" />
          </View>
        ) : count ? (
          <T style={[styles.count, styles.countEnd, size === "sermon" && styles.countStrong]} numberOfLines={1}>
            {count}
          </T>
        ) : null}
      </View>
    </View>
  );
});

// ---- TrustLine -----------------------------------------------------------------------

/**
 * Who set a path's order, honestly: "Order set by the ministry" (navy
 * shield-check) only when it's published; otherwise "Draft · awaiting
 * ministry review" (muted outline shield).
 */
export const TrustLine = memo(function TrustLine({
  status,
  extra,
  tone = "light",
  style,
}: {
  status: PathStatus;
  /** Appended after a dot: "About 16 min a day". */
  extra?: string;
  /** "dark" on the dark path cards and covers. */
  tone?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
}) {
  const line = trustLine(status);
  const text = extra ? `${line.text} · ${extra}` : line.text;
  // "Draft, awaiting ministry review. About 16 minutes a day."
  const spoken = [line.text.replace(" · ", ", "), extra ? spokenText(extra) : null].filter(Boolean).join(". ");
  const dark = tone === "dark";
  const iconColor = dark
    ? line.tone === "accent"
      ? c.white
      : c.onMediaMuted
    : line.tone === "accent"
      ? c.accent
      : c.muted;
  return (
    <View
      style={[styles.trust, style]}
      accessible
      accessibilityLabel={spoken}
      // Web drops a label on an element with no role.
      {...web({ role: "img" })}
    >
      <Icon name={line.icon} size={15} color={iconColor} />
      <T style={[styles.trustText, dark && styles.trustOnDark]}>{text}</T>
    </View>
  );
});

/** Bold runs inside a muted line: "Finding moments about **breaking a habit**". */
export function Strong({ children }: { children: ReactNode }) {
  return <Text style={styles.strong}>{children}</Text>;
}

const styles = StyleSheet.create({
  serif: { fontFamily: font.serif, color: c.text },
  italic: { fontFamily: font.serifItalic },
  kickerSmall: { letterSpacing: 0.5 },
  quoteText: { color: c.text },
  hung: { position: "absolute", top: 0 },
  sectionKicker: { marginBottom: 4 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: { flexShrink: 1, color: c.text },
  sectionWrap: { flexWrap: "wrap", rowGap: 2 },
  sectionTitleWhole: { flexShrink: 0, maxWidth: "100%" },
  countEnd: { marginLeft: "auto" },
  sectionMd: { fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  sectionSermon: { fontSize: 24, lineHeight: 28 },
  // The text button is 48pt tall; pull it back so its label sits on the
  // title's baseline instead of pushing the row taller.
  sectionAction: { marginVertical: -14 },
  count: { ...type.metaSmall, fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: c.muted, flexShrink: 0 },
  countStrong: { fontFamily: font.semibold },
  trust: { flexDirection: "row", alignItems: "center", gap: 6 },
  trustText: { ...type.metaSmall, color: c.muted, flexShrink: 1 },
  trustOnDark: { color: c.onMediaMuted },
  strong: { fontFamily: font.bold, color: c.text },
});
