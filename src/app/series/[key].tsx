import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import { seriesSermons } from "../../data/sermons";
import { exitTo, firstParam } from "../../navigation";
import { space } from "../../theme";
import { sermonCount } from "../../topics";
import { Header, Page, PageTitle, SermonRow, StatePanel, T, c, s } from "../../ui";

/**
 * Every part of a series, in order: a multi-part teaching such as "Gift of
 * Prophecy", or the sessions of a gathering such as "Lioness Conference 2022".
 */
export default function SeriesScreen() {
  const params = useLocalSearchParams<{ key: string | string[] }>();
  const key = firstParam(params.key) ?? "";
  const catalogue = useCatalogue();
  const name = catalogue.seriesName(key);
  const list = seriesSermons(catalogue.sermons, key);

  if (!list.length && !catalogue.settled)
    return (
      <Page>
        <Header back />
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} accessibilityLabel="Loading series" />
        </View>
      </Page>
    );
  if (!list.length)
    return (
      <Page>
        <Header back />
        <StatePanel
          level={1}
          icon="albums-outline"
          title="This series isn’t available"
          body="The link may be out of date. Choose another sermon from the library."
          label="Browse sermons"
          action={() => exitTo("/")}
        />
      </Page>
    );

  const first = list[0].date;
  const last = list[list.length - 1].date;
  return (
    <Page>
      <Header back />
      <PageTitle title={name ?? list[0].collection} />
      <T style={[s.meta, styles.count]}>
        {sermonCount(list.length)} · {first === last ? first : `${first} to ${last}`}
      </T>
      <View style={{ gap: space.sm }}>
        {list.map((sermon) => (
          <SermonRow key={sermon.id} sermon={sermon} />
        ))}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  count: { color: c.text, marginBottom: space.md },
});
