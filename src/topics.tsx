import { StyleSheet, View } from "react-native";
import type { Topic } from "./learning/types";
import { useGo } from "./navigation";
import { radius, type } from "./theme";
import { Icon, IconName, Notice, T, Tap, c } from "./ui";

/**
 * Each topic's icon, by its id: the one thing about a topic the app itself
 * holds (the topics are public.topics, however many there are). A topic
 * added since this build shows a leaf.
 */
const ICONS: Record<string, IconName> = {
  "hearing-god": "ear-outline",
  prayer: "chatbubble-ellipses-outline",
  "purpose-calling": "compass-outline",
  "faith-hope": "sunny-outline",
  "grace-holiness": "sparkles-outline",
  "holy-spirit": "flame-outline",
  "everyday-life": "footsteps-outline",
  // Comfort & Healing is becoming Healing, with Deliverance beside it; the
  // old id goes once public.topics has the new ones.
  "comfort-healing": "heart-outline",
  healing: "heart-outline",
  deliverance: "lock-open-outline",
};

export function topicIcon(id: string): IconName {
  return ICONS[id] ?? "leaf-outline";
}

/**
 * Topic ids that have been replaced, each with the topic now holding what
 * it covered: the four sample topics' ids before the real topics (Prayer
 * kept its id), and Comfort & Healing, which becomes Healing. Saved picks,
 * links and old builds can still carry them. An id maps only when its
 * replacement is a topic, so this is safe before the rename lands.
 * supabase/migrations/20261021000200_topics_interests.sql moves accounts'
 * saved picks the same way.
 */
const RENAMED: ReadonlyMap<string, string> = new Map([
  ["spiritual-growth", "hearing-god"],
  ["faith", "faith-hope"],
  ["christian-living", "everyday-life"],
  ["comfort-healing", "healing"],
]);

/**
 * The topic an id names: that topic, or, for an id that's no longer a
 * topic, the one that replaced it (when it's offered).
 */
export function findTopic(topics: readonly Topic[], id?: string | null): Topic | undefined {
  if (!id) return undefined;
  const named = topics.find((topic) => topic.id === id);
  if (named) return named;
  const now = RENAMED.get(id);
  return now ? topics.find((topic) => topic.id === now) : undefined;
}

/**
 * The topics a list of ids names (a viewer's picks, say), each once and in
 * the topics' own order. Replaced ids count as the topics that replaced
 * them; any other id that isn't a topic is left out.
 */
export function namedTopics(topics: readonly Topic[], ids: readonly string[]): Topic[] {
  const wanted = new Set(ids.map((id) => findTopic(topics, id)?.id));
  return topics.filter((topic) => wanted.has(topic.id)).sort((a, b) => a.sort - b.sort);
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
export function TopicTags({ topics }: { topics: readonly Topic[] }) {
  const go = useGo();
  return (
    <View style={styles.tags}>
      {topics.map((topic) => (
        <Tap
          key={topic.id}
          accessibilityRole="link"
          accessibilityLabel={`${topic.label} topic`}
          onPress={() => go.push(topicHref(topic.id))}
          style={styles.tag}
        >
          <Icon name={topicIcon(topic.id)} size={16} color={c.accent} />
          <T style={styles.tagLabel}>{topic.label}</T>
        </Tap>
      ))}
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
