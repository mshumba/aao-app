import { memo } from "react";
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import type { PathStatus } from "../learning/types";
import { c, radius, shadows, tabular, textCap, type } from "../theme";
import { Icon, T, Tap, nowrap, web } from "../ui";
import { type ArtSource } from "./Artwork";
import { CardFan } from "./CardFan";
import { PathProgress } from "./PathProgress";
import { ItalicTitle, Kicker, TrustLine } from "./text";
import { Wash } from "./Wash";
import { spokenKicker, spokenText } from "./time";

// ---- PathCardNavy ------------------------------------------------------------------

type HomeCard = {
  /** Home's "Your path" card. */
  variant: "home";
  name: string;
  italic?: string | null;
  day: number;
  total: number;
  done: readonly number[];
  /** 0 to 1: how far through today's sermon. */
  partial?: number;
  /** Front first: today's sermon, then the two before it. */
  fan: readonly (ArtSource | null | undefined)[];
  /** "Can You Lose Your Salvation?" (the headline; "Today · " is added). */
  todayTitle: string;
  /** "48 min left · 2 of 7 done". */
  todayMeta: string;
  /** Defaults to "Your path · Day 3 of 7". */
  kicker?: string;
  /** Before the title in the play row: "Today" (default), or "Day 1" before starting. */
  todayLead?: string;
  /** Read before the play row's title ("Play today, day 3"). */
  playLabel?: string;
  /**
   * Who set the order, under the name (a path not started yet): "Order set
   * by the ministry" when it's published; a draft shows nothing (TrustLine
   * returns null, so there's no "Draft" label anywhere).
   */
  trust?: PathStatus;
  /** Opens the path. */
  onOpen: () => void;
  /** Plays today's day. */
  onPlay: () => void;
};

type CompactCard = {
  /** Search's "A path for this". */
  variant: "compact";
  name: string;
  /** "7 messages · You're on Day 3". */
  meta: string;
  fan: readonly (ArtSource | null | undefined)[];
  kicker?: string;
  onPress: () => void;
};

