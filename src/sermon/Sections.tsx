import { memo, useMemo, type Ref } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { relatedSermons, sermonCategoryIds, type Sermon } from "../data/sermons";
import { SectionHeader } from "../kit";
import { exitTo } from "../navigation";
import { c, space, textCap, type } from "../theme";
import { TopicNotice, TopicTags } from "../topics";
import { Icon, Notice, SermonRow, T, Tap, TextButton } from "../ui";

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

/**
 * Where it's from, quietly: the exact title as published (kept in the
 * details, the 14 October decision), a way to it on YouTube, and what
 * playing it through YouTube means. The title is all there is to say about
 * a sermon yet, so it's a line, not a section under its own heading; the
 * menu's "About this sermon" brings it into view.
 */
export const AboutSermon = memo(function AboutSermon({
  sermon,
  onYouTube,
  onLayout,
  ref,
  first = false,
}: {
  sermon: Sermon;
  onYouTube: () => void;
  /** First on the panel (no path, series or moments above it). */
  first?: boolean;
  /** Once it's laid out, for the menu's "About this sermon". */
  onLayout?: (e: LayoutChangeEvent) => void;
  ref?: Ref<View>;
}) {
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      style={first ? styles.aboutFirst : styles.about}
      testID="about-sermon"
    >
      {/* The link follows the title, or takes the next line when it doesn't fit. */}
      <View style={styles.source}>
        <T style={styles.sourceText}>
          {"On YouTube as “"}
          {/* Its own span, in the line's style: the title exactly as published. */}
          <Text>{sermon.title}</Text>
          {"”"}
        </T>
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Open in YouTube"
          onPress={onYouTube}
          feedback="dim"
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={styles.link}
        >
          <T style={styles.linkText} maxFontSizeMultiplier={textCap.chip}>
            Open in YouTube
          </T>
          <Icon name="open-outline" size={14} color={c.accent} />
        </Tap>
      </View>
      <Notice icon="logo-youtube">
        Plays through YouTube. Loading the player connects to Google, which may set cookies.
      </Notice>
    </View>
  );
});

const styles = StyleSheet.create({
  sectionGap: { marginTop: space.xxl, marginHorizontal: 4 },
  about: { gap: space.sm, marginTop: space.xl, marginHorizontal: 4 },
  aboutFirst: { gap: space.sm, marginHorizontal: 4 },
  source: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.sm },
  sourceText: { ...type.meta, color: c.muted, maxWidth: "100%" },
  link: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  linkText: { ...type.meta, fontFamily: type.label.fontFamily, color: c.accent },
});
