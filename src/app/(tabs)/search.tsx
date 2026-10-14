import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { CategoryId, getCategory } from "../../data/categories";
import { searchSermons } from "../../data/sermons";
import { firstParam, takeSearchFocus } from "../../navigation";
import { font, radius, space } from "../../theme";
import { TopicFilter, TopicNotice, sermonCount } from "../../topics";
import {
  Icon,
  IconButton,
  Page,
  PageTitle,
  SermonRow,
  StatePanel,
  T,
  c,
  fieldBorder,
  noWebOutline,
  s,
} from "../../ui";

export default function Search() {
  const params = useLocalSearchParams<{
    q?: string | string[];
    category?: string | string[];
  }>();
  const q = firstParam(params.q) ?? "";
  const category = firstParam(params.category);
  if (category && !getCategory(category))
    return (
      <Page>
        <PageTitle title="Search" />
        <StatePanel
          icon="pricetags-outline"
          title="This topic isn’t available"
          body="The link may be out of date. You can still search every sermon."
          label="Search all sermons"
          action={() => router.setParams({ category: "" })}
        />
      </Page>
    );
  // Remount only when a navigation intent changes; typing stays local to preserve focus.
  return (
    <SearchForm
      key={(category || "all") + ":" + q}
      initialQuery={q}
      initialCategory={(category || undefined) as CategoryId | undefined}
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
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  // Home's search field asks for focus; arriving by the tab itself doesn't.
  useFocusEffect(
    useCallback(() => {
      if (takeSearchFocus()) input.current?.focus();
    }, []),
  );
  const category = getCategory(categoryId);
  const trimmed = query.trim();
  const results = searchSermons(query, categoryId);
  // Always mounted and announced; never blank, so an empty result is heard.
  const count =
    results.length === 0
      ? "No sermons found"
      : category
        ? `${sermonCount(results.length)} in ${category.label}`
        : sermonCount(results.length);

  // VoiceOver has no live regions; announce the count once typing pauses.
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const timer = setTimeout(
      () =>
        AccessibilityInfo.announceForAccessibility(count),
      700,
    );
    return () => clearTimeout(timer);
  }, [count]);

  function clear() {
    setQuery("");
    input.current?.focus();
  }

  return (
    <Page>
      <PageTitle title="Search" />
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <Icon name="search-outline" color={c.muted} size={20} />
        <TextInput
          ref={input}
          accessibilityLabel="Search sermons"
          placeholder="Search sermons"
          placeholderTextColor={c.muted}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => Keyboard.dismiss()}
          returnKeyType="search"
          enterKeyHint="search"
          inputMode="search"
          autoCorrect={false}
          autoCapitalize="none"
          selectionColor={c.accent}
          style={styles.input}
        />
        {!!query && (
          <IconButton
            name="close-circle"
            label="Clear search"
            color={c.muted}
            size={22}
            onPress={clear}
          />
        )}
      </View>
      {!query && (
        <T style={[s.meta, styles.hint]}>
          Search by title, topic or event, like Apostolic Shift.
        </T>
      )}

      <View style={styles.filters}>
        <TopicFilter value={categoryId} onChange={setCategoryId} />
      </View>

      <View style={styles.summary}>
        <TopicNotice />
        <T
          style={[s.meta, styles.count]}
          accessibilityLiveRegion="polite"
          testID="result-count"
        >
          {count}
        </T>
      </View>

      {results.length ? (
        <View style={{ gap: space.sm }}>
          {results.map((sermon) => (
            <SermonRow key={sermon.id} sermon={sermon} lead={categoryId} />
          ))}
        </View>
      ) : trimmed ? (
        <StatePanel
          icon="search-outline"
          title={
            category
              ? `No sermons match “${trimmed}” in ${category.label}`
              : `No sermons match “${trimmed}”`
          }
          body={
            category
              ? "Try searching all topics, or a different word."
              : "Check the spelling, or try a title, a topic like prayer or an event like Apostolic Shift."
          }
          label={category ? "Search all topics" : "Clear search"}
          action={category ? () => setCategoryId(undefined) : clear}
          secondaryLabel={category ? "Clear search" : undefined}
          secondaryAction={category ? clear : undefined}
        />
      ) : (
        <StatePanel
          icon={category?.icon ?? "albums-outline"}
          title={`No sermons in ${category?.label ?? "this view"} yet`}
          body="Sermons haven’t been added to this topic. Try another one."
          label="Search all topics"
          action={() => setCategoryId(undefined)}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 54,
    paddingStart: 15,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: fieldBorder,
    backgroundColor: c.surface,
  },
  // Focus thickens the border rather than only recolouring it; padding
  // compensates so the text doesn't shift.
  fieldFocused: { borderColor: c.accent, borderWidth: 2, paddingStart: 14 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    color: c.text,
    fontFamily: font.regular,
    fontSize: 16,
    paddingEnd: space.md,
    ...noWebOutline,
  },
  hint: { marginTop: space.sm, paddingHorizontal: space.xs },
  filters: { marginTop: space.lg },
  summary: { marginTop: space.lg, marginBottom: space.sm, gap: space.md },
  count: { color: c.text, fontFamily: font.semibold },
});
