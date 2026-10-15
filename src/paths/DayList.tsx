import { memo } from "react";
import { StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { Artwork, clockText, spokenTime, type ArtSource } from "../kit";
import { Spark } from "../kit/Spark";
import { c, font, radius, shadows, tabular, textCap, type } from "../theme";
import { Icon, T, Tap, web } from "../ui";
import type { DayState } from "./model";

/**
 * The path page's day timeline (concept screen 03). A local variant of the
 * kit's DayTimeline: the same drawing, plus a kicker the screen words
 * ("Day 1 · Start here" before a path is started), one composed
 * accessibility label per row with times read as words, hints, and the key
 * moment's title kept exactly as the editor wrote it.
 */
export type DayItem = {
  day: number;
  /** "Day 1 · Lay aside every weight", "Day 3 · Today", "Day 4 · Opens after Day 3". */
  kicker: string;
  /** The sermon's headline, never edited. */
  title: string;
  state: DayState;
  /** An upcoming day waiting for an earlier one: a lock instead of its number. */
  locked?: boolean;
  /** Today's artwork. */
  art?: ArtSource | null;
  /** Today: "48 min left" or "16-min focus from 1:21:14". */
  meta?: string;
  /** Today: 0 to 1 through the focus segment. */
  progress?: number;
  keyMoment?: { at: number; title: string };
  /** The title is still loading: a sand bar holds its line. */
  pending?: boolean;
  /** The whole row in words, read as one element. */
  label: string;
  hint?: string;
  onPress?: () => void;
  onKeyMoment?: () => void;
};

const NODE = 36;
/** Rows sit 44pt apart (the concept's 36pt node and 8pt gap); today's card adds its own 8. */
const TODAY_GAP = 8;

const DayRow = memo(function DayRow({
  item,
  connector,
}: {
  item: DayItem;
  /** The line down to the next day: navy after a done day, else the track. */
  connector: "none" | "done" | "track";
}) {
  const { day, kicker, title, state, locked, pending, art, meta, progress = 0, keyMoment, label, hint, onPress, onKeyMoment } = item;
  const { width, fontScale } = useWindowDimensions();
  const big = fontScale >= 1.3;
  const thumb = width < 360 ? 80 : 98;
  const titleText = pending ? (
    <View style={styles.titleGhost} />
  ) : null;

  const node = (
    <View
      // The row's label says the day; the number alone would be read twice.
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
      style={[
        styles.node,
        state === "done" && styles.nodeDone,
        state === "today" && styles.nodeToday,
        state === "upcoming" && styles.nodeNext,
      ]}
    >
      {state === "done" ? (
        <Icon name="checkmark" size={18} color={c.onAccent} />
      ) : state === "upcoming" && locked ? (
        <Icon name="lock-closed-outline" size={15} color={c.muted} />
      ) : (
        <T
          style={[styles.nodeNumber, state === "upcoming" && { color: c.muted }]}
          maxFontSizeMultiplier={1.2}
        >
          {day}
        </T>
      )}
    </View>
  );

  const line =
    connector !== "none" ? (
      <View
        style={[
          styles.connector,
          { bottom: -(state === "today" ? TODAY_GAP : 0) - NODE / 2 },
          { backgroundColor: connector === "done" ? c.accent : c.border },
        ]}
      />
    ) : null;

  if (state === "today")
    return (
      <View style={[styles.row, styles.rowToday]} testID={`path-day-${day}`}>
        {line}
        {node}
        <View style={styles.card}>
          <Tap
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={hint}
            onPress={onPress}
            disabled={!onPress}
            feedback="scaleLarge"
          >
            <View style={[styles.cardRow, big && styles.cardStack]}>
              <Artwork art={art} width={big ? undefined : thumb} radius={10} priority="high" />
              <View style={styles.cardText}>
                <T
                  style={[type.overline, styles.kickerTight, { color: c.gold }]}
                  maxFontSizeMultiplier={textCap.section}
                >
                  {kicker}
                </T>
                {titleText ?? <T style={[type.cardTitle, styles.title]}>{title}</T>}
                {meta ? <T style={[type.meta, styles.muted, tabular, styles.meta]}>{meta}</T> : null}
              </View>
            </View>
            {/* How far through today's focus; nothing to show before it's begun. */}
            {progress > 0 ? (
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.min(1, progress) * 100}%` }]} />
              </View>
            ) : null}
          </Tap>
          {keyMoment ? (
            <Tap
              accessibilityRole="button"
              accessibilityLabel={`Key moment at ${spokenTime(keyMoment.at)}. ${keyMoment.title}`}
              accessibilityHint="Plays from the key moment"
              onPress={onKeyMoment}
              disabled={!onKeyMoment}
              feedback="dim"
              hitSlop={{ top: 4, bottom: 4 }}
              style={styles.key}
              testID={`path-day-${day}-key`}
            >
              <Spark size={14} />
              <T style={[type.meta, styles.muted, { flex: 1 }]} numberOfLines={2}>
                {"Key moment\u2002"}
                <Text style={styles.keyTime}>{clockText(keyMoment.at)}</Text>
                {"\u2002· "}
                {keyMoment.title}
              </T>
            </Tap>
          ) : null}
        </View>
      </View>
    );

  return (
    <Tap
      testID={`path-day-${day}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      disabled={!onPress}
      feedback="dim"
      style={styles.row}
    >
      {line}
      {node}
      <View style={styles.text}>
        <T
          style={[type.overline, styles.kickerTight, styles.muted]}
          numberOfLines={big ? 2 : 1}
          maxFontSizeMultiplier={textCap.section}
        >
          {kicker}
        </T>
        {titleText ?? (
          <T
            style={[type.cardTitle, styles.title, { color: state === "upcoming" ? c.muted : c.text }]}
            numberOfLines={big ? 3 : 1}
          >
            {title}
          </T>
        )}
      </View>
    </Tap>
  );
});

/** Days on a vertical line, navy through the days done. */
export const DayList = memo(function DayList({
  days,
  style,
}: {
  days: readonly DayItem[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      {days.map((d, i) => (
        <DayRow
          key={d.day}
          item={d}
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
    minHeight: 44,
  },
  rowToday: { marginBottom: TODAY_GAP },
  connector: {
    position: "absolute",
    pointerEvents: "none",
    left: NODE / 2 - 1,
    top: NODE / 2,
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
  text: { flex: 1, minWidth: 0, minHeight: NODE },
  title: { marginTop: 2 },
  meta: { marginTop: 2 },
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
  cardStack: { flexDirection: "column", gap: 10 },
  titleGhost: { height: 12, width: "72%", borderRadius: 4, backgroundColor: c.feature, marginTop: 5, marginBottom: 2 },
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
    // Drawn at the concept's size, still 36pt to touch.
    paddingBottom: 10,
    marginBottom: -10,
  },
  keyTime: { fontFamily: font.bold, color: c.accent, ...tabular },
});
