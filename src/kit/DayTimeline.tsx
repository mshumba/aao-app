import { memo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { c, font, radius, shadows, tabular, textCap, type } from "../theme";
import { Icon, T, Tap } from "../ui";
import { Artwork, type ArtSource } from "./Artwork";
import { clockText, spokenText, spokenTime } from "./time";

export type DayState = "done" | "today" | "upcoming";

export type DayRowProps = {
  day: number;
  /** The day's editorial line: "Lay aside every weight". */
  theme: string;
  /** The sermon's headline. */
  title: string;
  state: DayState;
  /** Upcoming days that wait for an earlier one: "Opens after Day 3" with a lock. */
  locked?: boolean;
  /** Which day it opens after (default: the day before). */
  opensAfter?: number;
  /** Today's artwork. */
  art?: ArtSource | null;
  /** Today: "48 min left". */
  left?: string;
  /** Today: how far through, 0 to 1. */
  progress?: number;
  /** Today: the key moment ("Key moment 53:44 · victory over sin"). */
  keyMoment?: { at: number; title: string };
  onPress?: () => void;
  /** Plays the key moment. */
  onKeyMoment?: () => void;
  /** The line down to the next day: navy after a done day, else the track. */
  connector?: "none" | "done" | "track";
  testID?: string;
};

const NODE = 36;
const ROW_GAP = 8;

/**
 * One day on a path's timeline. Done days have a navy check; today lifts
 * onto a white card with its art, time left and key moment; later days
 * show a lock and when they open.
 */
export const DayRow = memo(function DayRow({
  day,
  theme,
  title,
  state,
  locked = false,
  opensAfter,
  art,
  left,
  progress = 0,
  keyMoment,
  onPress,
  onKeyMoment,
  connector = "none",
  testID,
}: DayRowProps) {
  const after = opensAfter ?? day - 1;
  const kicker =
    state === "today"
      ? `Day ${day} · Today`
      : state === "upcoming" && locked
        ? `Day ${day} · Opens after Day ${after}`
        : `Day ${day} · ${theme}`;
  const spoken = [
    state === "today" ? `Day ${day}, today` : `Day ${day}`,
    state === "upcoming" && locked ? `Opens after day ${after}` : theme,
    title,
    state === "done" ? "Done" : null,
    state === "today" && left ? spokenText(left) : null,
  ]
    .filter(Boolean)
    .join(". ");

  const node = (
    <View
      style={[
        styles.node,
        state === "done" && styles.nodeDone,
        state === "today" && styles.nodeToday,
        state === "upcoming" && styles.nodeNext,
      ]}
    >
      {state === "done" ? (
        <Icon name="checkmark" size={18} color={c.onAccent} />
      ) : state === "today" ? (
        <T style={styles.nodeNumber} maxFontSizeMultiplier={1.2}>
          {day}
        </T>
      ) : locked ? (
        <Icon name="lock-closed-outline" size={15} color={c.muted} />
      ) : (
        <T style={[styles.nodeNumber, { color: c.muted }]} maxFontSizeMultiplier={1.2}>
          {day}
        </T>
      )}
    </View>
  );

  const line =
    connector !== "none" ? (
      <View
        style={[styles.connector, { backgroundColor: connector === "done" ? c.accent : c.border }]}
      />
    ) : null;

  if (state === "today")
    return (
      <View testID={testID} style={styles.row}>
        {line}
        {node}
        <View style={styles.card}>
          <Tap
            accessibilityRole="button"
            accessibilityLabel={spoken}
            accessibilityHint="Plays today's day"
            onPress={onPress}
            disabled={!onPress}
            feedback="scaleLarge"
          >
            <View style={styles.cardRow}>
              <Artwork art={art} width={98} radius={10} />
              <View style={styles.cardText}>
                <T style={[type.overline, styles.kickerTight, { color: c.gold }]} maxFontSizeMultiplier={textCap.section}>
                  {kicker}
                </T>
                <T style={[type.cardTitle, { marginTop: 2 }]}>{title}</T>
                {left ? <T style={[type.meta, styles.muted, tabular, { marginTop: 2 }]}>{left}</T> : null}
              </View>
            </View>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.min(1, Math.max(0, progress)) * 100}%` }]} />
            </View>
          </Tap>
          {keyMoment ? (
            <Tap
              accessibilityRole="button"
              accessibilityLabel={`Key moment at ${spokenTime(keyMoment.at)}. ${keyMoment.title}`}
              accessibilityHint="Plays from the key moment"
              onPress={onKeyMoment}
              disabled={!onKeyMoment}
              feedback="dim"
              style={styles.key}
            >
              <Icon name="sparkles" size={14} color={c.accent} />
              <T style={[type.meta, styles.muted, { flex: 1 }]} numberOfLines={2}>
                Key moment{" "}
                <Text style={styles.keyTime}>{clockText(keyMoment.at)}</Text>
                {" · "}
                {keyMoment.title.charAt(0).toLocaleLowerCase() + keyMoment.title.slice(1)}
              </T>
            </Tap>
          ) : null}
        </View>
      </View>
    );

  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      disabled={!onPress}
      feedback="dim"
      style={styles.row}
    >
      {line}
      {node}
      <View style={styles.text}>
        <T style={[type.overline, styles.kickerTight, styles.muted]} numberOfLines={1} maxFontSizeMultiplier={textCap.section}>
          {kicker}
        </T>
        <T
          style={[type.cardTitle, { marginTop: 2, color: state === "upcoming" ? c.muted : c.text }]}
          numberOfLines={1}
        >
          {title}
        </T>
      </View>
    </Tap>
  );
});

/**
 * A path's days on a vertical timeline, the line navy through the days
 * done. Pass rows without `connector`; it's worked out here.
 */
export const DayTimeline = memo(function DayTimeline({
  days,
  style,
}: {
  days: readonly Omit<DayRowProps, "connector">[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      {days.map((d, i) => (
        <DayRow
          key={d.day}
          {...d}
          connector={i === days.length - 1 ? "none" : d.state === "done" ? "done" : "track"}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: ROW_GAP,
    minHeight: 44,
  },
  connector: {
    position: "absolute",
    pointerEvents: "none",
    left: NODE / 2 - 1,
    top: NODE / 2,
    bottom: -ROW_GAP - NODE / 2,
    width: 2,
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  nodeDone: { backgroundColor: c.accent },
  nodeToday: {
    backgroundColor: c.white,
    boxShadow: `inset 0 0 0 2.5px ${c.accent}, 0 0 0 5px rgba(31,58,95,0.12)`,
  },
  nodeNext: { backgroundColor: c.bg, boxShadow: `inset 0 0 0 1.5px ${c.nodeRing}` },
  nodeNumber: { fontFamily: font.extrabold, fontSize: 13, lineHeight: 16, color: c.accent, ...tabular },
  text: { flex: 1, minWidth: 0 },
  kickerTight: { letterSpacing: 1.2 },
  muted: { color: c.muted },
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: c.surface,
    borderRadius: radius.r18,
    padding: 10,
    marginTop: -4,
    boxShadow: shadows.lifted,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  cardText: { flex: 1, minWidth: 0 },
  bar: { height: 3, borderRadius: 2, backgroundColor: c.border, marginTop: 9, overflow: "hidden" },
  barFill: { height: 3, backgroundColor: c.accent },
  key: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: c.divider,
    minHeight: 36,
  },
  keyTime: { fontFamily: font.bold, color: c.accent, ...tabular },
});
