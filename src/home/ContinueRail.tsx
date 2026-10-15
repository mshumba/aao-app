import { memo, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useAccount } from "../auth/AccountProvider";
import type { WatchProgress } from "../auth/types";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { headline } from "../data/display";
import type { Sermon } from "../data/sermons";
import { Artwork, SectionHeader } from "../kit";
import { fraction, resumePoint, timeLeft } from "../player/progress";
import { artRadius, c, font, tabular, textCap, type } from "../theme";
import { T, Tap, web } from "../ui";

const MAX = 6;
const TILE = 176;

type Item = { sermon: Sermon; progress: WatchProgress };

/**
 * The signed-in viewer's unfinished sermons, most recently watched first,
 * as the concept's 16:9 tiles with the time left on the artwork and a bar
 * along its bottom edge. A tile opens the sermon and resumes it. Hidden for
 * guests and when there's nothing to continue; today's path sermon is left
 * out (the path card above plays it). "See all" lays every one out in place.
 */
export const ContinueRail = memo(function ContinueRail({
  exclude,
  onWatch,
}: {
  /** Today's path sermon, already on the path card. */
  exclude?: string | null;
  onWatch: (id: string) => void;
}) {
  const account = useAccount();
  const { find } = useCatalogue();
  const { width, fontScale } = useWindowDimensions();
  const [all, setAll] = useState(false);
  const items = useMemo<Item[]>(() => {
    if (!account.user) return [];
    return [...account.progress]
      .filter((p) => resumePoint(p) > 0 && p.sermonId !== exclude)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((progress) => ({ progress, sermon: find(progress.sermonId) }))
      .filter((item): item is Item => !!item.sermon)
      .slice(0, MAX);
  }, [account.user, account.progress, exclude, find]);
  if (!items.length) return null;

  const tile = Math.round(TILE * Math.min(1.3, Math.max(1, fontScale)));
  // Laid out: two to a row across the column.
  const column = Math.min(width, 760) - 48;
  const half = Math.floor((column - 12) / 2);
  return (
    <View testID="continue-watching" style={styles.section}>
      <SectionHeader
        title="Continue watching"
        action={
          items.length > 2
            ? {
                label: all ? "Show less" : "See all",
                onPress: () => setAll((was) => !was),
                hint: all ? "Shows them in a row again" : "Shows every sermon you’re part way through",
              }
            : undefined
        }
        inset={24}
        style={styles.header}
      />
      {all ? (
        <View style={styles.grid}>
          {items.map((item) => (
            <ContinueTile key={item.sermon.id} {...item} width={half} onWatch={onWatch} />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={tile + 12}
          snapToAlignment="start"
          contentContainerStyle={styles.rail}
        >
          {items.map((item) => (
            <ContinueTile key={item.sermon.id} {...item} width={tile} onWatch={onWatch} />
          ))}
        </ScrollView>
      )}
    </View>
  );
});

const ContinueTile = memo(function ContinueTile({
  sermon,
  progress,
  width,
  onWatch,
}: Item & { width: number; onWatch: (id: string) => void }) {
  const left = timeLeft(progress);
  const title = headline(sermon);
  const r = artRadius(width);
  const watched = Math.round(fraction(progress) * 1000) / 10;
  return (
    <Tap
      testID="continue-card"
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${left}.`}
      accessibilityHint="Resumes the sermon where you left off"
      onPress={() => onWatch(sermon.id)}
      unstable_pressDelay={60}
      feedback="scaleLarge"
      style={{ width }}
    >
      <View style={[styles.art, { width, height: Math.round((width * 9) / 16), borderRadius: r }]}>
        <Artwork art={sermon} width={width} radius={r} fallback={sermon.collection} />
        {/* Decorative: the time left is said in words on the card. */}
        <View testID="progress-bar" style={styles.track} {...web({ "aria-hidden": true })}>
          <View style={[styles.fill, { width: `${watched}%` }]} />
        </View>
        <View style={styles.chip}>
          <T style={styles.chipText} numberOfLines={1} maxFontSizeMultiplier={textCap.display}>
            {left}
          </T>
        </View>
      </View>
      <T style={styles.title} numberOfLines={1}>
        {title}
      </T>
    </Tap>
  );
});

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  header: { marginBottom: 10 },
  rail: { paddingHorizontal: 24, gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, rowGap: 16, paddingHorizontal: 24 },
  art: { overflow: "hidden" },
  track: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: c.artTrack,
  },
  fill: { height: 4, backgroundColor: c.white },
  chip: {
    position: "absolute",
    left: 8,
    bottom: 11,
    backgroundColor: c.scrim,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  chipText: { fontFamily: font.bold, fontSize: 11.5, lineHeight: 14, color: c.white, ...tabular },
  title: { ...type.cardTitle, color: c.text, marginTop: 8 },
});
