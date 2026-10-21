import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import { getCategory } from "../../data/categories";
import { sermonsInCategory } from "../../data/sermons";
import { CoverPage } from "../../kit";
import { exitTo, firstParam } from "../../navigation";
import { space } from "../../theme";
import { TopicNotice, sermonCount } from "../../topics";
import { Header, Page, SermonRow, StatePanel } from "../../ui";

// Topics are browsed in Search (old /topics links land there); this returns
// there rather than stacking another.
function backToTopics() {
  exitTo("/topics");
}

/**
 * A topic's sermons, newest first, under a cover made from them (as a
 * series or a path is): "Topic · 12 sermons", the topic's name and what
 * it's about. The labels are samples until the ministry reviews them, and
 * the page says so once, quietly, at the end.
 */
export default function CategoryScreen() {
  const params = useLocalSearchParams<{ categoryId: string | string[] }>();
  const category = getCategory(firstParam(params.categoryId));
  const { sermons } = useCatalogue();
  if (!category)
    return (
      <Page header={<Header back />}>
        <StatePanel
          level={1}
          icon="pricetags-outline"
          title="This topic isn’t available"
          body="The link may be out of date. Choose a topic in Search to keep exploring."
          label="Browse topics"
          action={backToTopics}
        />
      </Page>
    );
  const inTopic = sermonsInCategory(sermons, category.id);
  return (
    <CoverPage
      testID="topic-page"
      title={category.label}
      kicker={`Topic · ${sermonCount(inTopic.length)}`}
      lead={category.description}
      fan={inTopic}
    >
      {inTopic.length > 0 ? (
        <>
          <View style={styles.rows}>
            {inTopic.map((sermon) => (
              <SermonRow key={sermon.id} sermon={sermon} lead={category.id} />
            ))}
          </View>
          <View style={styles.notice}>
            <TopicNotice />
          </View>
        </>
      ) : (
        <StatePanel
          icon="leaf-outline"
          title={`No sermons in ${category.label} yet`}
          body="Sermons haven’t been added to this topic yet. Other topics have sermons to explore."
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
