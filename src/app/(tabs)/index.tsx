import { router, useNavigation } from "expo-router";
import { StyleSheet, View } from "react-native";
import { eventLine, headline } from "../../data/display";
import { sermons } from "../../data/sermons";
import { requestSearchFocus, useGo } from "../../navigation";
import { font, radius, space, type } from "../../theme";
import { TopicGrid, TopicNotice, sermonCount } from "../../topics";
import {
  Header,
  Icon,
  Page,
  SectionHeading,
  SermonRow,
  SermonTitle,
  T,
  Tap,
  Thumbnail,
  c,
  nowrap,
  s,
  sermonLabel,
  useNarrow,
} from "../../ui";

// Switching to Search keeps whatever it already holds (a typed query, a
// topic filter from a link), as the tab bar does.
type TabsNavigation = {
  navigate: (name: "search", params: undefined, options: { merge: boolean }) => void;
};

export default function Browse() {
  const go = useGo();
  const tabs = useNavigation<TabsNavigation>();
  const narrow = useNarrow();
  const [featured, ...latest] = sermons;
  return (
    <Page>
      <Header />
      <Tap
        accessibilityRole="button"
        accessibilityLabel="Search sermons"
        onPress={() =>
          go.run(() => {
            requestSearchFocus();
            tabs.navigate("search", undefined, { merge: true });
          })
        }
        feedback="scaleLarge"
        style={styles.search}
      >
        <Icon name="search-outline" color={c.muted} size={20} />
        <T style={styles.searchText}>Search sermons</T>
      </Tap>

      <Tap
        accessibilityRole="button"
        accessibilityLabel={`Watch sermon: ${sermonLabel(featured)}`}
        onPress={() =>
          go.push({ pathname: "/sermon/[id]", params: { id: featured.id } })
        }
        unstable_pressDelay={60}
        feedback="scaleLarge"
        style={styles.feature}
      >
        <Thumbnail sermon={featured} style={styles.featureArt} />
        <View style={[styles.featureBody, narrow && { padding: space.lg }]}>
          <T style={styles.eyebrow}>Featured</T>
          <SermonTitle
            title={headline(featured)}
            style={[styles.featureTitle, narrow && styles.featureTitleNarrow]}
          />
          <View>
            <T style={styles.featureMeta}>{eventLine(featured)}</T>
            <T style={styles.featureMeta}>
              {nowrap(featured.date)} · {nowrap(featured.duration)}
            </T>
          </View>
          <View style={styles.cta}>
            <Icon name="play" color={c.ink} size={18} />
            <T style={styles.ctaText}>Watch sermon</T>
          </View>
        </View>
      </Tap>

      <SectionHeading
        action={{
          label: "See all",
          hint: "Opens the topic library",
          onPress: () => go.run(() => router.navigate("/topics")),
        }}
      >
        Topics
      </SectionHeading>
      <TopicGrid />
      <View style={{ marginTop: space.md }}>
        <TopicNotice />
      </View>

      <SectionHeading>Latest sermons</SectionHeading>
      <View style={{ gap: space.sm }}>
        {latest.map((sermon) => (
          <SermonRow key={sermon.id} sermon={sermon} />
        ))}
      </View>

      <View style={styles.footer}>
        <T style={s.meta}>
          This preview has {sermonCount(sermons.length).toLowerCase()}, not the
          full archive. You can watch without an account.
        </T>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  // Same size, radius and icon position as the real field on Search.
  search: {
    minHeight: 54,
    paddingHorizontal: 15,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    flexDirection: "row",
    gap: space.sm,
    alignItems: "center",
    marginBottom: space.lg,
  },
  searchText: { ...type.lead, color: c.muted },
  feature: {
    backgroundColor: c.feature,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  featureArt: { borderWidth: 0 },
  featureBody: { padding: 20, gap: space.md },
  featureTitle: {
    fontFamily: font.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  featureTitleNarrow: { fontSize: 22, lineHeight: 28 },
  featureMeta: { ...type.caption, fontSize: 14, color: c.mutedOnFeature },
  eyebrow: { ...type.kicker, color: c.mutedOnFeature },
  cta: {
    marginTop: space.xs,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: c.mint,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaText: { color: c.ink, fontFamily: font.bold, fontSize: 16 },
  footer: { marginTop: space.xxl },
});
