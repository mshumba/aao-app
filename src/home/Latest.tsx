import { memo, useMemo } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import type { Sermon, SeriesRail } from "../data/sermons";
import { CardFan, SectionHeader } from "../kit";
import { c, font, fontSize, radius, tabular, type } from "../theme";
import { SermonRow, T, Tap } from "../ui";
import { seriesCaption } from "./copy";

/**
 * "Latest sermons": the next few after the hero's, as the app's one sermon
 * row (artwork, the event as a kicker, the headline, the date and length),
 * and "See all" for every sermon in the library, newest first.
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
        action={
          onSeeAll
            ? { label: "See all", onPress: onSeeAll, hint: "Lists every sermon, newest first" }
            : undefined
        }
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
  return <SermonRow sermon={sermon} onPress={() => onOpen(sermon.id)} />;
});

// ---- Conferences and series --------------------------------------------------------

const SERIES_W = 264;
const SERIES_H = 148;

/**
 * Conferences and teaching series, as sand cards with a fan of their posters
 * (the first in front), then the name and "3 messages · 22–23 Sep", counted
 * as series are everywhere (seriesCaption). A card opens the series in order.
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
      accessibilityHint="Opens every message in order"
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
  meta: { ...type.meta, color: c.muted, ...tabular },
  rail: { paddingHorizontal: 24, gap: 12 },
  seriesBox: {
    borderRadius: radius.r20,
    backgroundColor: c.feature,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  // Series names are the ministry's own, so they're set in the voice.
  seriesName: {
    fontFamily: font.serif,
    fontSize: fontSize.heading,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: c.text,
    marginTop: 12,
  },
});
