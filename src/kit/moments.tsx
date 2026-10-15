import { memo, useMemo, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { searchSermonMeta } from "../learning/format";
import type { SearchMoment } from "../learning/types";
import { c, font, radius, shadows, tabular, textCap, type } from "../theme";
import { Icon, SermonTitle, T, Tap } from "../ui";
import { Artwork } from "./Artwork";
import { PlayPill, RoundButton } from "./buttons";
import { Quote } from "./text";
import { clockText, spokenText, spokenTime } from "./time";

const fadeIn = { from: { opacity: 0 }, to: { opacity: 1 } };

/**
 * Where a quote will be: static sand lines at the quote's final geometry
 * (no shimmer), so nothing moves when it arrives.
 */
export const QuotePlaceholder = memo(function QuotePlaceholder({
  lines = 3,
  lineHeight = 24,
  style,
}: {
  lines?: number;
  lineHeight?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const widths = ["100%", "94%", "58%", "86%", "40%"] as const;
  return (
    <View style={style} accessible accessibilityLabel="Finding the quote">
      {Array.from({ length: lines }, (_, i) => (
        <View key={i} style={{ height: lineHeight, justifyContent: "center" }}>
          <View style={[styles.placeholderLine, { width: widths[i % widths.length] }]} />
        </View>
      ))}
    </View>
  );
});

// ---- MomentCard (search result) --------------------------------------------------

export type MomentCardProps = {
  moment: SearchMoment;
  /** Its quote is being fetched: show the placeholder. */
  quotePending?: boolean;
  /** Plays from `moment.at`. */
  onPlay: (moment: SearchMoment) => void;
  /** Opens the sermon (tapping the artwork and title). */
  onOpen?: (moment: SearchMoment) => void;
  saved?: boolean;
  onToggleSave?: (moment: SearchMoment) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A moment that speaks to the question: the sermon (art, headline, date
 * and length), his words in curly quotes, and "Play from 1:52:27". Callbacks
 * receive the moment, so a list can pass one stable function.
 */
export const MomentCard = memo(function MomentCard({
  moment,
  quotePending = false,
  onPlay,
  onOpen,
  saved = false,
  onToggleSave,
  testID,
  style,
}: MomentCardProps) {
  const { sermon } = moment;
  const art = useMemo(
    () => ({ id: sermon.youtubeId, thumbnail: sermon.thumbnailUrl }),
    [sermon.youtubeId, sermon.thumbnailUrl],
  );
  const meta = searchSermonMeta(sermon);
  // A quote that arrives after the card is shown crossfades in.
  const [arrives] = useState(() => moment.quote == null);

  const header = (
    <View style={styles.top}>
      <Artwork art={art} width={96} radius={10} />
      <View style={styles.topText}>
        <SermonTitle title={sermon.headline} style={styles.title} numberOfLines={2} />
        <T style={styles.meta}>{meta}</T>
      </View>
    </View>
  );

  return (
    <View testID={testID} style={[styles.card, style]}>
      {onOpen ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`${sermon.headline}. ${spokenText(meta)}`}
          accessibilityHint="Opens the sermon"
          onPress={() => onOpen(moment)}
          feedback="dim"
        >
          {header}
        </Tap>
      ) : (
        header
      )}
      <View style={styles.quoteBox}>
        {moment.quote ? (
          <Animated.View
            style={
              arrives
                ? { animationName: fadeIn, animationDuration: 200, animationFillMode: "backwards" }
                : null
            }
          >
            <Quote text={moment.quote} numberOfLines={5} />
          </Animated.View>
        ) : quotePending ? (
          <QuotePlaceholder />
        ) : null}
      </View>
      <View style={styles.foot}>
        <PlayPill at={moment.at} onPress={() => onPlay(moment)} />
        {onToggleSave ? (
          <RoundButton
            tone="surface"
            size={36}
            icon={saved ? "bookmark" : "bookmark-outline"}
            iconSize={17}
            iconColor={saved ? c.accent : c.text}
            label={saved ? "Saved. Remove this moment" : "Save this moment"}
            selected={saved}
            onPress={() => onToggleSave(moment)}
          />
        ) : null}
      </View>
    </View>
  );
});

// ---- MomentRow (moments in a sermon) ---------------------------------------------

export type MomentRowState = "default" | "past" | "playing" | "next";

/**
 * One moment in "Moments in this sermon": a timestamp chip, the moment's
 * title and his words. "playing" and "next" lift onto a white card with a
 * navy chip ("Playing" / "Coming up in 4 min"). Pressing it plays from there.
 */
export const MomentRow = memo(function MomentRow({
  at,
  title,
  quote,
  state = "default",
  comingUpMinutes,
  first = false,
  stampWidth,
  onPress,
  testID,
}: {
  at: number;
  title: string;
  quote?: string | null;
  state?: MomentRowState;
  /** For "next": minutes until it plays. */
  comingUpMinutes?: number;
  /**
   * No divider above: the first row, and the row right after a lifted
   * ("playing" or "next") one.
   */
  first?: boolean;
  /** One width for every chip in a list, so the quotes share one left edge. */
  stampWidth?: number;
  onPress: (at: number) => void;
  testID?: string;
}) {
  // "Coming up" lifts onto a white card; "Playing" stays flat, marked by a
  // navy edge and chip, so the two never look alike.
  const lifted = state === "next";
  const playing = state === "playing";
  const navyChip = lifted || playing;
  const flag =
    state === "playing"
      ? "Playing"
      : state === "next"
        ? comingUpMinutes != null
          ? comingUpMinutes < 1
            ? "Coming up now"
            : `Coming up in ${comingUpMinutes} min`
          : "Up next"
        : null;
  const label = [
    spokenTime(at),
    flag && spokenText(flag),
    title,
    quote ? `“${quote}”` : null,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Plays from here"
      aria-selected={state === "playing"}
      onPress={() => onPress(at)}
      feedback={lifted ? "scaleLarge" : "highlight"}
      highlightColor={c.featureOnSurface}
      style={[
        styles.row,
        !first && !lifted && !playing && styles.rowDivider,
        lifted && styles.rowLifted,
        playing && styles.rowPlaying,
      ]}
    >
      <View style={[styles.stamp, stampWidth ? { minWidth: stampWidth } : null, navyChip && styles.stampOn]}>
        {navyChip ? <Icon name={playing ? "pause" : "play"} size={10} color={c.onAccent} /> : null}
        <T style={[styles.stampText, navyChip && { color: c.onAccent }]} maxFontSizeMultiplier={textCap.chip}>
          {clockText(at)}
        </T>
      </View>
      <View style={styles.rowText}>
        {flag ? (
          <T style={styles.flag} maxFontSizeMultiplier={textCap.section}>
            {flag}
          </T>
        ) : null}
        <T style={[type.rowTitle, { color: state === "past" ? c.muted : c.text }, flag && { marginTop: 2 }]}>
          {title}
        </T>
        {quote ? <Quote text={quote} size="row" hang={false} style={styles.rowQuote} /> : null}
      </View>
    </Tap>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.r22,
    padding: 14,
    boxShadow: shadows.card,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  topText: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.bold, fontSize: 14, lineHeight: 18, color: c.text },
  meta: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, color: c.muted, marginTop: 3, ...tabular },
  // The opening quote mark hangs into the card's padding, so the lines of
  // the quote share the title's left edge.
  quoteBox: { marginVertical: 12, marginHorizontal: 2 },
  foot: { flexDirection: "row", alignItems: "center", gap: 8 },
  placeholderLine: { height: 12, borderRadius: 4, backgroundColor: c.feature },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: radius.r18,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: c.divider, borderRadius: 0 },
  rowLifted: {
    backgroundColor: c.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginHorizontal: -8,
    marginVertical: 2,
    boxShadow: shadows.row,
  },
  // The doc's playing row: flat, a navy edge on the left, a cool wash.
  rowPlaying: {
    backgroundColor: "#f3f4f6",
    borderLeftWidth: 3,
    borderLeftColor: c.accent,
    borderRadius: 12,
    paddingLeft: 9,
    paddingRight: 12,
    marginHorizontal: -8,
    marginVertical: 2,
  },
  stamp: {
    minWidth: 62,
    minHeight: 28,
    borderRadius: 14,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 9,
  },
  stampOn: { backgroundColor: c.accent, borderColor: c.accent },
  stampText: { fontFamily: font.extrabold, fontSize: 12.5, lineHeight: 16, color: c.accent, ...tabular },
  rowText: { flex: 1, minWidth: 0 },
  flag: { ...type.overline, fontSize: 11, letterSpacing: 1.1, color: c.gold },
  rowQuote: { marginTop: 3 },
});
