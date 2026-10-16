import { memo, useRef, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { eventLine } from "../../data/display";
import type { Sermon } from "../../data/sermons";
import { c, font, fontSize, space, textCap, type } from "../../theme";
import { T, Tap, moveFocus, web, type WebKey } from "../../ui";

export type SermonTabKey = "moments" | "about";

const TAB_KEYS: readonly SermonTabKey[] = ["moments", "about"];

export type SermonTabsProps = {
  activeTab: SermonTabKey;
  onChangeTab: (tab: SermonTabKey) => void;
  momentsCount?: number;
  /** "Part of your path · Day 2 of 6" and Mark done, shown where they appear today. */
  pathSlot?: ReactNode;
  momentsSlot: ReactNode;
  aboutSlot: ReactNode;
  /** Full-bleed horizontal offset so the underline spans edge to edge of the column. */
  bleedHorizontal?: number;
};

/**
 * Mindvalley-style two-tab underline switcher ("Moments | About") beneath
 * the sermon's title and duration.
 */
export const SermonTabs = memo(function SermonTabs({
  activeTab,
  onChangeTab,
  pathSlot,
  momentsSlot,
  aboutSlot,
  bleedHorizontal = 0,
}: SermonTabsProps) {
  const tabRefs = useRef<Partial<Record<SermonTabKey, View | null>>>({});

  const onTabKey = (key: SermonTabKey) => (e: WebKey) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = TAB_KEYS[(TAB_KEYS.indexOf(key) + step + TAB_KEYS.length) % TAB_KEYS.length];
    onChangeTab(next);
    moveFocus(tabRefs.current[next] ?? null);
  };

  return (
    <View>
      <View
        accessibilityRole="tablist"
        style={[
          styles.tabBar,
          bleedHorizontal ? { marginHorizontal: -bleedHorizontal } : null,
        ]}
      >
        {TAB_KEYS.map((key) => {
          const selected = activeTab === key;
          const label = key === "moments" ? "Moments" : "About";
          return (
            <Tap
              key={key}
              ref={(node) => {
                tabRefs.current[key] = node;
              }}
              testID={`sermon-tab-${key}`}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              {...web({
                "aria-selected": selected,
                tabIndex: selected ? 0 : -1,
              })}
              onWebKey={onTabKey(key)}
              onPress={() => onChangeTab(key)}
              feedback="dim"
              style={styles.tab}
            >
              <T
                style={[styles.tabLabel, selected && styles.tabLabelActive]}
                maxFontSizeMultiplier={textCap.section}
              >
                {label}
              </T>
              <View
                style={[styles.indicator, selected && styles.indicatorActive]}
                {...web({ "aria-hidden": true })}
              />
            </Tap>
          );
        })}
      </View>

      <View style={styles.body}>
        {pathSlot ? <View style={styles.pathSlot}>{pathSlot}</View> : null}
        {activeTab === "moments" ? momentsSlot : aboutSlot}
      </View>
    </View>
  );
});

/**
 * Who preached it, then the occasion when the headline doesn't already say
 * it: "Apostle Arome Osayi · Lioness Conference · Grand Finale".
 */
function byline(sermon: Sermon) {
  const context = eventLine(sermon);
  if (sermon.speaker) return context;
  if (!context || context === sermon.channel || context === sermon.venue) return sermon.channel;
  return `${sermon.channel} · ${context}`;
}

/**
 * Editorial description block at the top of the About tab: who preached the
 * message, the occasion/venue, and the date preached.
 */
export const SermonDescription = memo(function SermonDescription({
  sermon,
  pathTheme,
}: {
  sermon: Sermon;
  /** Optional day theme when opened as part of a guided path. */
  pathTheme?: string | null;
}) {
  const occasion = byline(sermon);

  return (
    <View style={styles.descriptionBox} testID="sermon-description">
      {pathTheme ? <T style={styles.themeLine}>{pathTheme}</T> : null}
      <T style={styles.descriptionLead}>{occasion}</T>
      <T style={styles.descriptionMeta}>
        {`${sermon.preached ? "Preached" : "Published"} ${sermon.date} · ${sermon.duration}`}
      </T>
    </View>
  );
});

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    marginTop: space.xs,
  },
  tab: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
    position: "relative",
  },
  tabLabel: {
    fontFamily: font.semibold,
    fontSize: fontSize.body,
    lineHeight: 20,
    color: c.muted,
  },
  tabLabelActive: {
    fontFamily: font.bold,
    color: c.text,
  },
  indicator: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 2.5,
    backgroundColor: "transparent",
  },
  indicatorActive: {
    backgroundColor: c.accent,
  },
  body: {
    paddingTop: space.lg,
  },
  pathSlot: {
    marginBottom: space.md,
  },
  descriptionBox: {
    gap: 4,
    marginBottom: space.lg,
  },
  themeLine: {
    ...type.prose,
    color: c.text,
    marginBottom: 4,
  },
  descriptionLead: {
    ...type.body,
    fontFamily: font.semibold,
    color: c.text,
  },
  descriptionMeta: {
    ...type.meta,
    color: c.muted,
  },
});
