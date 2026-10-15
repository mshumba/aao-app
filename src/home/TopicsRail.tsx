import { memo, useMemo } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { getCategory, topicDisclaimer, type CategoryId } from "../data/categories";
import { sermonCategoryIds, type Sermon } from "../data/sermons";
import { SectionHeader } from "../kit";
import { space, textCap, type } from "../theme";
import { Icon, SermonCard, T, c } from "../ui";

/** Cards in the rail. */
const COUNT = 10;
const CARD = 200;

/**
 * "From your topics": the newest sermons in the topics the viewer picked
 * (in onboarding or Account), keeping the promise "We'll put them first".
 * Hidden until they've picked one. The topics are sample labels, and the
 * rail says so. "See all" opens the topic's page when there's one topic.
 */
export const TopicsRail = memo(function TopicsRail({
  sermons,
  topics,
  onSeeAll,
}: {
  /** The library, newest first. */
  sermons: readonly Sermon[];
  topics: readonly CategoryId[];
  onSeeAll: (topic: CategoryId) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const list = useMemo(() => {
    if (!topics.length) return [];
    const out: Sermon[] = [];
    for (const sermon of sermons) {
      if (sermonCategoryIds(sermon).some((id) => topics.includes(id))) out.push(sermon);
      if (out.length === COUNT) break;
    }
    return out;
  }, [sermons, topics]);
  if (!list.length) return null;

  const names = topics.map((id) => getCategory(id)?.label).filter(Boolean) as string[];
  const width = Math.round(CARD * Math.min(1.3, Math.max(1, fontScale)));
  const one = topics.length === 1 ? topics[0] : null;
  return (
    <View testID="from-your-topics" style={styles.section}>
      <SectionHeader
        title="From your topics"
        kicker={names.join(" · ")}
        action={
          one
            ? { label: "See all", onPress: () => onSeeAll(one), hint: `Opens ${names[0]}` }
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
      <View style={styles.note}>
        <Icon name="information-circle-outline" size={15} color={c.muted} />
        <T style={styles.noteText} maxFontSizeMultiplier={textCap.chip}>
          {topicDisclaimer}
        </T>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginTop: space.xs },
  header: { marginTop: 32, marginBottom: 12 },
  rail: { paddingHorizontal: 24, gap: 12 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 24, marginTop: 10 },
  noteText: { ...type.meta, color: c.muted, flex: 1 },
});
