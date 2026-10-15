import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Platform, StyleSheet, View, type ListRenderItem } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { categories, type CategoryId } from "../data/categories";
import { seriesRails, sermonCategoryIds, type Sermon } from "../data/sermons";
import { SERIES_MIN } from "../home/copy";
import { ChipRow, FilterChip, SearchField } from "../kit";
import { firstParam } from "../navigation";
import { useDockInset } from "../player/useDockInset";
import { space, tabular, type } from "../theme";
import { sermonCount } from "../topics";
import {
  Header,
  PageTitle,
  SermonRow,
  StatePanel,
  T,
  c,
  dockScrollPadding,
  useRadioKeys,
} from "../ui";

type Dimension = "topic" | "series" | "year";
type Option = { key: string; label: string };

const ANY = "any";

/** Lower case, accents off, so "Ifeoluwa" matches "ifeolúwa". */
function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase();
}

/**
 * Every sermon in the library, newest first (Home's "Latest · See all"):
 * filter by topic, series or year, and find one by its title. A long list,
 * so it's a FlatList; the filters and the field ride at its top.
 */
export default function AllSermons() {
  const params = useLocalSearchParams<{
    topic?: string | string[];
    series?: string | string[];
    year?: string | string[];
    q?: string | string[];
  }>();
  const catalogue = useCatalogue();
  const { sermons, seriesName } = catalogue;
  const insets = useSafeAreaInsets();
  const dock = useDockInset();

  // ---- The choices, from the library itself ------------------------------------------
  const options = useMemo(() => {
    const years = [...new Set(sermons.map((s) => s.day.slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))]
      .sort((a, b) => b.localeCompare(a))
      .map((y) => ({ key: y, label: y }));
    const series = seriesRails(sermons, seriesName, { count: Number.MAX_SAFE_INTEGER, min: SERIES_MIN }).map(
      (rail) => ({ key: rail.key, label: rail.name }),
    );
    const counts = new Map<CategoryId, number>();
    for (const sermon of sermons)
      for (const id of sermonCategoryIds(sermon)) counts.set(id, (counts.get(id) ?? 0) + 1);
    const topics = categories.filter((t) => counts.get(t.id)).map((t) => ({ key: t.id, label: t.label }));
    return { year: years, series, topic: topics } satisfies Record<Dimension, Option[]>;
  }, [sermons, seriesName]);

  // ---- What's chosen (a link may choose for you: /sermons?series=…) ------------------
  const initial = (dimension: Dimension, value?: string | string[]) => {
    const v = firstParam(value);
    return v && options[dimension].some((o) => o.key === v) ? v : null;
  };
  const [chosen, setChosen] = useState<Record<Dimension, string | null>>(() => ({
    topic: initial("topic", params.topic),
    series: initial("series", params.series),
    year: initial("year", params.year),
  }));
  const [open, setOpen] = useState<Dimension | null>(null);
  const [query, setQuery] = useState(firstParam(params.q) ?? "");

  const choose = useCallback((dimension: Dimension, key: string | null) => {
    setChosen((was) => ({ ...was, [dimension]: key }));
  }, []);
  const clearAll = useCallback(() => {
    setChosen({ topic: null, series: null, year: null });
    setQuery("");
    setOpen(null);
  }, []);

  const list = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return sermons.filter((sermon) => {
      if (chosen.year && !sermon.day.startsWith(chosen.year)) return false;
      if (chosen.series && sermon.seriesKey !== chosen.series) return false;
      if (chosen.topic && !sermonCategoryIds(sermon).includes(chosen.topic as CategoryId)) return false;
      if (!words.length) return true;
      const text = fold(`${sermon.headline} ${sermon.title}`);
      return words.every((w) => text.includes(w));
    });
  }, [sermons, chosen, query]);

  const filtering = !!(chosen.topic || chosen.series || chosen.year || query.trim());
  const countText = filtering
    ? `${sermonCount(list.length, "No sermons")} of ${sermons.length.toLocaleString("en-GB")}`
    : `${sermonCount(list.length)}, newest first`;

  const header = (
    <View>
      <Header back />
      <PageTitle
        kicker="The library"
        title="All sermons"
        lead="Every sermon from the Apostle Arome Osayi channel. Find one by its title, or narrow by topic, series or year."
      />
      <SearchField
        testID="sermons-search"
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery("")}
        leading="search-outline"
        placeholder="Search sermon titles"
        style={styles.field}
      />
      <Filters
        options={options}
        chosen={chosen}
        open={open}
        onOpen={setOpen}
        onChoose={choose}
      />
      <T
        testID="sermons-count"
        style={styles.count}
        accessibilityLiveRegion="polite"
        {...(Platform.OS === "web" ? { role: "status" } : null)}
      >
        {countText}
      </T>
    </View>
  );

  const renderItem: ListRenderItem<Sermon> = useCallback(
    ({ item }) => <SermonRow sermon={item} />,
    [],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <FlatList
        testID="sermons-list"
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <StatePanel
            testID="sermons-empty"
            icon="search-outline"
            title="No sermons match"
            body={
              query.trim()
                ? "Try fewer words, or clear the filters to see every sermon."
                : "Clear the filters to see every sermon."
            }
            label="Clear filters"
            action={clearAll}
          />
        }
        ItemSeparatorComponent={Gap}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
        style={dockScrollPadding(dock)}
        contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom + dock }]}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={9}
        removeClippedSubviews={Platform.OS === "android"}
      />
    </SafeAreaView>
  );
}

