import { memo, useMemo, type Ref } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { relatedSermons, sermonTopicIds, type Sermon } from "../data/sermons";
import { SectionHeader } from "../kit";
import { cardShown, useTopics, type SermonCardData, type ShownCard } from "../learning";
import { useExitTo } from "../navigation";
import { NATIVE_VIDEO } from "../player/videoPlatform";
import { c, font, space, textCap, type } from "../theme";
import { TopicTags, namedTopics } from "../topics";
import { Bullets, Icon, Notice, SermonRow, T, Tap, TextButton, nowrap } from "../ui";

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
  const exitTo = useExitTo();
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

/**
 * Its topics, when it has any that are offered (none while the topics are
 * still on their way, so the heading never stands over nothing).
 */
export const TopicsSection = memo(function TopicsSection({ sermon }: { sermon: Sermon }) {
  const { topics: offered } = useTopics();
  const topics = useMemo(() => namedTopics(offered, sermonTopicIds(sermon)), [sermon, offered]);
  if (!topics.length) return null;
  return (
    <>
      <SectionHeader title="Topics" size="md" style={styles.sectionGap} />
      <View style={{ marginTop: space.md }}>
        <TopicTags topics={topics} />
      </View>
    </>
  );
});

/**
 * What the sermon is about, from its card when it has one (nothing while it
 * loads, or when it has none or it couldn't be loaded), then, quietly, a way
 * to it on YouTube and, when it plays through YouTube, that loading the
 * player connects to Google. The menu's "About this sermon" brings it into
 * view.
 */
export const AboutSermon = memo(function AboutSermon({
  sermon,
  card,
  onYouTube,
  onLayout,
  ref,
}: {
  sermon: Sermon;
  /** Its card (useSermonCard): null shows none. */
  card: SermonCardData | null;
  onYouTube: () => void;
  /** Once it's laid out, for the menu's "About this sermon". */
  onLayout?: (e: LayoutChangeEvent) => void;
  ref?: Ref<View>;
}) {
  const shown = useMemo(() => cardShown(card), [card]);
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      style={styles.about}
      testID="about-sermon"
    >
      {shown ? <CardSection card={shown} /> : null}
      <View style={styles.from}>
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
        {/* The app's own player (a phone, its video on R2) doesn't touch Google. */}
        {NATIVE_VIDEO && sermon.videoReady ? null : (
          <Notice icon="logo-youtube">
            Plays through YouTube. Loading the player connects to Google, which may set cookies.
          </Notice>
        )}
      </View>
    </View>
  );
});

/**
 * The sermon's card: what it teaches, who it's for, its main points in the
 * order he makes them, and the scriptures. It was written automatically
 * from the transcript, and says so; it describes the sermon, so it's never
 * set as a quote or in the serif his quotes use.
 */
function CardSection({ card }: { card: ShownCard }) {
  return (
    <View testID="sermon-card">
      <T style={styles.summary} testID="sermon-summary">
        {card.summary}
      </T>
      {card.forWhom ? <T style={styles.forWhom}>{card.forWhom}</T> : null}
      <SectionHeader title="In this sermon" size="md" style={styles.pointsHeader} />
      <Bullets items={card.points} style={styles.points} />
      {card.scriptures.length ? (
        <T style={styles.scriptures} testID="sermon-scriptures">
          <Text style={styles.scripturesLabel}>Scriptures: </Text>
          {/* Each reference kept on one line. */}
          {card.scriptures.map(nowrap).join("; ")}
        </T>
      ) : null}
      <View style={styles.written}>
        <Notice icon="document-text-outline">Written automatically from the sermon’s transcript.</Notice>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionGap: { marginTop: space.xxl },
  about: { gap: space.xl, marginTop: space.xl },
  summary: { ...type.lead, color: c.text },
  forWhom: { ...type.body, color: c.muted, marginTop: space.sm },
  pointsHeader: { marginTop: space.xl },
  points: { marginTop: space.md },
  scriptures: { ...type.meta, color: c.muted, marginTop: space.lg },
  scripturesLabel: { fontFamily: font.semibold, color: c.text },
  written: { marginTop: space.md },
  from: { gap: space.sm },
  link: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, minHeight: 32 },
  linkText: { ...type.meta, fontFamily: type.label.fontFamily, color: c.accent },
});
