import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Glyph, hasGlyphs } from "./kit/icons/Glyph";
import { TAB_GLYPHS } from "./kit/icons/glyphs";
import { RouteIcon } from "./kit/RouteIcon";
import { setChrome } from "./player/layout";
import { font, gradients, radius, shadows, textCap, type } from "./theme";
import { Icon, IconName, T, Tap, c, gradient, pressedTint } from "./ui";

type BottomTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

// How far the bar's fade reaches up over the page.
const FADE = 28;

// The concept's own glyphs (kit/icons): outline, and filled navy when
// selected. A native build made before react-native-svg was added keeps
// the earlier icons: Ionicons, selected (filled) and unselected (outline),
// and the drawn route glyph for Paths.
const fallbackIcons: Record<string, [IconName, IconName]> = {
  index: ["home", "home-outline"],
  search: ["search", "search-outline"],
  account: ["person", "person-outline"],
};

/**
 * A floating white pill of four peer destinations (Home · Paths · Search ·
 * Account), as in the approved concept: a hairline ring and a soft shadow
 * lift it off the ivory page, and the current tab sits on a sand capsule
 * with a filled navy icon and a navy label (shape and colour, never colour
 * alone). Labels stop growing at 1.4× (as system tab bars don't scale); on
 * iOS a long press shows the large content viewer instead. The docked
 * player sits on top of the bar, so its real height is shared.
 *
 * The bar overlaps the bottom of the page by FADE and fades it out there, so
 * content scrolling down meets a soft edge rather than a hard cut above the
 * pill. The fade passes touches through to the page. Routes hidden with
 * `href: null` (the old Topics tab) are left out.
 */
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const current = state.routes[state.index]?.key;
  const routes = state.routes.filter(
    (route) =>
      StyleSheet.flatten(descriptors[route.key].options.tabBarItemStyle)?.display !== "none",
  );
  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(12, insets.bottom - 8) }]}
      // The fade sits over the page, so the dock and toasts measure from
      // the bar below it.
      onLayout={(e) => setChrome("tabBar", e.nativeEvent.layout.height - FADE)}
    >
      <View style={styles.pill} accessibilityRole="tablist">
        {routes.map((route) => {
          const focused = route.key === current;
          const label = descriptors[route.key].options.title ?? route.name;
          const color = focused ? c.accent : c.muted;
          const glyph = TAB_GLYPHS[route.name];
          const [on, off] = fallbackIcons[route.name] ?? ["ellipse", "ellipse-outline"];
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
              highlightColor={focused ? c.feature : pressedTint}
              style={[styles.tab, focused && styles.tabOn]}
            >
              {/* A fixed box, so every glyph sits on the same line. */}
              <View style={styles.icon}>
                {hasGlyphs && glyph ? (
                  <Glyph name={glyph} active={focused} size={22} color={color} />
                ) : route.name === "paths" ? (
                  <RouteIcon size={22} color={color} bold={focused} />
                ) : (
                  <Icon name={focused ? on : off} size={22} color={color} />
                )}
              </View>
              <T
                style={[styles.label, focused && styles.labelOn]}
                numberOfLines={1}
                maxFontSizeMultiplier={textCap.tab}
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
    pointerEvents: "box-none",
    marginTop: -FADE,
    paddingTop: FADE,
    paddingHorizontal: 16,
    backgroundColor: "transparent",
    ...gradient(gradients.tabFade),
  },
  pill: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "space-around",
    width: "100%",
    maxWidth: 480,
    minHeight: 64,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: c.raised,
    boxShadow: shadows.floating,
  },
  tab: {
    flex: 1,
    maxWidth: 80,
    minHeight: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabOn: { backgroundColor: c.feature },
  icon: { height: 26, alignItems: "center", justifyContent: "center" },
  label: { ...type.tab, color: c.muted },
  labelOn: { fontFamily: font.bold, color: c.accent },
});
