import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { sermons, sermonCategoryIds } from "../../data/sermons";
import { TopicChips, TopicNotice } from "../../topics";
import SermonPlayer from "../../player/SermonPlayer";
import {
  Badge,
  Button,
  Header,
  Page,
  SectionHeading,
  SermonCard,
  StatePanel,
  T,
  s,
} from "../../ui";
export default function SermonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sermon = sermons.find((x) => x.id === id);
  if (!sermon)
    return (
      <Page>
        <Header title="Sermon" back />
        <StatePanel
          title="This sermon isn’t available"
          body="The link may be out of date. Choose another message from the library."
          label="Browse sermons"
          action={() => router.replace("/")}
        />
      </Page>
    );
  return (
    <Page>
      <Header title="Sermon" back />
      <SermonPlayer key={id} sermon={sermon} />
      <View style={{ marginTop: 24, gap: 14 }}>
        <Badge>{sermon.collection.toUpperCase()}</Badge>
        <T
          accessibilityRole="header"
          style={{
            fontSize: 24,
            lineHeight: 33,
            fontFamily: "Manrope_700Bold",
          }}
        >
          {sermon.title}
        </T>
        <T style={s.body}>{sermon.channel}</T>
        <T style={s.small}>
          {sermon.date} · {sermon.duration}
        </T>
      </View>
      <SectionHeading>Grow in this area</SectionHeading>
      <TopicNotice />
      <TopicChips ids={sermonCategoryIds(sermon)} />
      <SectionHeading>About this message</SectionHeading>
      <T style={s.body}>
        A public message from {sermon.collection}, shared by the Apostle Arome
        Osayi channel. The original title is preserved. Scripture references and
        a ministry-approved summary have not yet been added.
      </T>
      <T style={[s.small, { marginTop: 16 }]}>
        YouTube provides the player and its controls. Loading it connects to
        Google services.
      </T>
      <SectionHeading>Keep watching</SectionHeading>
      {sermons
        .filter((x) => x.id !== id)
        .slice(0, 2)
        .map((item) => (
          <SermonCard key={item.id} sermon={item} />
        ))}
      <Button
        label="All sermons"
        secondary
        onPress={() => router.dismissTo("/")}
      />
    </Page>
  );
}
