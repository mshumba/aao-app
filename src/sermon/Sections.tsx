import { memo, useMemo } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { relatedSermons, sermonCategoryIds, type Sermon } from "../data/sermons";
import { Kicker, SectionHeader } from "../kit";
import { exitTo } from "../navigation";
import { c, space, type } from "../theme";
import { TopicNotice, TopicTags } from "../topics";
import { Notice, SermonRow, SermonTitle, TextButton } from "../ui";

/*
 * The panel's sections below the fold. Each draws only when its own inputs
 * change, not each time the page around it does (the player, moments
 * arriving, the bar's title).
 */

/**
 * "More sermons": the rest of its series first, then sermons sharing a
 * topic, then the newest. On a path day that's also part of a series,
 * "Whole series" opens the series.
 */
export const MoreSermons = memo(function MoreSermons({
  sermon,
  sermons,
  seriesName,
  onSeries,
}: {
  sermon: Sermon;
  /** The whole library, newest first. */
  sermons: Sermon[];
  /** Offers "Whole series" when set. */
  seriesName: string | null;
  onSeries: () => void;
}) {
  // A pass over the whole library, so only when the sermon or library changes.
  const more = useMemo(() => relatedSermons(sermon, sermons), [sermon, sermons]);
  return (
    <>
      <SectionHeader
        title="More sermons"
        size="md"
        action={
          seriesName
            ? { label: "Whole series", hint: `Opens every part of ${seriesName}`, onPress: onSeries }
            : undefined
        }
        style={styles.sectionGap}
      />
      <View style={{ gap: space.sm, marginTop: space.md }}>
        {more.map((item) => (
          <SermonRow key={item.id} sermon={item} />
        ))}
      </View>
      <View style={{ marginTop: space.sm }}>
        <TextButton label="Browse all sermons" icon="chevron-forward" onPress={() => exitTo("/")} />
      </View>
    </>
  );
});

/** Its sample topics, when it has any. */
export const TopicsSection = memo(function TopicsSection({ sermon }: { sermon: Sermon }) {
  const topics = useMemo(() => sermonCategoryIds(sermon), [sermon]);
  if (!topics.length) return null;
  return (
    <>
      <SectionHeader title="Topics" size="md" style={styles.sectionGap} />
      <View style={{ gap: space.md, marginTop: space.md }}>
        <TopicNotice />
        <TopicTags ids={topics} />
      </View>
    </>
  );
});

/** The exact title as published, kept with its source. */
export const AboutSermon = memo(function AboutSermon({
  sermon,
  onYouTube,
  onLayout,
}: {
  sermon: Sermon;
  onYouTube: () => void;
  /** Where the section sits, for the menu's "About this sermon". */
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  return (
    <View onLayout={onLayout}>
      <SectionHeader title="About this sermon" size="md" style={styles.sectionGap} />
      <View style={styles.source}>
        <Kicker tone="muted">On YouTube</Kicker>
        <SermonTitle title={sermon.title} style={styles.sourceTitle} />
        <TextButton label="Open in YouTube" icon="open-outline" align="start" onPress={onYouTube} />
        <Notice icon="logo-youtube">
          Plays through YouTube. Loading the player connects to Google, which may set cookies.
        </Notice>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  sectionGap: { marginTop: space.xxl, marginHorizontal: 4 },
  source: { gap: space.sm, marginTop: space.md, marginHorizontal: 4 },
  sourceTitle: { ...type.caption, color: c.text },
});
