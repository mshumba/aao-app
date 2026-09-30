import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { categories } from "../../data/categories";
import { sermonsInCategory } from "../../data/sermons";
import { TopicNotice } from "../../topics";
import { Header, Icon, Page, T, c, s } from "../../ui";
export default function TopicLibrary() {
  return (
    <Page>
      <Header title="Browse by topic" back />
      <T style={[s.title, { marginBottom: 14 }]}>Make room{"\n"}to grow.</T>
      <T style={[s.body, { marginBottom: 20 }]}>
        Find a message for the part of your walk you want to nurture.
      </T>
      <TopicNotice />
      <View style={{ gap: 14 }}>
        {categories.map((category) => {
          const count = sermonsInCategory(category.id).length;
          return (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={
                category.label + ", " + count + " demo messages"
              }
              onPress={() =>
                router.push({
                  pathname: "/library/[categoryId]",
                  params: { categoryId: category.id },
                })
              }
              style={({ pressed }) => [styles.row, pressed && s.pressed]}
            >
              <View style={styles.icon}>
                <Icon name={category.icon} color={c.mint} size={24} />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <T style={styles.title}>{category.label}</T>
                <T style={s.small}>{category.description}</T>
                <T style={[s.small, { color: c.mint }]}>
                  {count} demo {count === 1 ? "message" : "messages"}
                </T>
              </View>
              <Icon name="chevron-forward" color={c.muted} size={18} />
            </Pressable>
          );
        })}
      </View>
    </Page>
  );
}
const styles = StyleSheet.create({
  row: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  icon: { width: 40, alignItems: "center" },
  title: { fontFamily: "Manrope_700Bold", fontSize: 18, lineHeight: 25 },
});