export type PathCardNavyProps = (HomeCard | CompactCard) & {
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The approved concept's dark path cards: near-black with navy light, a fan
 * of the path's artwork, the name in serif. "home" shows progress and a
 * "play today" panel; "compact" is one 72pt row that opens the path.
 */
export const PathCardNavy = memo(function PathCardNavy(props: PathCardNavyProps) {
  if (props.variant === "compact") {
    const { name, meta, fan, kicker = "A path for this", onPress, testID, style } = props;
    return (
      <Tap
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${kicker}. ${name}. ${spokenText(spokenKicker(meta))}`}
        accessibilityHint="Opens the path"
        onPress={onPress}
        feedback="scaleLarge"
        style={[styles.compact, style]}
      >
        <Wash kind="pathCompact" />
        <CardFan sermons={fan} size="compact" />
        <View style={styles.compactText}>
          <Kicker tone="onMedia" small>
            {kicker}
          </Kicker>
          <CompactLines name={name} meta={meta} />
        </View>
        <Icon name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
      </Tap>
    );
  }

  return <HomePathCard {...props} />;
});

/** The compact card's name and meta: two lines each, three for the name at large text. */
function CompactLines({ name, meta }: { name: string; meta: string }) {
  const { fontScale } = useWindowDimensions();
  return (
    <>
      <T style={styles.compactName} numberOfLines={fontScale >= 1.3 ? 3 : 2}>
        {name}
      </T>
      <T style={styles.compactMeta} numberOfLines={2}>
        {meta}
      </T>
    </>
  );
}

function HomePathCard(props: HomeCard & { testID?: string; style?: StyleProp<ViewStyle> }) {
  const {
    name,
    italic,
    day,
    total,
    done,
    partial = 0,
    fan,
    todayTitle,
    todayMeta,
    todayLead = "Today",
    playLabel,
    trust,
    onOpen,
    onPlay,
    testID,
    style,
  } = props;
  const { width, fontScale } = useWindowDimensions();
  const big = fontScale > 1.3;
  // A narrow phone or large text: a smaller fan; at large text it sits above the words.
  const small = width < 360 || big;
  const spoken = props.kicker ?? `Your path · Day ${day} of ${total}`;
  // "Day 3 of 7" never breaks across lines.
  const kicker = props.kicker ?? `Your path · ${nowrap(`Day ${day} of ${total}`)}`;
  return (
    <View testID={testID} style={[styles.home, style]} {...web({ dataSet: { dark: "true" } })}>
      <Wash kind="pathCard" />
      <Tap
        accessibilityRole="button"
        accessibilityLabel={`${spokenKicker(spoken)}. ${name}. ${
          trust ? "" : `${done.length} of ${total} done.`
        }`.trim()}
        accessibilityHint="Opens the path"
        onPress={onOpen}
        feedback="scaleLarge"
      >
        <View style={[styles.homeRow, big && styles.homeStack]}>
          <CardFan sermons={fan} size="card" scale={small ? 0.78 : 1} />
          <View style={[styles.homeText, big && styles.homeTextStacked]}>
            <Kicker tone="onMedia">{kicker}</Kicker>
            <ItalicTitle
              text={name}
              italic={italic}
              style={[type.pathName, styles.homeName]}
              maxFontSizeMultiplier={textCap.section}
            />
            {trust ? <TrustLine status={trust} tone="dark" style={styles.homeTrust} /> : null}
          </View>
        </View>
        <PathProgress total={total} done={done} current={day} partial={partial} tone="onDark" style={styles.homeSegs} />
      </Tap>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={`${playLabel ?? `Play today, day ${day}`}. ${todayTitle}. ${spokenText(spokenKicker(todayMeta))}`}
        onPress={onPlay}
        feedback="scaleLarge"
        style={styles.next}
      >
        <View style={styles.playDisc}>
          <View style={{ marginLeft: 2 }}>
            <Icon name="play" size={17} color={c.accent} />
          </View>
        </View>
        <View style={styles.nextText}>
          {/* A sermon's headline is never cut off: two lines when it needs them. */}
          <T style={styles.nextTitle} numberOfLines={big ? 3 : 2}>
            {todayLead} · {todayTitle}
          </T>
          <T style={styles.nextMeta} numberOfLines={big ? 2 : 1}>
            {todayMeta}
          </T>
        </View>
      </Tap>
    </View>
  );
}

// ---- PartOfPathRow -----------------------------------------------------------------

/**
 * On a sermon's page when it's a day of your path: a sand bar with a small
 * fan, "Part of your path · Day 3 of 7", the path's name and its progress.
 */
export const PartOfPathRow = memo(function PartOfPathRow({
  name,
  day,
  total,
  done,
  partial = 0,
  fan,
  kicker,
  onPress,
  testID,
  style,
}: {
  name: string;
  day: number;
  total: number;
  done: readonly number[];
  partial?: number;
  fan: readonly (ArtSource | null | undefined)[];
  /** Defaults to "Part of your path · Day 3 of 7". */
  kicker?: string;
  onPress: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const spoken = kicker ?? `Part of your path · Day ${day} of ${total}`;
  // "Day 3 of 7" never breaks, nor does the name leave its last word alone.
  const k = spoken.replace(/Day \d+ of \d+/, (m) => nowrap(m));
  const shownName = name.replace(/ (\S+)$/, "\u00A0$1");
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${spokenKicker(spoken)}. ${name}. ${done.length} of ${total} done.`}
      accessibilityHint="Opens the path"
      onPress={onPress}
      feedback="scaleLarge"
      style={[styles.partOf, style]}
    >
      <CardFan sermons={fan} size="row" />
      <View style={styles.partOfText}>
        <Kicker tone="onFeature">{k}</Kicker>
        <T style={styles.partOfName}>{shownName}</T>
        <PathProgress
          total={total}
          done={done}
          current={day}
          partial={partial}
          tone="onFeature"
          thickness={3}
          style={{ marginTop: 8 }}
        />
      </View>
      <Icon name="chevron-forward" size={20} color={c.mutedOnFeature} />
    </Tap>
  );
});

const styles = StyleSheet.create({
  home: {
    borderRadius: radius.r26,
    backgroundColor: c.media,
    overflow: "hidden",
    paddingTop: 14,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 12,
    boxShadow: shadows.pathCard,
  },
  homeRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  homeStack: { flexDirection: "column", alignItems: "flex-start", gap: 10 },
  homeText: { flex: 1, minWidth: 0 },
  homeTextStacked: { flex: 0, alignSelf: "stretch" },
  homeTrust: { marginTop: 6 },
  homeName: { color: c.white, marginTop: 6 },
  homeSegs: { marginTop: 12 },
  next: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: radius.r18,
    backgroundColor: c.onMediaPanel,
    borderWidth: 1,
    borderColor: c.onMediaHairline,
  },
  playDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.white,
    alignItems: "center",
    justifyContent: "center",
  },
  nextText: { flex: 1, minWidth: 0 },
  nextTitle: { ...type.cardTitle, color: c.white },
  nextMeta: { ...type.meta, color: c.onMediaMuted, marginTop: 2, ...tabular },
  compact: {
    minHeight: 72,
    borderRadius: radius.r20,
    backgroundColor: c.media,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 9,
  },
  compactText: { flex: 1, minWidth: 0 },
  compactName: { ...type.cardTitle, color: c.white, marginTop: 3 },
  compactMeta: { ...type.meta, color: c.onMediaMuted, marginTop: 2 },
  partOf: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.feature,
    borderRadius: radius.r20,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    paddingRight: 14,
  },
  partOfText: { flex: 1, minWidth: 0 },
  partOfName: { ...type.cardTitle, color: c.text, marginTop: 2 },
});
