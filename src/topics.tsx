import { StyleSheet, View } from "react-native";
import { useTopics } from "./learning";
import { useGo } from "./navigation";
import { radius, type } from "./theme";
import { Icon, IconName, Notice, T, Tap, c } from "./ui";

/**
 * Each topic's icon, by its id: the one thing about a topic the app itself
 * holds (the topics are public.topics). A topic added since this build
 * shows a leaf.
 */
const ICONS: Record<string, IconName> = {
  "hearing-god": "ear-outline",
  prayer: "chatbubble-ellipses-outline",
  "purpose-calling": "compass-outline",
  "faith-hope": "sunny-outline",
  "grace-holiness": "sparkles-outline",
  "holy-spirit": "flame-outline",
  "everyday-life": "footsteps-outline",
  "comfort-healing": "heart-outline",
};

export function topicIcon(id: string): IconName {
  return ICONS[id] ?? "leaf-outline";
}

/** A topic's page: its sermons, the best match first. */
export function topicHref(topicId: string) {
  return { pathname: "/topics/[topicId]", params: { topicId } } as const;
}

/** Whole-string plurals: "1 sermon", "2,820 sermons", "No sermons yet". */
export function sermonCount(count: number, empty = "No sermons yet") {
  if (count === 0) return empty;
  return count === 1
    ? "1 sermon"
    : `${String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} sermons`;
}

/** How a sermon comes to be in a topic, said once where its topics show. */
export function TopicNotice() {
  return <Notice>Topics are matched automatically from each sermon’s transcript.</Notice>;
}

/** Links to a sermon's topics (its one topic, today), on its page. */
export function TopicTags({ ids }: { ids: readonly string[] }) {
  const go = useGo();
  const { topics } = useTopics();
  return (
    <View style={styles.tags}>
      {ids.map((id) => {
        const topic = topics.find((t) => t.id === id);
        if (!topic) return null;
        return (
          <Tap
            key={id}
            accessibilityRole="link"
            accessibilityLabel={`${topic.label} topic`}
            onPress={() => go.push(topicHref(id))}
            style={styles.tag}
          >
            <Icon name={topicIcon(id)} size={16} color={c.accent} />
            <T style={styles.tagLabel}>{topic.label}</T>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  // Sand pills, as chips are drawn everywhere (on ivory and white alike).
  tag: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: c.feature,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
  },
  tagLabel: { ...type.chip, color: c.text, flexShrink: 1 },
});
