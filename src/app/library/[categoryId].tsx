import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { getCategory } from "../../data/categories";
import { sermonsInCategory } from "../../data/sermons";
import { TopicNotice } from "../../topics";
import {
  Button,
  Header,
  Page,
  SectionHeading,
  SermonCard,
  StatePanel,
  T,
  s,
} from "../../ui";
export default function CategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const category = getCategory(categoryId);
  if (!category)
    return (
      <Page>
        <Header title="Topics" back />
        <StatePanel
          title="This topic isn’t available"
          body="Choose a topic from the library to keep exploring."
          label="Browse other topics"
          action={() => router.dismissTo("/library")}
        />
      </Page>
    );
  const messages = sermonsInCategory(category.id);
  return (
    <Page>
      <Header title="Topics" back />
      <T accessibilityRole="header" style={[s.title, { marginBottom: 14 }]}>
        {category.label}
      </T>
      <T style={[s.body, { marginBottom: 20 }]}>{category.description}</T>
      <TopicNotice />
      {messages.length > 0 ? (
        <>
          <Button
            label="Search this topic"
            icon="search-outline"
            secondary
            onPress={() =>
              router.push({
                pathname: "/search",
                params: { category: category.id },
              })
            }
          />
          <SectionHeading aside={messages.length + " messages"}>
            In this topic
          </SectionHeading>
          <View>
            {messages.map((sermon) => (
              <SermonCard key={sermon.id} sermon={sermon} />
            ))}
          </View>
        </>
      ) : (
        <StatePanel
          icon={category.icon}
          title="A little room to grow."
          body="No demo messages have been assigned to this topic yet. There are more topics to explore."
          label="Browse other topics"
          action={() => router.dismissTo("/library")}
        />
      )}
    </Page>
  );
}
