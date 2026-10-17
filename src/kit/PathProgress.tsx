import { memo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { c, tabular, textCap, type } from "../theme";
import { T, web } from "../ui";

export type ProgressTone = "onDark" | "onLight" | "onFeature";

const tones: Record<ProgressTone, { track: string; fill: string; caption: string; strong: string }> = {
  // The dark path card and cover: white on white 18%.
  onDark: { track: c.onMediaTrack, fill: c.white, caption: c.onMediaMuted, strong: c.white },
  // Ivory and white: navy on the warm track.
  onLight: { track: c.track, fill: c.accent, caption: c.muted, strong: c.accent },
  // Sand ("part of your path"): navy on navy 16%.
  onFeature: { track: c.accentTrack, fill: c.accent, caption: c.mutedOnFeature, strong: c.accent },
};

/**
 * One segment per day: done segments filled, today's filled as far as it's
 * been watched, the rest on the track. Decorative unless given a label; the
 * card it sits in says "Day 3 of 7" in words.
 */
export const PathProgress = memo(function PathProgress({
  total,
  done,
  current,
  partial = 0,
  tone = "onLight",
  thickness = 4,
  gap,
  caption,
  accessibilityLabel,
  style,
}: {
  total: number;
  /** Day numbers done (1-based), or how many from the start. */
  done: readonly number[] | number;
  /** Today's day number; its segment fills to `partial`. */
  current?: number | null;
  /** 0 to 1: how far through today's sermon. */
  partial?: number;
  tone?: ProgressTone;
  /** 4pt on cards and covers; 3pt in rows. */
  thickness?: number;
  /** Space between segments: 4, or 3 in rows. */
  gap?: number;
  /** A line under the bar: `[left, right]` spread apart, or one centred string set. */
  caption?: { left: string; right?: string; centered?: boolean };
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = tones[tone];
  const isDone = (n: number) => (typeof done === "number" ? n <= done : done.includes(n));
  const fill = Math.min(1, Math.max(0, partial));
  const segments = Array.from({ length: Math.max(1, total) }, (_, i) => {
    const n = i + 1;
    if (isDone(n)) return 1;
    if (current === n) return fill;
    return 0;
  });
  return (
    <View
      style={style}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? "yes" : "no-hide-descendants"}
      // Web drops a label on an element with no role.
      {...(accessibilityLabel ? web({ role: "img" }) : web({ "aria-hidden": true }))}
    >
      <View style={[styles.row, { gap: gap ?? (thickness < 4 ? 3 : 4) }]}>
        {segments.map((value, i) => (
          <View
            key={i}
            style={[styles.segment, { height: thickness, borderRadius: thickness / 2, backgroundColor: t.track }]}
          >
            {value > 0 ? (
              <View style={{ width: `${value * 100}%`, height: thickness, backgroundColor: t.fill }} />
            ) : null}
          </View>
        ))}
      </View>
      {caption?.centered ? (
        // One line of text, so a narrow column or large text wraps it as a
        // sentence rather than splitting it into columns.
        <T
          style={[type.metaSmall, tabular, styles.captionLine, { color: t.caption }]}
          maxFontSizeMultiplier={textCap.section}
        >
          <Text style={{ color: t.strong }}>{caption.left}</Text>
          {caption.right ? `\u2003·\u2003${caption.right}` : null}
        </T>
      ) : caption ? (
        <View style={styles.caption}>
          <T style={[type.metaSmall, tabular, { color: t.strong }]} maxFontSizeMultiplier={textCap.section}>
            {caption.left}
          </T>
          {caption.right ? (
            <T style={[type.metaSmall, tabular, { color: t.caption }]} maxFontSizeMultiplier={textCap.section}>
              {caption.right}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  segment: { flex: 1, overflow: "hidden" },
  caption: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  captionLine: { marginTop: 8, textAlign: "center" },
});
