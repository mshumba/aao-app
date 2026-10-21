import { memo, useMemo } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useWatchProgress } from "../auth/AccountProvider";
import { fromTopics, type Sermon } from "../data/sermons";
import { SectionHeader } from "../kit";
import type { Topic } from "../learning";
import { space } from "../theme";
import { SermonCard } from "../ui";
import { watched } from "../watched";

/** Cards in the rail. */
const COUNT = 10;
const CARD = 200;

/**
 * "From your topics": the sermons that best match the topics the viewer
 * picked (in onboarding or Account), keeping the promise "We'll put them
 * first". Each topic's closest matches lead, the topics taking turns, with
 * nothing over three hours and nothing they've finished. Hidden until
 * they've picked one. "See all" opens the topic's page when there's one.
 */
export const TopicsRail = memo(function TopicsRail({
  sermons,
  topics,
  onSeeAll,
}: {
  /** The library, newest first. */
  sermons: readonly Sermon[];
  topics: readonly Topic[];
  onSeeAll: (topicId: string) => void;
}) {
  const { fontScale } = useWindowDimensions();
  // Empty for guests. A save while a sermon plays changes this rail only
  // once that sermon is finished.
  const { progress } = useWatchProgress();
  const finished = useMemo(
    () =>
      progress
        .filter(watched)
        .map((p) => p.sermonId)
        .join(" "),
    [progress],
  );
  const list = useMemo(() => {
    const done = new Set(finished.split(" "));
    return fromTopics(
      sermons,
      topics.map((topic) => topic.id),
      (id) => done.has(id),
      COUNT,
    );
  }, [sermons, topics, finished]);
  if (!list.length) return null;

  const width = Math.round(CARD * Math.min(1.3, Math.max(1, fontScale)));
  const one = topics.length === 1 ? topics[0] : null;
  return (
    <View testID="from-your-topics" style={styles.section}>
      <SectionHeader
        title="From your topics"
        // Their names while they fit on a line; the title says it past three.
        kicker={topics.length <= 3 ? topics.map((topic) => topic.label).join(" · ") : undefined}
        action={
          one
            ? { label: "See all", onPress: () => onSeeAll(one.id), hint: `Opens ${one.label}` }
            : undefined
        }
        inset={24}
        style={styles.header}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={width + 12}
        snapToAlignment="start"
        contentContainerStyle={styles.rail}
      >
        {list.map((sermon) => (
          <SermonCard key={sermon.id} sermon={sermon} width={width} testID="topic-card" />
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginTop: space.xs },
  header: { marginTop: 32, marginBottom: 12 },
  rail: { paddingHorizontal: 24, gap: 12 },
});
