import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import { seriesSermons } from "../../data/sermons";
import { seriesDays } from "../../home/copy";
import { CoverPage } from "../../kit";
import { messagesLabel } from "../../learning/format";
import { exitTo, firstParam } from "../../navigation";
import { space } from "../../theme";
import { Header, Page, SermonRow, StatePanel, c } from "../../ui";

/**
 * Every part of a series, in order: a multi-part teaching such as "Gift of
 * Prophecy", or the sessions of a gathering such as "Lioness Conference
 * 2022". Built like a path's page: a dark cover with a fan of its own
 * sermons, "Series · 3 messages", the name, the days it spans; then the
 * messages in order on ivory.
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

  const days = seriesDays(list);
  return (
    <CoverPage
      testID="series-page"
      title={name ?? list[0].collection}
      kicker={`Series · ${messagesLabel(list.length)}`}
      lead={days || null}
      fan={list}
    >
      <View style={styles.rows}>
        {list.map((sermon) => (
          <SermonRow key={sermon.id} sermon={sermon} />
        ))}
      </View>
    </CoverPage>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  rows: { gap: space.lg },
});
