import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import {
  categories,
  CategoryId,
  getCategory,
  topicDisclaimer,
} from "./data/categories";
import { Icon, T, c, s } from "./ui";
export function TopicNotice() {
  return <T style={[s.small, { marginBottom: 18 }]}>{topicDisclaimer}</T>;
}
export function TopicChips({
  ids = categories.map((category) => category.id),
}: {
  ids?: CategoryId[];
}) {
  return (
    <View style={styles.chips}>
      {ids.map((id) => {
        const category = getCategory(id)!;
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={"Browse " + category.label}
            onPress={() =>
              router.push({
                pathname: "/library/[categoryId]",
                params: { categoryId: id },
              })
            }
            style={({ pressed }) => [styles.chip, pressed && s.pressed]}
          >
            <T style={styles.chipLabel}>{category.label}</T>
            <Icon name="arrow-forward" size={16} color={c.mint} />
          </Pressable>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 21,
    color: c.mint,
    fontFamily: "Manrope_600SemiBold",
    flexShrink: 1,
  },
});