const Gap = () => <View style={{ height: space.lg }} />;

const LABELS: Record<Dimension, { name: string; any: string }> = {
  topic: { name: "Topic", any: "Any topic" },
  series: { name: "Series", any: "Any series" },
  year: { name: "Year", any: "Any year" },
};

/**
 * Three buttons (Topic, Series, Year) that say what's chosen; pressing one
 * shows its choices underneath as a row of radio chips.
 */
function Filters({
  options,
  chosen,
  open,
  onOpen,
  onChoose,
}: {
  options: Record<Dimension, Option[]>;
  chosen: Record<Dimension, string | null>;
  open: Dimension | null;
  onOpen: (dimension: Dimension | null) => void;
  onChoose: (dimension: Dimension, key: string | null) => void;
}) {
  const dimensions = (["topic", "series", "year"] as const).filter((d) => options[d].length > 0);
  return (
    <View style={styles.filters}>
      <ChipRow label="Filters" inset={space.gutter}>
        {dimensions.map((dimension) => {
          const key = chosen[dimension];
          const label = key
            ? (options[dimension].find((o) => o.key === key)?.label ?? LABELS[dimension].name)
            : LABELS[dimension].name;
          return (
            <FilterChip
              key={dimension}
              testID={`filter-${dimension}`}
              role="button"
              label={label}
              selected={!!key}
              expanded={open === dimension}
              hint={`Shows the ${LABELS[dimension].name.toLowerCase()}s to choose from`}
              onPress={() => onOpen(open === dimension ? null : dimension)}
            />
          );
        })}
      </ChipRow>
      {open ? (
        <Choices
          key={open}
          dimension={open}
          options={options[open]}
          value={chosen[open]}
          onChoose={(key) => onChoose(open, key)}
        />
      ) : null}
    </View>
  );
}

function Choices({
  dimension,
  options,
  value,
  onChoose,
}: {
  dimension: Dimension;
  options: Option[];
  value: string | null;
  onChoose: (key: string | null) => void;
}) {
  const keys = [ANY, ...options.map((o) => o.key)];
  const radio = useRadioKeys(keys, value ?? ANY, (key) => onChoose(key === ANY ? null : key));
  return (
    <View
      style={styles.choices}
      accessibilityRole="radiogroup"
      accessibilityLabel={LABELS[dimension].name}
    >
      <ChipRow inset={space.gutter}>
        {[{ key: ANY, label: LABELS[dimension].any }, ...options].map((option) => (
          <FilterChip
            key={option.key}
            {...radio(option.key)}
            testID={`choice-${dimension}-${option.key}`}
            label={option.label}
            selected={(value ?? ANY) === option.key}
            onPress={() => onChoose(option.key === ANY ? null : option.key)}
          />
        ))}
      </ChipRow>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: space.gutter,
  },
  field: { marginTop: space.lg },
  // The chip rows run to the screen's edges, as they do on Home.
  filters: { marginTop: space.md, marginHorizontal: -space.gutter, gap: space.sm },
  choices: { marginTop: 2 },
  count: { ...type.meta, ...tabular, color: c.muted, marginTop: space.md, marginBottom: space.lg },
});
