import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { CategoryId, getCategory } from "../data/categories";
import { searchSermons } from "../data/sermons";
import { TopicChips, TopicNotice } from "../topics";
import {
  Button,
  Header,
  IconButton,
  Page,
  SectionHeading,
  SermonCard,
  StatePanel,
  T,
  c,
  s,
} from "../ui";
export default function Search() {
  const { q = "", category } = useLocalSearchParams<{
    q?: string;
    category?: string;
  }>();
  if (category && !getCategory(category))
    return (
      <Page>
        <Header title="Search" back />
        <StatePanel
          title="This topic isn’t available"
          body="Choose another topic, or search across the whole library."
          label="Search all messages"
          action={() => router.replace("/search")}
        />
      </Page>
    );
  // Remount only when a navigation intent changes; typing stays local to preserve focus.
  return (
    <SearchForm
      key={(category || "all") + ":" + q}
      initialQuery={q}
      initialCategory={category as CategoryId | undefined}
    />
  );
}
function SearchForm({
  initialQuery,
  initialCategory,
}: {
  initialQuery: string;
  initialCategory?: CategoryId;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState(initialCategory);
  const category = getCategory(categoryId);
  const results = searchSermons(query, categoryId);
  return (
    <Page>
      <Header title="Search" back />
      <T style={[s.title, { marginBottom: 24 }]}>
        A message for{"\n"}where you are.
      </T>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          autoFocus
          accessibilityLabel="Search sermons"
          placeholder="Title, topic or gathering"
          placeholderTextColor={c.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          style={[s.input, { flex: 1 }]}
          autoCorrect={false}
        />
        {!!query && (
          <IconButton
            name="close"
            label="Clear search"
            onPress={() => setQuery("")}
          />
        )}
      </View>
      {category && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginTop: 16,
            paddingStart: 14,
            backgroundColor: c.surface,
            borderRadius: 14,
          }}
        >
          <View style={{ flex: 1 }}>
            <T style={s.small}>Searching within</T>
            <T style={{ fontFamily: "Manrope_700Bold" }}>{category.label}</T>
          </View>
          <IconButton
            name="close-circle-outline"
            label="Clear topic filter"
            onPress={() => setCategoryId(undefined)}
          />
        </View>
      )}
      {!query.trim() && !category && (
        <>
          <SectionHeading>Explore by topic</SectionHeading>
          <TopicChips />
        </>
      )}
      <SectionHeading aside={results.length + " messages"}>
        {query.trim() ? "Search results" : "All messages"}
      </SectionHeading>
      <TopicNotice />
      <View accessibilityLiveRegion="polite">
        {results.length ? (
          results.map((sermon) => (
            <SermonCard key={sermon.id} sermon={sermon} />
          ))
        ) : (
          <>
            <StatePanel
              icon="search-outline"
              title="No messages found"
              body={
                category
                  ? "Nothing matches in " +
                    category.label +
                    ". Clear the search or try all topics."
                  : "Nothing matches “" +
                    query +
                    "”. Try a title, “faith”, or “spiritual growth”."
              }
              label={query ? "Clear search" : undefined}
              action={query ? () => setQuery("") : undefined}
            />
            {category && (
              <Button
                label="Search all topics"
                secondary
                onPress={() => setCategoryId(undefined)}
              />
            )}
          </>
        )}
      </View>
    </Page>
  );
}
