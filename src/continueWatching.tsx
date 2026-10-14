import { router } from "expo-router";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useAccount } from "./auth/AccountProvider";
import type { WatchProgress } from "./auth/types";
import { useCatalogue } from "./catalogue/CatalogueProvider";
import { headline } from "./data/display";
import type { Sermon } from "./data/sermons";
import { requestWatch, useGo } from "./navigation";
import { fraction, resumePoint, timeLeft } from "./player/progress";
import { usePlayerSession } from "./player/PlayerProvider";
import { font, radius, space } from "./theme";
import {
  ProgressBar,
  SectionHeading,
  SermonTitle,
  T,
  Tap,
  Thumbnail,
  c,
  s,
} from "./ui";

const MAX = 6;

/**
 * Home's "Continue watching" row: the signed-in viewer's unfinished sermons,
 * most recently watched first. A card resumes the sermon where they left
 * off. Hidden for guests and when there's nothing to continue.
 */
export function ContinueWatching() {
  const account = useAccount();
  const catalogue = useCatalogue();
  const { width } = useWindowDimensions();
  if (!account.user) return null;
  const items = [...account.progress]
    .filter((progress) => resumePoint(progress) > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((progress) => ({
      progress,
      sermon: catalogue.find(progress.sermonId),
    }))
    .filter((item): item is { progress: WatchProgress; sermon: Sermon } => !!item.sermon)
    .slice(0, MAX);
  if (!items.length) return null;
  // About a card and a half on a phone, so the row reads as scrollable.
  const card = Math.round(
    Math.min(280, Math.max(200, (Math.min(width, 760) - space.gutter * 2) * 0.66)),
  );
  return (
    <View testID="continue-watching" style={styles.section}>
      <SectionHeading style={styles.heading}>Continue watching</SectionHeading>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bleed}
        contentContainerStyle={styles.track}
      >
        {items.map(({ progress, sermon }) => (
          <ContinueCard
            key={sermon.id}
            sermon={sermon}
            progress={progress}
            width={card}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function ContinueCard({
  sermon,
  progress,
  width,
}: {
  sermon: Sermon;
  progress: WatchProgress;
  width: number;
}) {
  const go = useGo();
  const session = usePlayerSession();
  const left = timeLeft(progress);
  return (
    <Tap
      testID="continue-card"
      accessibilityRole="button"
      accessibilityLabel={`${headline(sermon)}. ${left}.`}
      accessibilityHint="Resumes the sermon where you left off"
      onPress={() =>
        go.run(() => {
          // Already loaded (docked): just open it where it is.
          if (session.sermon?.id !== sermon.id) requestWatch(sermon.id);
          router.push({ pathname: "/sermon/[id]", params: { id: sermon.id } });
        })
      }
      unstable_pressDelay={60}
      feedback="scaleLarge"
      style={[styles.card, { width }]}
    >
      <View style={styles.clip}>
        <Thumbnail sermon={sermon} style={styles.art} />
        <ProgressBar value={fraction(progress)} />
        <View style={styles.body}>
          <SermonTitle
            title={headline(sermon)}
            numberOfLines={2}
            style={styles.title}
          />
          <T style={s.meta}>{left}</T>
        </View>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  // The first section on Home, so it sits closer under the search field
  // than sections do under each other, with the usual gap before Featured.
  section: { marginBottom: space.xxl },
  heading: { marginTop: space.sm },
  // Runs to the screen's edges, so cards scroll in from beyond the column.
  bleed: { marginHorizontal: -space.gutter },
  track: { paddingHorizontal: space.gutter, gap: space.md },
  // White with a hairline, like the other cards on the ivory page.
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
  },
  clip: { borderRadius: radius.lg - 1, overflow: "hidden" },
  art: { borderWidth: 0 },
  body: { padding: space.md, gap: space.xs },
  title: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
});
