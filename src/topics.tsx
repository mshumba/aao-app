import { useEffect, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Category,
  categories,
  CategoryId,
  getCategory,
  topicDisclaimer,
} from "./data/categories";
import { sermonsInCategory } from "./data/sermons";
import { useGo } from "./navigation";
import { font, radius, space, type } from "./theme";
import { Icon, IconName, Notice, T, Tap, c, s, web } from "./ui";

export function TopicNotice() {
  return <Notice>{topicDisclaimer}</Notice>;
}

/** Whole-string plurals: "1 sermon", "3 sermons", "No sermons yet". */
export function sermonCount(count: number, empty = "No sermons yet") {
  if (count === 0) return empty;
  return count === 1 ? "1 sermon" : `${count} sermons`;
}

function openTopic(go: ReturnType<typeof useGo>, id: CategoryId) {
  go.push({ pathname: "/topics/[categoryId]", params: { categoryId: id } });
}

/** B's two-column tiles for the four edification topics; one column when text is large. */
export function TopicGrid() {
  const go = useGo();
  const { width, fontScale } = useWindowDimensions();
  const oneColumn = (Math.min(width, 760) - 54) / 2 / fontScale < 130;
  return (
    <View style={styles.grid}>
      {categories.map((category) => {
        const count = sermonsInCategory(category.id).length;
        return (
          <Tap
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={`${category.label}, ${sermonCount(count)}`}
            onPress={() => openTopic(go, category.id)}
            unstable_pressDelay={60}
            style={[styles.tile, oneColumn && styles.tileFull]}
          >
            <View style={styles.tileIcon}>
              <Icon name={category.icon} color={c.accent} size={20} />
            </View>
            <View style={{ gap: 2 }}>
              <T style={styles.tileLabel}>{category.label}</T>
              <T style={s.meta}>{sermonCount(count)}</T>
            </View>
          </Tap>
        );
      })}
    </View>
  );
}

/** Full-width topic rows with descriptions, for the topic library. */
export function TopicRow({ category }: { category: Category }) {
  const go = useGo();
  const count = sermonsInCategory(category.id).length;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${category.label}, ${sermonCount(count)}`}
      accessibilityHint={category.description}
      // react-native-web drops hints, so web links the visible description.
      {...web({ "aria-describedby": `topic-${category.id}-description` })}
      onPress={() => openTopic(go, category.id)}
      unstable_pressDelay={60}
      feedback="scaleLarge"
      style={styles.row}
    >
      <View style={styles.rowIcon}>
        <Icon name={category.icon} color={c.accent} size={22} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <T style={styles.rowLabel}>{category.label}</T>
        <T nativeID={`topic-${category.id}-description`} style={s.meta}>
          {category.description}
        </T>
        <T style={[s.meta, { color: c.text }]}>{sermonCount(count)}</T>
      </View>
      <View style={{ alignSelf: "center" }}>
        <Icon name="chevron-forward" color={c.muted} size={18} />
      </View>
    </Tap>
  );
}

/** Links to a sermon's topics, on its detail page. */
export function TopicTags({ ids }: { ids: CategoryId[] }) {
  const go = useGo();
  return (
    <View style={styles.tags}>
      {ids.map((id) => {
        const category = getCategory(id)!;
        return (
          <Tap
            key={id}
            accessibilityRole="link"
            accessibilityLabel={`${category.label} topic`}
            onPress={() => openTopic(go, id)}
            style={styles.tag}
          >
            <Icon name={category.icon} size={16} color={c.accent} />
            <T style={styles.tagLabel}>{category.label}</T>
          </Tap>
        );
      })}
    </View>
  );
}

/**
 * Single-choice topic filter for search: All plus each topic, in one
 * scrolling row so results stay visible above the keyboard on small phones.
 */
export function TopicFilter({
  value,
  onChange,
}: {
  value?: CategoryId;
  onChange: (id?: CategoryId) => void;
}) {
  const scroller = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const options: { id?: CategoryId; label: string; icon: IconName }[] = [
    { label: "All", icon: "apps-outline" },
    ...categories.map((category) => ({
      id: category.id,
      label: category.label,
      icon: category.icon as IconName,
    })),
  ];
  const selectedKey = value ?? "all";
  // Keep the selected topic in view, including one chosen before arriving.
  useEffect(() => {
    const x = offsets.current[selectedKey];
    if (x !== undefined)
      scroller.current?.scrollTo({ x: Math.max(0, x - space.gutter), animated: false });
  }, [selectedKey]);
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollsToTop={false}
      keyboardShouldPersistTaps="handled"
      style={styles.strip}
      contentContainerStyle={styles.stripContent}
      accessibilityRole="radiogroup"
      accessibilityLabel="Filter by topic"
    >
      {options.map((option) => {
        const key = option.id ?? "all";
        const selected = key === selectedKey;
        return (
          <Tap
            key={key}
            onLayout={(e) => {
              offsets.current[key] = e.nativeEvent.layout.x;
              if (selected && e.nativeEvent.layout.x > 0)
                scroller.current?.scrollTo({
                  x: Math.max(0, e.nativeEvent.layout.x - space.gutter),
                  animated: false,
                });
            }}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            aria-checked={selected}
            onPress={() => onChange(option.id)}
            style={[styles.filter, selected && styles.filterSelected]}
          >
            {/* Same-size slot either way, so selecting never shifts the row. */}
            <Icon
              name={selected ? "checkmark" : option.icon}
              size={16}
              color={selected ? c.onAccent : c.accent}
            />
            <T style={[styles.filterLabel, selected && { color: c.onAccent }]}>
              {option.label}
            </T>
          </Tap>
        );
      })}
    </ScrollView>
  );
}

// White cards on the ivory page take a hairline edge rather than a shadow:
// they sit in the page, unlike the floating tab bar and toasts.
const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 104,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: "space-between",
    gap: space.md,
  },
  tileFull: { flexBasis: "100%" },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { fontFamily: font.bold, fontSize: 16, lineHeight: 22 },
  // Top-aligned so the icon stays with the title when text is large.
  row: {
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontFamily: font.bold, fontSize: 17, lineHeight: 24 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tag: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    maxWidth: "100%",
  },
  tagLabel: { ...type.label, fontSize: 14, color: c.text, flexShrink: 1 },
  strip: { marginHorizontal: -space.gutter, flexGrow: 0 },
  stripContent: { paddingHorizontal: space.gutter, gap: space.sm },
  filter: {
    minHeight: 48,
    paddingStart: 14,
    paddingEnd: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterSelected: { backgroundColor: c.accent, borderColor: c.accent },
  filterLabel: { ...type.label, fontSize: 14, color: c.text },
});
