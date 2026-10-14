import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { setChrome } from "./player/layout";
import { font, radius, space } from "./theme";
import { Icon, IconName, T, Tap, c, gradient, pressedTint } from "./ui";

type BottomTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

// How far the bar's fade reaches up over the page.
const FADE = space.xl;

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
 *
 * The bar overlaps the bottom of the page by FADE and fades it out there, so
 * content scrolling down meets a soft edge rather than a hard cut above the
 * pill. The fade passes touches through to the page.
 */
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: insets.bottom + space.sm }]}
      // The fade sits over the page, so the dock and toasts measure from
      // the bar below it.
      onLayout={(e) => setChrome("tabBar", e.nativeEvent.layout.height - FADE)}
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
    marginTop: -FADE,
    paddingTop: FADE + space.sm,
    paddingHorizontal: space.md,
    backgroundColor: "transparent",
    ...gradient(`linear-gradient(180deg, ${c.bg}00 0%, ${c.bg} ${FADE}px)`),
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
