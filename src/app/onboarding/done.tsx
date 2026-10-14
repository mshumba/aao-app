import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useAccount } from "../../auth/AccountProvider";
import { useFinishFlow, useGate } from "../../auth/gate";
import { setPendingIntent } from "../../auth/intent";
import { FlowButton, FlowScreen } from "../../auth/ui";
import { CategoryId, getCategory } from "../../data/categories";
import { eventLine, headline } from "../../data/display";
import { Sermon, sermonCategoryIds, sermons } from "../../data/sermons";
import { useReducedMotion } from "../../motion";
import { useGo } from "../../navigation";
import { font, radius, space, type } from "../../theme";
import {
  Heading,
  Icon,
  SermonTitle,
  T,
  TextButton,
  Thumbnail,
  c,
  nowrap,
  s,
  sermonLabel,
  topicLabels,
  web,
} from "../../ui";

/** The first sermon in one of their topics, or the latest one. */
function recommend(interests: CategoryId[]): { sermon: Sermon; lead?: CategoryId } {
  for (const sermon of sermons) {
    const match = sermonCategoryIds(sermon).find((id) => interests.includes(id));
    if (match) return { sermon, lead: match };
  }
  return { sermon: sermons[0] };
}

/**
 * The end of onboarding: a quiet confirmation, their topics, and one sermon
 * to start with. Starting it closes onboarding and plays it.
 */
export default function OnboardingDone() {
  const account = useAccount();
  const gate = useGate();
  const go = useGo();
  const finish = useFinishFlow();
  const live = useReducedMotion();
  const [reduced] = useState(live);

  const first = account.displayName?.trim().split(/\s+/)[0];
  const title = first ? `You’re all set, ${first}` : "You’re all set";
  const { sermon, lead } = recommend(account.interests);
  const kicker = topicLabels(sermon, lead).slice(0, 2).join(" · ");
  // Signed in, or a guest when playback is open to guests.
  const playable = gate.canWatch(sermon.id);

  const start = () =>
    go.run(async () => {
      await account.finishWelcome();
      if (playable) {
        // Carried out once onboarding has closed: opens the sermon, plays it.
        setPendingIntent({ kind: "watch", sermonId: sermon.id });
        await finish();
        return;
      }
      // A guest who can't watch yet: the sermon's page explains what
      // watching needs.
      await finish();
      setTimeout(
        () => router.navigate({ pathname: "/sermon/[id]", params: { id: sermon.id } }),
        Platform.OS === "web" ? 60 : 450,
      );
    });

  const home = () =>
    go.run(async () => {
      await account.finishWelcome();
      await finish();
    });

  return (
    <FlowScreen
      leading="none"
      footer={
        <>
          <FlowButton
            label={playable ? "Start watching" : "View sermon"}
            icon={playable ? "play" : undefined}
            testID="done-start-watching"
            onPress={start}
          />
          <TextButton label="Go to Home" testID="done-home" onPress={home} />
        </>
      }
    >
      <View style={styles.top}>
        <Check reduced={reduced} />
        <Heading level={1} style={styles.title} maxFontSizeMultiplier={1.6}>
          {title}
        </Heading>
        {account.interests.length > 0 && <TopicChips ids={account.interests} />}
      </View>

      <View style={{ gap: space.md }}>
        <T style={s.lead}>Here’s a place to start.</T>
        <View
          style={styles.card}
          // One stop for screen readers on native; a labelled group on web,
          // where an accessible View would also take keyboard focus.
          accessible={Platform.OS !== "web"}
          accessibilityLabel={`Recommended: ${sermonLabel(sermon, lead)}`}
          {...web({ role: "group", "aria-label": "Recommended sermon" })}
        >
          <Thumbnail sermon={sermon} duration />
          <View style={styles.cardBody}>
            {kicker ? <T style={s.kicker}>{kicker}</T> : null}
            <SermonTitle title={headline(sermon)} style={styles.cardTitle} />
            <T style={s.meta}>
              {eventLine(sermon)} · {nowrap(sermon.date)}
            </T>
          </View>
        </View>
      </View>
    </FlowScreen>
  );
}

/**
 * The flow's one celebration: a navy ring and check on white that springs
 * in once. Under Reduce Motion it fades in instead.
 */
function Check({ reduced }: { reduced: boolean }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(
      reduced
        ? withTiming(1, { duration: 250, easing: Easing.bezier(0.23, 1, 0.32, 1) })
        : withDelay(120, withSpring(1, { duration: 550, dampingRatio: 0.6 })),
    );
  }, [progress, reduced]);
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: interpolate(p, [0, 0.5], [0, 1], Extrapolation.CLAMP),
      transform: [{ scale: reduced ? 1 : interpolate(p, [0, 1], [0.8, 1]) }],
    };
  });
  return (
    <Animated.View style={[styles.check, style]}>
      <Icon name="checkmark" size={36} color={c.accent} />
    </Animated.View>
  );
}

/** The topics they picked, as quiet tags. */
function TopicChips({ ids }: { ids: CategoryId[] }) {
  const labels = ids.map((id) => getCategory(id)?.label).filter(Boolean) as string[];
  return (
    <View
      style={styles.chips}
      accessible={Platform.OS !== "web"}
      accessibilityLabel={`Your topics: ${labels.join(", ")}`}
      {...web({ role: "list", "aria-label": "Your topics" })}
    >
      {ids.map((id) => {
        const category = getCategory(id);
        if (!category) return null;
        return (
          <View key={id} style={styles.chip} {...web({ role: "listitem" })}>
            <Icon name={category.icon} size={14} color={c.accent} />
            <T style={styles.chipLabel}>{category.label}</T>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "center", gap: space.lg, paddingTop: space.lg },
  title: { ...type.question, textAlign: "center" },
  check: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: c.accent,
    backgroundColor: c.surface,
    boxShadow: "0 8px 24px rgba(27, 30, 36, 0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space.sm,
  },
  chip: {
    minHeight: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipLabel: { ...type.label, fontSize: 14, lineHeight: 20 },
  // White on the ivory page, edged with a hairline rather than a shadow.
  card: {
    borderRadius: radius.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    overflow: "hidden",
  },
  cardBody: { padding: space.lg, gap: 6 },
  cardTitle: { fontFamily: font.bold, fontSize: 18, lineHeight: 24 },
});
