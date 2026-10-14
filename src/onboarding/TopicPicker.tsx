import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { Category, CategoryId, categories } from "../data/categories";
import { font, radius, space } from "../theme";
import { Icon, T, Tap, c, s, web } from "../ui";

/**
 * Pick any of the four topics. Each is a card that says what the topic is
 * about; picked cards get a navy border and a filled check (never colour
 * alone) and are checkboxes to assistive tech. Shared by onboarding and
 * Account › Your topics.
 */
export function TopicPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: CategoryId[];
  onChange: (ids: CategoryId[]) => void;
  disabled?: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  // Measured, because the picker sits in columns of different widths. The
  // first guess is the onboarding column, so phones never flash two-up.
  const [column, setColumn] = useState(() => Math.min(width, 560) - space.xl * 2);
  // Two cards a row once each has room for its description at the
  // viewer's text size.
  const twoUp = column / fontScale >= 360;
  const rows = twoUp ? pairs(categories) : categories.map((category) => [category]);

  function toggle(id: CategoryId) {
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id];
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    // Library order, whatever order they were tapped in.
    onChange(categories.filter((category) => next.includes(category.id)).map((category) => category.id));
  }

  return (
    <View
      onLayout={(e) => setColumn(e.nativeEvent.layout.width)}
      style={styles.list}
      {...web({ role: "group", "aria-label": "Topics" })}
    >
      {rows.map((row) => (
        <View key={row[0].id} style={styles.row}>
          {row.map((category) => (
            <TopicCard
              key={category.id}
              category={category}
              selected={value.includes(category.id)}
              stacked={twoUp}
              disabled={disabled}
              onPress={() => toggle(category.id)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function TopicCard({
  category,
  selected,
  stacked,
  disabled,
  onPress,
}: {
  category: Category;
  selected: boolean;
  stacked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const descriptionId = `pick-${category.id}-description`;
  const check = (
    <View style={[styles.check, selected && styles.checkOn]}>
      {selected && <Icon name="checkmark" size={16} color={c.onAccent} />}
    </View>
  );
  return (
    <Tap
      testID={`topic-option-${category.id}`}
      accessibilityRole="checkbox"
      accessibilityLabel={category.label}
      accessibilityHint={category.description}
      aria-checked={selected}
      aria-disabled={disabled}
      {...web({
        // react-native-web drops hints, so web links the visible description.
        "aria-describedby": descriptionId,
        // Space toggles a checkbox, as it does a native one.
        onKeyDown: (e: { key: string; preventDefault: () => void }) => {
          if ((e.key === " " || e.key === "Spacebar") && !disabled) {
            e.preventDefault();
            onPress();
          }
        },
      })}
      disabled={disabled}
      onPress={onPress}
      unstable_pressDelay={60}
      feedback="scaleLarge"
      style={[styles.card, stacked && styles.cardStacked, selected && styles.cardOn]}
    >
      {stacked ? (
        <View style={styles.stackedTop}>
          <TopicIcon category={category} />
          {check}
        </View>
      ) : (
        <TopicIcon category={category} />
      )}
      <View style={[styles.text, !stacked && { flex: 1 }]}>
        <T style={styles.label}>{category.label}</T>
        <T nativeID={descriptionId} style={s.meta}>
          {category.description}
        </T>
      </View>
      {!stacked && check}
    </Tap>
  );
}

function TopicIcon({ category }: { category: Category }) {
  return (
    <View style={styles.icon}>
      <Icon name={category.icon} color={c.accent} size={22} />
    </View>
  );
}

function pairs<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  // Cards in a row stretch to the taller one.
  row: { flexDirection: "row", gap: space.md },
  // White cards on the ivory page, edged with a hairline. Picking thickens
  // the edge to 2pt navy; padding gives up the difference so the content
  // never shifts (a 16pt inset either way).
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: 15,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  cardStacked: { flexDirection: "column", alignItems: "stretch" },
  cardOn: { borderColor: c.accent, borderWidth: 2, padding: 14 },
  stackedTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: c.feature,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { gap: space.xs },
  label: { fontFamily: font.bold, fontSize: 16, lineHeight: 22 },
  // Unpicked: an empty ring in the muted colour, which keeps 3:1 against
  // the white card; picked: a filled navy disc with a white check.
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.muted,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.sm,
  },
  checkOn: { backgroundColor: c.accent, borderColor: c.accent },
});
