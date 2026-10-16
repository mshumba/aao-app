import { memo, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { css } from "react-native-reanimated";
import { Artwork, PlayPill, Quote, QuotePlaceholder, clockText, spokenText, spokenTime } from "../kit";
import { searchSermonMeta, type SearchMoment } from "../learning";
import { c, font, fontSize, radius, shadows, tabular, textCap, type } from "../theme";
import { Icon, SermonTitle, T, Tap } from "../ui";

/**
 * One moment that speaks to the question, as concept screen 02 draws it: a
 * white card with the sermon (art, headline, date and length) and a bare
 * bookmark beside it, his words in curly quotes, then where they are. The
 * first card plays from a navy "Play from 1:52:27" pill; the rest from a
 * quieter time chip ("▸ 1:44:32"), as a list of key moments does, so one
 * filled button leads the page rather than one on every card.
 *
 * A local variant of the kit's MomentCard: the bookmark here saves the
 * whole sermon (the same save as everywhere else), so it is named for that,
 * and a quote that is still being fetched holds its place with static sand
 * lines, then crossfades in. A moment whose quote never passes is listed
 * under "Also mentioned in" instead (AlsoRow): never the raw transcript.
 */

const fadeIn = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

/** A meta line as words, its no-break spaces read as spaces. */
const spokenMeta = (meta: string) => spokenText(meta.replace(/ /g, " ")).replace(/ · /g, ", ");

export const ResultCard = memo(function ResultCard({
  moment,
  quotePending,
  saved,
  lead = false,
  onPlay,
  onOpen,
  onToggleSave,
  continued = false,
}: {
  moment: SearchMoment;
  quotePending: boolean;
  saved: boolean;
  /** The first result: it plays from the navy pill. */
  lead?: boolean;
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
  const hint = `Plays ${sermon.headline} from this moment`;
  // A narrow phone keeps the headline two lines beside the art and bookmark.
  const narrow = useWindowDimensions().width < 360;

  return (
    // The list brings results in as one (reveal.tsx): a card doesn't
    // animate itself, so one scrolled away and back doesn't play it again.
    <View testID="moment-result" style={styles.card}>
      <View style={styles.head}>
        {continued ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={`Also in this sermon: ${sermon.headline}`}
            accessibilityHint="Opens the sermon"
            onPress={() => onOpen(moment)}
            feedback="dim"
            style={[styles.headTap, styles.also]}
          >
            <T style={styles.alsoText}>Also in this sermon</T>
          </Tap>
        ) : (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={`${sermon.headline}. ${spokenMeta(meta)}`}
            accessibilityHint="Opens the sermon"
            onPress={() => onOpen(moment)}
            feedback="dim"
            style={[styles.headTap, styles.top]}
          >
            <Artwork art={art} width={narrow ? 80 : 96} radius={10} fallback={sermon.headline} />
            <View style={styles.topText}>
              <SermonTitle title={sermon.headline} style={styles.title} numberOfLines={3} />
              <T style={styles.meta}>{meta}</T>
            </View>
          </Tap>
        )}
        <SaveMark
          saved={saved}
          label={saved ? `Remove ${sermon.headline} from saved` : `Save ${sermon.headline}`}
          onPress={() => onToggleSave(moment)}
        />
      </View>
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
        {lead ? (
          <PlayPill at={moment.at} onPress={() => onPlay(moment)} hint={hint} />
        ) : (
          <TimeChip at={moment.at} onPress={() => onPlay(moment)} hint={hint} />
        )}
      </View>
    </View>
  );
});

/**
 * A moment search found without a quote that passed: listed after the
 * quoted ones as a compact row (the sermon's art and headline, and where),
 * so a card never sits there with nothing in it.
 */
export const AlsoRow = memo(function AlsoRow({
  moment,
  first,
  onPlay,
  onOpen,
}: {
  moment: SearchMoment;
  first: boolean;
  onPlay: (moment: SearchMoment) => void;
  onOpen: (moment: SearchMoment) => void;
}) {
  const { sermon } = moment;
  const art = useMemo(
    () => ({ id: sermon.youtubeId, thumbnail: sermon.thumbnailUrl }),
    [sermon.youtubeId, sermon.thumbnailUrl],
  );
  return (
    <View testID="moment-also" style={styles.alsoRow}>
      {first ? null : <View style={styles.divider} />}
      <Tap
        accessibilityRole="button"
        accessibilityLabel={`${sermon.headline}. ${spokenMeta(searchSermonMeta(sermon))}`}
        accessibilityHint="Opens the sermon"
        onPress={() => onOpen(moment)}
        feedback="dim"
        style={styles.alsoOpen}
      >
        <Artwork art={art} width={64} radius={6} fallback={sermon.headline} />
        <SermonTitle title={sermon.headline} style={styles.alsoTitle} numberOfLines={2} />
      </Tap>
      <TimeChip at={moment.at} onPress={() => onPlay(moment)} hint={`Plays ${sermon.headline} from this moment`} />
    </View>
  );
});

/**
 * Where a moment is, as a quiet chip that plays from it ("▸ 1:44:32"). Read
 * as the navy pill is: "Play from 1 hour 44 minutes 32 seconds". 30pt tall,
 * 44pt to touch.
 */
const TimeChip = memo(function TimeChip({ at, onPress, hint }: { at: number; onPress: () => void; hint: string }) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`Play from ${spokenTime(at)}`}
      accessibilityHint={hint}
      onPress={onPress}
      hitSlop={{ top: 7, bottom: 7 }}
      style={styles.chip}
    >
      <Icon name="play" size={12} color={c.accent} />
      <T style={styles.chipText} maxFontSizeMultiplier={textCap.chip}>
        {clockText(at)}
      </T>
    </Tap>
  );
});

/** Save, as a bare bookmark at the top of the card's title row: 22pt, 44pt to touch. */
function SaveMark({ saved, label, onPress }: { saved: boolean; label: string; onPress: () => void }) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-selected={saved}
      onPress={onPress}
      feedback="dim"
      style={styles.save}
    >
      <Icon name={saved ? "bookmark" : "bookmark-outline"} size={22} color={saved ? c.accent : c.muted} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: c.surface,
    borderRadius: radius.r22,
    padding: 14,
    boxShadow: shadows.card,
  },
  // The bookmark sits at the title row's top right, its 44pt target
  // reaching into the card's padding.
  head: { flexDirection: "row", alignItems: "flex-start", gap: 2 },
  headTap: { flex: 1, minWidth: 0 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  topText: { flex: 1, minWidth: 0 },
  title: { ...type.cardTitle, color: c.text },
  meta: { ...type.meta, color: c.muted, marginTop: 3, ...tabular },
  save: {
    width: 44,
    height: 44,
    marginTop: -10,
    marginRight: -10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  // The opening mark hangs into the card's padding (Quote), so the lines
  // share the title's left edge, as the concept sets them.
  quote: { marginTop: 12, marginBottom: 12, marginHorizontal: 2 },
  noQuote: { height: 12 },
  also: { minHeight: 32, justifyContent: "center" },
  alsoText: { ...type.metaSmall, color: c.muted },
  foot: { flexDirection: "row", alignItems: "center", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: c.featureOnSurface,
  },
  chipText: { fontFamily: font.semibold, fontSize: fontSize.small, lineHeight: 17, color: c.accent, ...tabular },

  alsoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 24, paddingVertical: 10 },
  divider: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: c.divider,
  },
  alsoOpen: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  alsoTitle: { ...type.cardTitle, color: c.text, flex: 1, minWidth: 0 },
});
