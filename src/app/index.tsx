import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { sermons } from "../data/sermons";
import { TopicNotice } from "../topics";
import {
  Button,
  Header,
  Icon,
  Page,
  SectionHeading,
  SermonCard,
  T,
  Thumbnail,
  c,
  s,
} from "../ui";
export default function Browse() {
  const featured = sermons[0];
  return (
    <Page>
      <Header />
      <T style={local.eyebrow}>THE SERMON LIBRARY</T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search sermons"
        onPress={() => router.push("/search")}
        style={local.search}
      >
        <Icon name="search-outline" color={c.muted} size={20} />
        <T style={{ color: c.muted }}>Search sermons</T>
        <T style={[s.small, { marginLeft: "auto" }]}>Explore →</T>
      </Pressable>
      <View style={local.feature}>
        <Thumbnail sermon={featured} />
        <View style={local.featureBody}>
          <View style={local.kicker}>
            <T style={s.collection}>FEATURED MESSAGE</T>
            <T style={s.small}>{featured.date}</T>
          </View>
          <T accessibilityRole="header" style={local.featureTitle}>
            {featured.title}
          </T>
          <T style={{ color: "#c8d9d7", fontSize: 13 }}>
            {featured.channel} · {featured.duration}
          </T>
          <Button
            label="Watch sermon"
            icon="play"
            onPress={() =>
              router.push({
                pathname: "/sermon/[id]",
                params: { id: featured.id },
              })
            }
          />
        </View>
      </View>
      <SectionHeading aside="Newest first">Latest messages</SectionHeading>
      <TopicNotice />
      <View style={{ marginBottom: 18 }}>
        <Button
          label="Browse by topic"
          secondary
          icon="leaf-outline"
          onPress={() => router.push("/library")}
        />
      </View>
      <View style={local.grid}>
        {sermons.slice(1).map((sermon) => (
          <SermonCard key={sermon.id} sermon={sermon} compact />
        ))}
      </View>
      <View style={local.note}>
        <Icon name="headset-outline" color={c.muted} size={19} />
        <T style={[s.small, { flex: 1 }]}>
          Make room for the Word. Start anywhere, stay a while.
        </T>
      </View>
      <T style={[s.small, { marginTop: 18 }]}>
        Public-source preview · 4 messages · No account needed
      </T>
    </Page>
  );
}
const local = StyleSheet.create({
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.7,
    color: c.muted,
    marginBottom: 16,
    fontFamily: "Manrope_600SemiBold",
  },
  search: {
    minHeight: 54,
    paddingHorizontal: 18,
    borderRadius: 15,
    backgroundColor: c.surface,
    flexDirection: "row",
    gap: 11,
    alignItems: "center",
    marginBottom: 20,
  },
  feature: { backgroundColor: c.feature, borderRadius: 24, overflow: "hidden" },
  featureBody: { padding: 22, gap: 18 },
  kicker: { gap: 5 },
  featureTitle: {
    fontSize: 23,
    lineHeight: 32,
    fontFamily: "Manrope_700Bold",
    letterSpacing: -0.5,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  note: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 22,
    marginTop: 6,
  },
});
