import { router, type Href } from "expo-router";
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
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import { eventLine, headline } from "../../data/display";
import { fromTopics, sampleSermons, type Sermon } from "../../data/sermons";
import { useMyTopics, type Topic } from "../../learning";
import { useReducedMotion } from "../../motion";
import { useGo, usePageTitle } from "../../navigation";
import { Artwork, ItalicTitle } from "../../kit";
import { PathSuggestions } from "../../paths/Suggestions";
import { radius, shadows, space, textCap, type } from "../../theme";
import { topicIcon } from "../../topics";
import { Icon, SermonTitle, T, Tap, TextButton, c, nowrap, s, sermonLabel, web } from "../../ui";

/** The best match for their first topic it can (as Home's rail picks), or the latest sermon. */
function recommend(list: Sermon[], topics: readonly Topic[]): Sermon {
  const sermons = list.length ? list : sampleSermons;
  const [best] = fromTopics(
    sermons,
    topics.map((topic) => topic.id),
    () => false,
    1,
  );
  return best ?? sermons[0];
}

/**
 * The end of onboarding: a quiet confirmation, their topics, one sermon to
 * start with and the paths for their topics. Starting the sermon closes
 * onboarding and plays it; a path closes it and opens the path.
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
  usePageTitle(title);
  const { sermons } = useCatalogue();
  const mine = useMyTopics();
  const sermon = recommend(sermons, mine);
  // Its topic, when it's one of theirs.
  const kicker = mine.find((topic) => topic.id === sermon.topic?.id)?.label;
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

  const openPath = (href: Href) =>
    go.run(async () => {
      await account.finishWelcome();
      await finish();
      setTimeout(() => router.navigate(href), Platform.OS === "web" ? 60 : 450);
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
        <ItalicTitle
          text={title}
          italicLast={!!first}
          accessibilityRole="header"
          {...web({ "aria-level": 1 })}
          style={styles.title}
          maxFontSizeMultiplier={textCap.display}
        />
        {mine.length > 0 && <TopicChips topics={mine} />}
      </View>

      <View style={{ gap: space.md }}>
        <T style={[s.lead, styles.caption]}>Here’s a place to start.</T>
        {/* Looks like the app's other sermon cards, so it does what they do:
            the same action as the button below. */}
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`${playable ? "Start watching" : "View sermon"}: ${sermonLabel(sermon)}`}
          onPress={start}
          feedback="scaleLarge"
          style={styles.card}
          testID="done-recommended"
        >
          <Artwork
            art={sermon}
            radius={14}
            chip={sermon.duration || null}
            fallback={sermon.collection}
            priority="high"
          />
          <View style={styles.cardBody}>
            {kicker ? <T style={styles.kicker}>{kicker}</T> : null}
            <SermonTitle list title={headline(sermon)} numberOfLines={0} />
            <T style={styles.meta}>
              {[eventLine(sermon), nowrap(sermon.date)].filter(Boolean).join(" · ")}
            </T>
          </View>
        </Tap>
      </View>

      <PathSuggestions onOpen={openPath} />
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

/** The topics they picked, as quiet labels (sand, no edge: not buttons). */
function TopicChips({ topics }: { topics: readonly Topic[] }) {
  return (
    <View
      style={styles.chips}
      accessible={Platform.OS !== "web"}
      accessibilityLabel={`Your topics: ${topics.map((topic) => topic.label).join(", ")}`}
      {...web({ role: "list", "aria-label": "Your topics" })}
    >
      {topics.map((topic) => (
        <View key={topic.id} style={styles.chip} {...web({ role: "listitem" })}>
          <Icon name={topicIcon(topic.id)} size={14} color={c.accent} />
          <T style={styles.chipLabel}>{topic.label}</T>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "center", gap: space.lg, paddingTop: space.lg },
  title: { ...type.question, textAlign: "center" },
  kicker: { ...type.overline, color: c.gold },
  meta: { ...type.meta, color: c.muted },
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
    backgroundColor: c.feature,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipLabel: { ...type.chip, color: c.text },
  caption: { textAlign: "center" },
  // A white card lifted off the ivory page, as search results are.
  card: {
    borderRadius: radius.r22,
    backgroundColor: c.surface,
    boxShadow: shadows.card,
    padding: 12,
  },
  cardBody: { paddingHorizontal: 6, paddingTop: 14, paddingBottom: 6, gap: 4 },
});
