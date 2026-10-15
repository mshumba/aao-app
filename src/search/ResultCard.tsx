import { memo, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { css } from "react-native-reanimated";
import { Artwork, PlayPill, Quote, QuotePlaceholder, RoundButton, spokenText } from "../kit";
import { searchSermonMeta, type SearchMoment } from "../learning";
import { c, font, radius, shadows, tabular } from "../theme";
import { SermonTitle, T, Tap } from "../ui";
import { breathe } from "./Loader";

/**
 * One moment that speaks to the question, as concept screen 02 draws it: a
 * white card with the sermon (art, headline, date and length), his words in
 * curly quotes, "Play from 1:52:27" and a save circle.
 *
 * A local variant of the kit's MomentCard: the circle here saves the whole
 * sermon (the existing library save), so it is named for that, and a quote
 * that is still being fetched holds its place with static sand lines, then
 * crossfades in. A moment whose quote never passes shows none: never the raw
 * transcript.
 */

const fadeIn = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

export const ResultCard = memo(function ResultCard({
  moment,
  quotePending,
  saved,
  onPlay,
  onOpen,
  onToggleSave,
  continued = false,
}: {
  moment: SearchMoment;
  quotePending: boolean;
  saved: boolean;
  /** Right after a moment from the same sermon: the header isn't repeated. */
  continued?: boolean;
  onPlay: (moment: SearchMoment) => void;
  onOpen: (moment: SearchMoment) => void;
  onToggleSave: (moment: SearchMoment) => void;
}) {
  const { sermon } = moment;
  const art = useMemo(
    () => ({ id: sermon.youtubeId, thumbnail: sermon.thumbnailUrl }),
    [sermon.youtubeId, sermon.thumbnailUrl],
  );
  const meta = searchSermonMeta(sermon);
  // Only a quote that arrives after the card is on screen fades in.
  const [arrives] = useState(() => moment.quote == null);

  return (
    // The list brings results in as one (reveal.tsx): a card doesn't
    // animate itself, so one scrolled away and back doesn't play it again.
    <View testID="moment-result" style={styles.card}>
      {continued ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`Also in this sermon: ${sermon.headline}`}
          accessibilityHint="Opens the sermon"
          onPress={() => onOpen(moment)}
          feedback="dim"
          style={styles.also}
        >
          <T style={styles.alsoText}>Also in this sermon</T>
        </Tap>
      ) : (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`${sermon.headline}. ${spokenText(meta).replace(/ · /g, ", ")}`}
          accessibilityHint="Opens the sermon"
          onPress={() => onOpen(moment)}
          feedback="dim"
          style={styles.top}
        >
          <Artwork art={art} width={96} radius={10} fallback={sermon.headline} />
          <View style={styles.topText}>
            <SermonTitle title={sermon.headline} style={styles.title} numberOfLines={3} />
            <T style={styles.meta}>{meta}</T>
          </View>
        </Tap>
      )}
      {moment.quote ? (
        <Animated.View
          style={[
            styles.quote,
            arrives && { animationName: fadeIn, animationDuration: 200, animationFillMode: "backwards" },
          ]}
        >
          {/* Set flush, as the concept sets it: every line on the title's edge. */}
          <Quote text={moment.quote} numberOfLines={6} hang={false} />
        </Animated.View>
      ) : quotePending ? (
        // Most quotes run to two lines; the card eases to the real height.
        <QuotePlaceholder lines={2} style={styles.quote} />
      ) : (
        <View style={styles.noQuote} />
      )}
      <View style={styles.foot}>
        <PlayPill at={moment.at} onPress={() => onPlay(moment)} hint={`Plays ${sermon.headline} from this moment`} />
        <RoundButton
          tone="surface"
          size={36}
          icon={saved ? "bookmark" : "bookmark-outline"}
          iconSize={17}
          iconColor={saved ? c.accent : c.text}
          label={saved ? `Saved. Remove ${sermon.headline} from your library` : `Save ${sermon.headline} to your library`}
          selected={saved}
          onPress={() => onToggleSave(moment)}
        />
      </View>
    </View>
  );
});

/**
 * Where a result will be while search runs: the card's exact geometry in
 * sand, so nothing moves when the results arrive. It breathes (opacity
 * only, so under Reduce Motion too); no shimmer.
 */
export const ResultPlaceholder = memo(function ResultPlaceholder() {
  return (
    <Animated.View
      testID="result-placeholder"
      style={[styles.card, breathe]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.top}>
        <View style={styles.artBlock} />
        <View style={[styles.topText, { gap: 7 }]}>
          <View style={[styles.line, { width: "92%" }]} />
          <View style={[styles.line, { width: "64%" }]} />
          <View style={[styles.line, styles.lineSoft, { width: "44%", height: 9, marginTop: 3 }]} />
        </View>
      </View>
      <QuotePlaceholder lines={2} style={styles.quote} />
      <View style={styles.foot}>
        <View style={styles.pillBlock} />
        <View style={styles.circleBlock} />
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: c.surface,
    borderRadius: radius.r22,
    padding: 14,
    boxShadow: shadows.card,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  topText: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.bold, fontSize: 14, lineHeight: 18, color: c.text },
  meta: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, color: c.muted, marginTop: 3, ...tabular },
  // The opening mark hangs into the card's padding (Quote), so the lines
  // share the title's left edge, as the concept sets them.
  quote: { marginTop: 12, marginBottom: 12, marginHorizontal: 2 },
  noQuote: { height: 12 },
  also: { minHeight: 32, justifyContent: "center" },
  alsoText: { fontFamily: font.semibold, fontSize: 12.5, lineHeight: 17, color: c.muted },
  foot: { flexDirection: "row", alignItems: "center", gap: 8 },
  artBlock: { width: 96, height: 54, borderRadius: 10, backgroundColor: c.feature },
  line: { height: 11, borderRadius: 4, backgroundColor: c.feature },
  lineSoft: { backgroundColor: c.featureOnSurface },
  pillBlock: { width: 154, height: 36, borderRadius: radius.pill, backgroundColor: c.feature },
  circleBlock: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.featureOnSurface },
});
