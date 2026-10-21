import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import { sermonsInTopic } from "../../data/sermons";
import { CoverPage } from "../../kit";
import { useStatusBar } from "../../kit/statusBar";
import { useTopics } from "../../learning";
import { exitTo, firstParam } from "../../navigation";
import { MoreButton } from "../../search/parts";
import { space } from "../../theme";
import { TopicNotice, findTopic, sermonCount } from "../../topics";
import { Header, Page, SermonRow, StatePanel } from "../../ui";

/** Sermons listed at first, and how many more each "Show more" adds. */
const PAGE = 20;

// Topics are browsed in Search (old /topics links land there); this returns
// there rather than stacking another.
function backToTopics() {
  exitTo("/topics");
}

/**
 * A topic's sermons, the best match first, a page at a time, under a cover
 * made from them (as a series or a path is): "Topic · 412 sermons", the
 * topic's name and its line. How sermons come to be here is said once,
 * quietly, at the end. An old topic's id (a sample topic's, say) opens the
 * topic that replaced it.
 */
export default function TopicScreen() {
  const params = useLocalSearchParams<{ topicId: string | string[] }>();
  const { topics, loading } = useTopics();
  const topic = findTopic(topics, firstParam(params.topicId));
  const { sermons, all, tagsReady, tagsFailed, retry } = useCatalogue();
  const inTopic = useMemo(() => (topic ? sermonsInTopic(sermons, topic.id) : []), [sermons, topic]);
  // The phones list only sermons whose video is on R2: a topic whose
  // sermons aren't there yet has them on the way.
  const coming = useMemo(
    () => !!topic && !inTopic.length && all.some((sermon) => sermon.topic?.id === topic.id),
    [topic, inTopic, all],
  );
  const [shown, setShown] = useState(PAGE);
  // The ivory page's own while there's no topic; then its cover's (CoverNav).
  useStatusBar(topic ? null : "dark");
  if (!topic)
    return (
      <Page header={<Header back />}>
        {/* A first visit's topics are still on their way. */}
        {loading ? null : (
          <StatePanel
            level={1}
            icon="pricetags-outline"
            title="This topic isn’t available"
            body="The link may be out of date. Choose a topic in Search to keep exploring."
            label="Browse topics"
            action={backToTopics}
          />
        )}
      </Page>
    );
  const more = inTopic.length - shown;
  // Counted once sermons' topics are known, and not while they're on the way.
  const counted = tagsReady && !coming;
  return (
    <CoverPage
      testID="topic-page"
      title={topic.label}
      kicker={counted ? `Topic · ${sermonCount(inTopic.length)}` : "Topic"}
      lead={topic.description}
      fan={inTopic}
    >
      {inTopic.length > 0 ? (
        <>
          <View style={styles.rows}>
            {inTopic.slice(0, shown).map((sermon) => (
              <SermonRow key={sermon.id} sermon={sermon} />
            ))}
          </View>
          {more > 0 ? (
            <MoreButton
              label={more <= PAGE ? `Show all ${sermonCount(inTopic.length)}` : `Show ${PAGE} more`}
              onPress={() => setShown((n) => n + PAGE)}
            />
          ) : null}
          <View style={styles.notice}>
            <TopicNotice />
          </View>
        </>
      ) : coming ? (
        <StatePanel
          icon="time-outline"
          title={`Sermons in ${topic.label} are on their way`}
          body="They’ll appear here as they’re added to the app. Other topics have sermons to explore."
          label="Browse other topics"
          action={backToTopics}
        />
      ) : !tagsReady ? (
        // Which sermons are in which topic hasn't loaded yet: nothing to
        // say until it has, unless it couldn't.
        tagsFailed ? (
          <StatePanel
            icon="cloud-offline-outline"
            title="Couldn’t load this topic’s sermons"
            body="Check your connection and try again."
            label="Try again"
            action={retry}
          />
        ) : null
      ) : (
        <StatePanel
          icon="leaf-outline"
          title={`No sermons in ${topic.label} yet`}
          body="Sermons haven’t been matched to this topic yet. Other topics have sermons to explore."
          label="Browse other topics"
          action={backToTopics}
        />
      )}
    </CoverPage>
  );
}

const styles = StyleSheet.create({
  rows: { gap: space.lg },
  notice: { marginTop: space.xl },
});
