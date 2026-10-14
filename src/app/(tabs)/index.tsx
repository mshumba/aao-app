import { router, useNavigation } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useAccount } from "../../auth/AccountProvider";
import { catalogueMode, useCatalogue } from "../../catalogue/CatalogueProvider";
import { ContinueWatching } from "../../continueWatching";
import { eventLine, headline } from "../../data/display";
import {
  Sermon,
  type SeriesRail,
  sermonCategoryIds,
  seriesRails,
} from "../../data/sermons";
import { requestSearchFocus, useGo, usePageTitle } from "../../navigation";
import { font, radius, space, type } from "../../theme";
import { TopicGrid, TopicNotice, sermonCount } from "../../topics";
import {
  Header,
  Icon,
  Page,
  Notice,
  SectionHeading,
  SermonCard,
  SermonRow,
  SermonTitle,
  T,
  Tap,
  TextButton,
  Thumbnail,
  c,
  fieldBorder,
  nowrap,
  s,
  sermonLabel,
  useNarrow,
} from "../../ui";

// Latest sermons shown on Home; the rest are a search away.
const LATEST = 8;
// Sermons in a series rail before "See all".
const RAIL = 12;

// Switching to Search keeps whatever it already holds (a typed query, a
// topic filter from a link), as the tab bar does.
type TabsNavigation = {
  navigate: (name: "search", params: undefined, options: { merge: boolean }) => void;
};

/** "Good evening, Mufaro", from the first word of the name on the account. */
function greeting(name: string) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Good ${part}, ${name.trim().split(/\s+/)[0]}`;
}

export default function Browse() {
  usePageTitle("Home");
  const go = useGo();
  const tabs = useNavigation<TabsNavigation>();
  const narrow = useNarrow();
  const account = useAccount();
  const catalogue = useCatalogue();
  const { sermons } = catalogue;
  const [featured, ...rest] = sermons;
  // The whole library, rather than the bundled sample of four.
  const library = catalogue.source !== "sample";
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
  const newer = rest.filter((sermon) => !forYou.includes(sermon));
  const latest = newer.slice(0, LATEST);
  const rails = library ? seriesRails(sermons, catalogue.seriesName) : [];
  const searchAll = () =>
    go.run(() => tabs.navigate("search", undefined, { merge: true }));
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

      <ContinueWatching />

      {/* Offline at first launch: the bundled sample stands in. */}
      {catalogueMode === "remote" && !library && catalogue.settled && (
        <View style={styles.offline}>
          <Notice icon="cloud-offline-outline">
            You’re offline, so only a few sermons are here. The full library
            loads when you’re back online.
          </Notice>
          <TextButton label="Try again" align="start" onPress={catalogue.retry} />
        </View>
      )}

      {!featured ? (
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} />
          <T style={s.body}>Loading sermons…</T>
        </View>
      ) : (
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
              <T style={styles.eyebrow}>{library ? "Newest sermon" : "Featured"}</T>
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
      )}

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

      {latest.length > 0 && (
        <>
          <SectionHeading
            action={
              newer.length > latest.length
                ? {
                    label: "See all",
                    hint: "Searches every sermon",
                    onPress: searchAll,
                  }
                : undefined
            }
          >
            Latest sermons
          </SectionHeading>
          <View style={{ gap: space.sm }}>
            {latest.map((sermon) => (
              <SermonRow key={sermon.id} sermon={sermon} />
            ))}
          </View>
        </>
      )}

      {rails.map((rail) => (
        <SeriesRailSection key={rail.key} rail={rail} />
      ))}

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

      {sermons.length > 0 && (
        <View style={styles.footer}>
          <T style={s.meta}>
            {library
              ? `${sermonCount(sermons.length)} from the Apostle Arome Osayi channel, newest first.`
              : `This preview has ${sermonCount(sermons.length).toLowerCase()}, not the full archive.`}
          </T>
        </View>
      )}
    </Page>
  );
}

/**
 * One series as a horizontal rail of cards, in order, under its name. Each
 * card says which part it is; "See all" opens the whole series.
 */
function SeriesRailSection({ rail }: { rail: SeriesRail }) {
  const go = useGo();
  const { width, fontScale } = useWindowDimensions();
  // About one and a half cards on a phone, so the rail reads as scrollable.
  const cardWidth = Math.round(
    Math.min(280, Math.max(200, (Math.min(width, 760) - space.gutter * 2) * 0.62)) *
      Math.min(fontScale, 1.3),
  );
  const shown = rail.sermons.slice(0, RAIL);
  return (
    <View>
      <SectionHeading
        action={{
          label: "See all",
          hint: `Opens every part of ${rail.name}`,
          onPress: () =>
            go.push({ pathname: "/series/[key]", params: { key: rail.key } }),
        }}
      >
        {rail.name}
      </SectionHeading>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.rail}
        contentContainerStyle={styles.railContent}
        accessibilityLabel={`${rail.name}, ${sermonCount(rail.sermons.length)}`}
      >
        {shown.map((sermon) => (
          <SermonCard
            key={sermon.id}
            sermon={sermon}
            width={cardWidth}
            detail={sermon.session ?? undefined}
          />
        ))}
      </ScrollView>
    </View>
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
  offline: { gap: space.xs, marginBottom: space.lg },
  loading: {
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.xxl,
  },
  // Full-bleed, so cards scroll in from the screen's edge.
  rail: { marginHorizontal: -space.gutter },
  railContent: { paddingHorizontal: space.gutter, gap: space.md },
});
