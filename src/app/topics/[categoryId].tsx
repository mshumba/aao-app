import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { getCategory } from "../../data/categories";
import { sermonsInCategory } from "../../data/sermons";
import { exitTo, firstParam } from "../../navigation";
import { radius, space } from "../../theme";
import { TopicNotice, sermonCount } from "../../topics";
import {
  Header,
  Icon,
  Page,
  PageTitle,
  SermonRow,
  StatePanel,
  T,
  c,
  s,
} from "../../ui";

// The topic library is a tab; this returns to it rather than stacking another.
function backToLibrary() {
  exitTo("/topics");
}

export default function CategoryScreen() {
  const params = useLocalSearchParams<{ categoryId: string | string[] }>();
  const category = getCategory(firstParam(params.categoryId));
  if (!category)
    return (
      <Page>
        <Header back />
        <StatePanel
          level={1}
          icon="pricetags-outline"
          title="This topic isn’t available"
          body="The link may be out of date. Choose a topic from the library to keep exploring."
          label="Browse topics"
          action={backToLibrary}
        />
      </Page>
    );
  const inTopic = sermonsInCategory(category.id);
  return (
    <Page>
      <Header back />
      <PageTitle title={category.label} lead={category.description}>
        <View style={styles.icon}>
          <Icon name={category.icon} color={c.accent} size={26} />
        </View>
      </PageTitle>
      {inTopic.length > 0 ? (
        <>
          <View style={styles.listHeader}>
            <T style={[s.meta, { color: c.text }]}>
              {sermonCount(inTopic.length)}
            </T>
            <TopicNotice />
          </View>
          <View style={{ gap: space.sm }}>
            {inTopic.map((sermon) => (
              <SermonRow key={sermon.id} sermon={sermon} lead={category.id} />
            ))}
          </View>
        </>
      ) : (
        <StatePanel
          icon="leaf-outline"
          title={`No sermons in ${category.label} yet`}
          body="Sermons haven’t been added to this topic in the preview. Other topics have sermons to explore."
          label="Browse other topics"
          action={backToLibrary}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
  },
  listHeader: { marginTop: space.lg, marginBottom: space.sm, gap: space.sm },
});
