import { memo, useMemo } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { eventLine, headline } from "../data/display";
import type { Sermon, SeriesRail } from "../data/sermons";
import { Artwork, CardFan, SectionHeader } from "../kit";
import { c, font, radius, tabular, textCap, type } from "../theme";
import { T, Tap, nowrap, sermonLabel, spokenDuration } from "../ui";
import { seriesCaption } from "./copy";

const THUMB = 128;
/** Narrow phones (320pt) keep rows side by side with a smaller tile. */
const THUMB_NARROW = 112;

/**
 * "Latest sermons": the next few after the hero's, as rows (artwork with
 * its length, the event as a kicker, the headline and the date), and "See
 * all" for the whole library in Search.
 */
export const LatestSermons = memo(function LatestSermons({
  sermons,
  onOpen,
  onSeeAll,
}: {
  sermons: readonly Sermon[];
  onOpen: (id: string) => void;
  onSeeAll?: () => void;
}) {
  if (!sermons.length) return null;
  return (
    <View testID="latest-sermons">
      <SectionHeader
        title="Latest sermons"
        action={onSeeAll ? { label: "See all", onPress: onSeeAll, hint: "Searches every sermon" } : undefined}
        inset={24}
        style={styles.header}
      />
      <View style={styles.rows}>
        {sermons.map((sermon) => (
          <LatestRow key={sermon.id} sermon={sermon} onOpen={onOpen} />
        ))}
      </View>
    </View>
  );
});

const LatestRow = memo(function LatestRow({
  sermon,
  onOpen,
}: {
  sermon: Sermon;
  onOpen: (id: string) => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const thumb = width < 360 ? THUMB_NARROW : THUMB;
  // Beside the text while it has room; above it at very large text.
  const stacked = (Math.min(width, 760) - 48 - thumb - 16) / fontScale < 120;
  // Who, the event and which part of it, without repeating the headline.
  const kicker = eventLine(sermon);
  return (
    <Tap
      testID="sermon-row"
      accessibilityRole="button"
      accessibilityLabel={sermonLabel(sermon)}
      onPress={() => onOpen(sermon.id)}
      unstable_pressDelay={60}
      feedback="scaleLarge"
      style={[styles.row, stacked && styles.rowStacked]}
    >
      <Artwork art={sermon} width={stacked ? undefined : thumb} fallback={sermon.collection} priority="low" />
      <View style={styles.rowText}>
        {kicker ? (
          <T style={styles.kicker} numberOfLines={1} maxFontSizeMultiplier={textCap.section}>
            {kicker}
          </T>
        ) : null}
        <T style={styles.title} numberOfLines={stacked ? undefined : 2}>
          {headline(sermon)}
        </T>
        <T
          style={styles.meta}
          accessibilityLabel={sermon.duration ? `${sermon.date}, ${spokenDuration(sermon.duration)}` : sermon.date}
        >
          {sermon.duration ? `${nowrap(sermon.date)} · ${nowrap(sermon.duration)}` : nowrap(sermon.date)}
        </T>
      </View>
    </Tap>
  );
});

// ---- Conferences and series --------------------------------------------------------

const SERIES_W = 264;
const SERIES_H = 148;

/**
 * Conferences and series with three or more sessions, as sand cards with a
 * fan of their posters (the first session in front), then the name and how
 * many sessions over which days. A card opens the series in order.
 */
export const SeriesRow = memo(function SeriesRow({
  rails,
  onOpen,
}: {
  rails: readonly SeriesRail[];
  onOpen: (key: string) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const width = Math.round(SERIES_W * Math.min(1.3, Math.max(1, fontScale)));
  if (!rails.length) return null;
  return (
    <View testID="series-rail">
      <SectionHeader title="Conferences and series" inset={24} style={styles.header} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={width + 12}
        snapToAlignment="start"
        contentContainerStyle={styles.rail}
      >
        {rails.map((rail) => (
          <SeriesTile key={rail.key} rail={rail} width={width} onOpen={onOpen} />
        ))}
      </ScrollView>
    </View>
  );
});

const SeriesTile = memo(function SeriesTile({
  rail,
  width,
  onOpen,
}: {
  rail: SeriesRail;
  width: number;
  onOpen: (key: string) => void;
}) {
  const caption = useMemo(() => seriesCaption(rail.sermons), [rail.sermons]);
  const fan = useMemo(() => rail.sermons.slice(0, 3), [rail.sermons]);
  const scale = (0.66 * width) / SERIES_W;
  return (
    <Tap
      testID="series-tile"
      accessibilityRole="button"
      accessibilityLabel={`${rail.name}. ${caption.replace(" · ", ", ")}.`}
      accessibilityHint="Opens every session in order"
      onPress={() => onOpen(rail.key)}
      unstable_pressDelay={60}
      feedback="scaleLarge"
      style={{ width }}
    >
      <View style={[styles.seriesBox, { height: Math.round((SERIES_H * width) / SERIES_W) }]}>
        <CardFan sermons={fan} size="cover" scale={scale} />
      </View>
      <T style={styles.seriesName} numberOfLines={2}>
        {rail.name}
      </T>
      <T style={styles.meta}>{caption}</T>
    </Tap>
  );
});

const styles = StyleSheet.create({
  header: { marginTop: 32, marginBottom: 12 },
  rows: { paddingHorizontal: 24, gap: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 72 },
  rowStacked: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  kicker: { ...type.overline, color: c.gold },
  title: { ...type.cardTitle, color: c.text },
  meta: { ...type.meta, color: c.muted, ...tabular },
  rail: { paddingHorizontal: 24, gap: 12 },
  seriesBox: {
    borderRadius: radius.r20,
    backgroundColor: c.feature,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  seriesName: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, color: c.text, marginTop: 12 },
});
