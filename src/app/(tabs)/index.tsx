import { router, useNavigation } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import { eventLine, headline } from "../../data/display";
import { Sermon, sermonCategoryIds, sermons } from "../../data/sermons";
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
  fieldBorder,
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

/** "Good evening, Ada", from the first word of the name on the account. */
function greeting(name: string) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Good ${part}, ${name.trim().split(/\s+/)[0]}`;
}

export default function Browse() {
  const go = useGo();
  const tabs = useNavigation<TabsNavigation>();
  const narrow = useNarrow();
  const account = useAccount();
  const [featured, ...rest] = sermons;
  // The viewer's topics a sermon covers, its primary topic first.
  const matches = (sermon: Sermon) =>
    sermonCategoryIds(sermon).filter((id) => account.interests.includes(id));
  // Sermons on the viewer's topics, most topics in common first, then the
  // rest of the catalogue below without repeats.
  const forYou = rest
    .map((sermon, index) => ({ sermon, index, shared: matches(sermon).length }))
    .filter((item) => item.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.index - b.index)
    .slice(0, 3)
    .map((item) => item.sermon);
  const latest = rest.filter((sermon) => !forYou.includes(sermon));
  const name = account.user && account.displayName?.trim();
  return (
    <Page>
      <Header />
      {name ? <T style={styles.greeting}>{greeting(name)}</T> : null}
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
        <View style={styles.featureClip}>
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
              <Icon name="play" color={c.onAccent} size={18} />
              <T style={styles.ctaText}>Watch sermon</T>
            </View>
          </View>
        </View>
      </Tap>

      {forYou.length > 0 && (
        <>
          <SectionHeading aside="From your topics">For you</SectionHeading>
          <View style={{ gap: space.sm }}>
            {forYou.map((sermon) => (
              <SermonRow
                key={sermon.id}
                sermon={sermon}
                // Its kicker leads with the topic that matched.
                lead={matches(sermon)[0]}
              />
            ))}
          </View>
        </>
      )}

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

      {latest.length > 0 && (
        <>
          <SectionHeading>Latest sermons</SectionHeading>
          <View style={{ gap: space.sm }}>
            {latest.map((sermon) => (
              <SermonRow key={sermon.id} sermon={sermon} />
            ))}
          </View>
        </>
      )}

      <View style={styles.footer}>
        <T style={s.meta}>
          This preview has {sermonCount(sermons.length).toLowerCase()}, not the
          full archive.
        </T>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  // A quiet line in the serif, below the wordmark; the page's heading
  // stays the wordmark.
  greeting: {
    fontFamily: font.serif,
    fontSize: 20,
    lineHeight: 26,
    color: c.text,
    marginBottom: space.md,
  },
  // Same size, radius, edge and icon position as the real field on Search.
  search: {
    minHeight: 54,
    paddingHorizontal: 15,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: fieldBorder,
    backgroundColor: c.surface,
    flexDirection: "row",
    gap: space.sm,
    alignItems: "center",
    marginBottom: space.lg,
  },
  searchText: { ...type.lead, color: c.muted },
  // The one lifted card on Home: white with a hairline and a soft shadow.
  // White rather than sand so the gold eyebrow keeps 5.3:1. The shadow sits
  // on the outer view and the clipping on the inner one, so rounding the
  // artwork never clips the shadow.
  feature: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    boxShadow: "0 8px 24px rgba(27,30,36,0.08)",
  },
  featureClip: { borderRadius: radius.xl - 1, overflow: "hidden" },
  featureArt: { borderWidth: 0 },
  featureBody: { padding: 20, gap: space.md },
  featureTitle: {
    fontFamily: font.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  featureTitleNarrow: { fontSize: 22, lineHeight: 28 },
  featureMeta: { ...type.caption, fontSize: 14, color: c.muted },
  // Gold is kept for editorial labels like this one.
  eyebrow: { ...type.kicker, color: c.gold },
  cta: {
    marginTop: space.xs,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: c.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaText: { color: c.onAccent, fontFamily: font.bold, fontSize: 16 },
  footer: { marginTop: space.xxl },
});
