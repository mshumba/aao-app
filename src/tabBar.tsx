import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { setChrome } from "./player/layout";
import { font, radius, space } from "./theme";
import { Icon, IconName, T, Tap, c, pressedTint } from "./ui";

type BottomTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const icons: Record<string, [IconName, IconName]> = {
  index: ["home", "home-outline"],
  topics: ["albums", "albums-outline"],
  search: ["search", "search-outline"],
  account: ["person-circle", "person-circle-outline"],
};

/**
 * A floating white pill of four peer destinations, in the style of media
 * apps: a hairline and a soft shadow lift it off the ivory page, and the
 * current tab sits on sand in navy (shape and colour, never colour alone).
 * Labels stop growing at 1.4× (as system tab bars don't scale); on iOS a long
 * press shows the large content viewer instead. The docked player sits on top
 * of the bar, so its real height is shared.
 */
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  return (
    <View
      style={[styles.wrap, { paddingBottom: insets.bottom + space.sm }]}
      onLayout={(e) => setChrome("tabBar", e.nativeEvent.layout.height)}
    >
      <View style={styles.pill} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const label = descriptors[route.key].options.title ?? route.name;
          const [on, off] = icons[route.name] ?? ["ellipse", "ellipse-outline"];
          return (
            <Tap
              key={route.key}
              // iOS has no tab trait for custom views; React Navigation's own
              // tab bar uses button there too.
              accessibilityRole={Platform.OS === "ios" ? "button" : "tab"}
              accessibilityLabel={label}
              accessibilityShowsLargeContentViewer
              accessibilityLargeContentTitle={label}
              aria-selected={focused}
              testID={`tab-${route.name}`}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented)
                  navigation.navigate(route.name, route.params);
              }}
              feedback="highlight"
              highlightColor={pressedTint}
              style={[styles.tab, focused && styles.tabOn]}
            >
              <Icon name={focused ? on : off} size={22} color={focused ? c.accent : c.muted} />
              <T
                style={[styles.label, focused && styles.labelOn]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
              >
                {label}
              </T>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: c.bg,
    paddingTop: space.sm,
    paddingHorizontal: space.md,
  },
  pill: {
    flexDirection: "row",
    alignSelf: "center",
    width: "100%",
    maxWidth: 480,
    minHeight: 56,
    padding: space.xs,
    gap: space.xs,
    borderRadius: radius.pill,
    backgroundColor: c.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    boxShadow: "0 8px 24px rgba(27,30,36,0.10)",
  },
  tab: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  tabOn: { backgroundColor: c.feature },
  label: {
    fontFamily: font.semibold,
    fontSize: 12,
    lineHeight: 15,
    color: c.muted,
  },
  labelOn: { color: c.accent },
});
