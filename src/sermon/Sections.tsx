import { memo, useMemo, type Ref } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { relatedSermons, sermonTopicIds, type Sermon } from "../data/sermons";
import { SectionHeader } from "../kit";
import { cardText, useTopics, type CardText, type SermonCard } from "../learning";
import { exitTo } from "../navigation";
import { NATIVE_VIDEO } from "../player/videoPlatform";
import { c, fontSize, radius, space, textCap, type } from "../theme";
import { TopicNotice, TopicTags, namedTopics } from "../topics";
import { Heading, Icon, Notice, SermonRow, T, Tap, TextButton, web } from "../ui";

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
      <View style={{ gap: space.md, marginTop: space.md }}>
        <TopicNotice />
        <TopicTags topics={topics} />
      </View>
    </>
  );
});

/**
 * What the sermon is about, from its card (when it has one): a summary,
 * who it's for, its main points and the passages it rests on, then where
 * it's from, quietly: the exact title as published (kept in the details,
 * the 14 October decision), a way to it on YouTube, and how it plays. The
 * menu's "About this sermon" brings it into view.
 */
export const AboutSermon = memo(function AboutSermon({
  sermon,
  card,
  onYouTube,
  onLayout,
  ref,
}: {
  sermon: Sermon;
  /** Its card; null shows only where it's from. */
  card: SermonCard | null;
  onYouTube: () => void;
  /** Once it's laid out, for the menu's "About this sermon". */
  onLayout?: (e: LayoutChangeEvent) => void;
  ref?: Ref<View>;
}) {
  const text = useMemo(() => (card ? cardText(card) : null), [card]);
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      style={styles.about}
      testID="about-sermon"
    >
      {text ? <CardSection text={text} /> : null}
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
      {NATIVE_VIDEO && sermon.videoReady ? (
        <Notice icon="play-circle-outline">Plays in AAO’s own player, and carries on when you leave the app.</Notice>
      ) : (
        <Notice icon="logo-youtube">
          Plays through YouTube. Loading the player connects to Google, which may set cookies.
        </Notice>
      )}
    </View>
  );
});

/**
 * The card, under its own heading. The summary is Claude's description of
 * the sermon, said so under the heading, and never set in quotation marks:
 * none of it is the Apostle's own words.
 */
function CardSection({ text }: { text: CardText }) {
  return (
    <View style={styles.card} testID="sermon-card">
      <SectionHeader title="About this sermon" size="md" />
      <T style={styles.provenance}>Summarised automatically from the sermon’s transcript.</T>
      <T style={styles.summary}>{text.summary}</T>
      {text.forLine ? <T style={styles.forLine}>{text.forLine}</T> : null}
      <Heading level={3} style={styles.subheading} maxFontSizeMultiplier={textCap.section}>
        In this sermon
      </Heading>
      <View style={styles.points} role="list">
        {text.points.map((point, i) => (
          <View key={i} style={styles.point} role="listitem">
            {/* Text, so the bullet scales and aligns with the line it marks. */}
            <T
              style={styles.bullet}
              accessibilityElementsHidden
              importantForAccessibility="no"
              {...web({ "aria-hidden": true })}
            >
              •
            </T>
            <T style={styles.pointText}>{point}</T>
          </View>
        ))}
      </View>
      {text.scriptures.length ? (
        <>
          <Heading level={3} style={styles.subheading} maxFontSizeMultiplier={textCap.section}>
            Key scriptures
          </Heading>
          {/* Quiet tags, not pills: there's nothing to press. */}
          <View style={styles.scriptures} role="list">
            {text.scriptures.map((reference) => (
              <View key={reference} style={styles.scripture} role="listitem">
                <T style={styles.scriptureText} maxFontSizeMultiplier={textCap.chip}>
                  {reference}
                </T>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionGap: { marginTop: space.xxl },
  about: { gap: space.sm, marginTop: space.xl },
  // With the column's gap, 24 between the card and where the sermon is from.
  card: { marginBottom: space.lg },
  provenance: { ...type.meta, color: c.muted, marginTop: space.xs },
  summary: { ...type.body, color: c.text, marginTop: space.md },
  forLine: { ...type.body, color: c.muted, marginTop: space.sm },
  subheading: { ...type.sectionSmall, fontSize: fontSize.heading, lineHeight: 24, color: c.text, marginTop: space.xl },
  points: { gap: space.sm, marginTop: space.sm },
  point: { flexDirection: "row", gap: space.sm },
  bullet: { ...type.body, color: c.gold },
  pointText: { ...type.body, color: c.text, flex: 1 },
  scriptures: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  scripture: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    maxWidth: "100%",
  },
  scriptureText: { ...type.meta, color: c.text },
  source: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.sm },
  sourceText: { ...type.meta, color: c.muted, maxWidth: "100%" },
  link: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  linkText: { ...type.meta, fontFamily: type.label.fontFamily, color: c.accent },
});
