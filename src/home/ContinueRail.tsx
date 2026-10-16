import { memo, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useWatchProgress } from "../auth/AccountProvider";
import type { WatchProgress } from "../auth/types";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { headline } from "../data/display";
import type { Sermon } from "../data/sermons";
import { Artwork, SectionHeader } from "../kit";
import { fraction, resumePoint, timeLeft } from "../player/progress";
import { artRadius, space } from "../theme";
import { SermonRow, Tap } from "../ui";

/** Tiles in the rail; "See all" lists every one. */
const RAIL = 6;
const TILE = 176;

type Item = { sermon: Sermon; progress: WatchProgress };

/**
 * The signed-in viewer's unfinished sermons, most recently watched first.
 * In the rail, as the concept draws them: the artwork alone, with the time
 * left on it and a bar along its bottom edge (the poster carries its own
 * title; each tile still says it to screen readers). "See all" lists every
 * one in place, with titles. A tile opens the sermon and resumes it. Hidden
 * for guests and when there's nothing to continue; today's path sermon is
 * left out (the path card above plays it).
 */
export const ContinueRail = memo(function ContinueRail({
  exclude,
  onWatch,
}: {
  /** Today's path sermon, already on the path card. */
  exclude?: string | null;
  onWatch: (id: string) => void;
}) {
  // Empty for guests.
  const { progress: watched } = useWatchProgress();
  const { find } = useCatalogue();
  const { fontScale } = useWindowDimensions();
  const [all, setAll] = useState(false);
  const items = useMemo<Item[]>(
    () =>
      [...watched]
        .filter((p) => resumePoint(p) > 0 && p.sermonId !== exclude)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((progress) => ({ progress, sermon: find(progress.sermonId) }))
        .filter((item): item is Item => !!item.sermon),
    [watched, exclude, find],
  );
  // The same while a save only moves a tile's bar, so the header stays put.
  const count = items.length;
  const action = useMemo(
    () =>
      count > 1
        ? {
            label: all ? "Show less" : "See all",
            onPress: () => setAll((was) => !was),
            hint: all
              ? "Shows them in a row again"
              : `Lists all ${count} sermons you’re part way through`,
          }
        : undefined,
    [all, count],
  );
  if (!items.length) return null;

  const tile = Math.round(TILE * Math.min(1.3, Math.max(1, fontScale)));
  return (
    <View testID="continue-watching" style={styles.section}>
      <SectionHeader
        title="Continue watching"
        action={action}
        inset={24}
        style={styles.header}
      />
      {all ? (
        <View style={styles.list} testID="continue-all">
          {items.map((item) => (
            <ContinueRow key={item.sermon.id} {...item} onWatch={onWatch} />
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
          {items.slice(0, RAIL).map((item) => (
            <ContinueTile key={item.sermon.id} {...item} width={tile} onWatch={onWatch} />
          ))}
        </ScrollView>
      )}
    </View>
  );
});

// A save (every 15 seconds while a sermon plays) re-renders only that
// sermon's tile or row.
const ContinueRow = memo(function ContinueRow({
  sermon,
  progress,
  onWatch,
}: Item & { onWatch: (id: string) => void }) {
  return (
    <SermonRow
      testID="continue-card"
      sermon={sermon}
      kicker={null}
      progress={fraction(progress)}
      detail={timeLeft(progress)}
      hint="Resumes the sermon where you left off"
      onPress={() => onWatch(sermon.id)}
    />
  );
});

const ContinueTile = memo(function ContinueTile({
  sermon,
  progress,
  width,
  onWatch,
}: Item & { width: number; onWatch: (id: string) => void }) {
  const left = timeLeft(progress);
  return (
    <Tap
      testID="continue-card"
      accessibilityRole="button"
      accessibilityLabel={`${headline(sermon)}. ${left}.`}
      accessibilityHint="Resumes the sermon where you left off"
      onPress={() => onWatch(sermon.id)}
      unstable_pressDelay={60}
      feedback="scaleLarge"
      style={{ width }}
    >
      <Artwork
        art={sermon}
        width={width}
        radius={artRadius(width)}
        chip={left}
        chipAt="start"
        progress={fraction(progress)}
        fallback={sermon.collection}
      />
    </Tap>
  );
});

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  header: { marginBottom: 10 },
  rail: { paddingHorizontal: 24, gap: 12 },
  list: { paddingHorizontal: 24, gap: space.lg },
});
