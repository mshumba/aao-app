import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Artwork, RoundButton, clockText, spokenTime, type ArtSource } from "../kit";
import { Spark } from "../kit/Spark";
import { c, font, fontSize, radius, shadows, space, tabular, textCap, type } from "../theme";
import { Icon, T, Tap, moveFocus, nowrap, web, type WebKey } from "../ui";
import type { DayState } from "./model";

/**
 * The path page's days, as the owner asked (16 October 2026): "see only
 * your day and the next day, and if you want to scroll ahead, scroll
 * ahead". A row of cards that moves a card at a time and opens on today's
 * (Day 1 before starting; Day 1 again once every day is done), the next day
 * showing at the edge and the days done off to the left. Each card leads
 * with the day's theme in serif under a short "Day 3 · Today"; the sermon it
 * plays sits below, its headline smaller beside the artwork, with its
 * length. Today's card adds how far through the sermon you are, and its key
 * moment plays from that moment; under the row, a quiet "Mark Day 3 done".
 * Each card is one button to assistive tech, its label composed by the
 * screen; on the web the arrow keys move between cards, and on a wide
 * window arrows under the row, at the column's end, scroll it.
 */
export type DayItem = {
  day: number;
  /** "Day 3" or "Teaching 3". */
  name: string;
  /** After the name: "Today", "Start here", "Done", "Opens after Day 3"; none for a day ahead. */
  status: string | null;
  /** The day's line, as the editor wrote it: "You are dead to sin". */
  theme: string;
  /** The sermon's headline, never edited. */
  title: string;
  /** The title is still loading: a sand bar holds its line. */
  pending?: boolean;
  /** "2 hr 16 min", or today's "48 min left"; empty while it isn't known. */
  meta: string;
  state: DayState;
  /** The day waiting for today's: a lock beside its name. */
  locked?: boolean;
  art: ArtSource;
  /** Today: 0 to 1 through the sermon. */
  progress?: number;
  keyMoment?: { at: number; title: string };
  /** The whole card in words, read as one element. */
  spoken: string;
  hint?: string;
  onPress?: () => void;
  /** Today's key moment is a button of its own; another day's is part of its card. */
  onKeyMoment?: () => void;
};

const GAP = 12;
/** How much of the next card shows at the row's edge on a phone. */
const PEEK = 40;
/** On a wide window, today and the next day side by side, the one after peeking. */
const MAX_CARD = 340;
/** Arrows under the row from this width (a mouse, usually). */
const ARROWS_FROM = 700;

/**
 * Web: the browser snaps the row a card at a time (snapToInterval is
 * native only), each card's edge on the gutter.
 */
const snapRow = web({ scrollSnapType: "x mandatory", scrollPaddingLeft: space.gutter }) as ViewStyle;
const snapCard = web({ scrollSnapAlign: "start" }) as ViewStyle;

/** A card's width in a column this wide. */
function cardWidth(column: number, big: boolean) {
  return Math.round(Math.min(big ? 400 : MAX_CARD, column - space.gutter - GAP - (big ? 24 : PEEK)));
}

export const DayCarousel = memo(function DayCarousel({
  days,
  focus,
  column,
  active = true,
  markDone,
  style,
}: {
  days: readonly DayItem[];
  /** The day the row opens on, and moves to when it changes. */
  focus: number;
  /**
   * Whether the page is in front. A day done while the sermon's page covers
   * this one moves the row once it's back (a hidden row can't scroll).
   */
  active?: boolean;
  /**
   * The page's column. The row starts on it, its cards on the column's
   * gutter, and on a wide window runs on to the window's edge.
   */
  column: number;
  /** Today's quiet "Mark Day 3 done", under the row. */
  markDone?: { day: number; label: string; hint?: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}) {
  const { width, fontScale } = useWindowDimensions();
  const big = fontScale >= 1.3;
  const card = cardWidth(column, big);
  // Beside a centred column, the row's start: it runs on to the window's edge.
  const side = Math.max(0, (width - column) / 2);
  const step = card + GAP;
  const index = Math.max(0, days.findIndex((d) => d.day === focus));
  const offset = index * step;

  const scroller = useRef<ScrollView>(null);
  const x = useRef(offset);
  const nodes = useRef<(View | null)[]>([]);
  // Opens on today's card; slides to the new one when a day is done.
  const placed = useRef<number | null>(null);
  useEffect(() => {
    if (!active || placed.current === offset) return;
    scroller.current?.scrollTo({ x: offset, animated: placed.current != null });
    placed.current = offset;
  }, [offset, active]);

  // Artwork loads for the cards in sight and either side, then for the rest
  // as the row is scrolled to them.
  const [reach, setReach] = useState({ from: index - 1, to: index + 2 });
  const arrows = Platform.OS === "web" && column >= ARROWS_FROM;
  const [ends, setEnds] = useState({ start: index > 0, end: days.length > 1 });
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      x.current = contentOffset.x;
      const from = Math.floor(contentOffset.x / step) - 1;
      const to = Math.ceil((contentOffset.x + layoutMeasurement.width) / step) + 1;
      setReach((was) => (from < was.from || to > was.to ? { from: Math.min(from, was.from), to: Math.max(to, was.to) } : was));
      if (!arrows) return;
      const start = contentOffset.x > 4;
      const end = contentOffset.x + layoutMeasurement.width < contentSize.width - 4;
      setEnds((was) => (was.start === start && was.end === end ? was : { start, end }));
    },
    [step, arrows],
  );
  const by = (cards: number) => {
    const at = Math.round(x.current / step) + cards;
    scroller.current?.scrollTo({ x: Math.max(0, at) * step, animated: true });
  };

  // Web: the arrow keys move between the cards (focus scrolls them into view).
  const onKey = useCallback(
    (i: number, e: WebKey) => {
      const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -1;
      if (to < 0 || to >= days.length) return;
      e.preventDefault();
      moveFocus(nodes.current[to] ?? null);
    },
    [days.length],
  );
  const register = useCallback((i: number, node: View | null) => {
    nodes.current[i] = node;
  }, []);

  const mark = markDone ? (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={markDone.label}
      accessibilityHint={markDone.hint}
      onPress={markDone.onPress}
      feedback="dim"
      style={styles.mark}
      testID={`path-day-${markDone.day}-mark-done`}
    >
      <Icon name="checkmark-circle-outline" size={17} color={c.muted} />
      <T style={[type.meta, styles.muted]} maxFontSizeMultiplier={textCap.chip}>
        {markDone.label}
      </T>
    </Tap>
  ) : null;

  return (
    <View style={[{ marginLeft: side }, style]}>
      <View style={styles.rowFrame}>
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={step}
          snapToAlignment="start"
          disableIntervalMomentum
          contentOffset={{ x: offset, y: 0 }}
          onScroll={onScroll}
          scrollEventThrottle={32}
          style={snapRow}
          contentContainerStyle={styles.row}
          testID="path-days"
        >
          {days.map((d, i) => (
            <DayCard
              key={d.day}
              item={d}
              index={i}
              width={card}
              big={big}
              load={i >= reach.from && i <= reach.to}
              onKey={onKey}
              register={register}
            />
          ))}
        </ScrollView>
      </View>
      {arrows && (ends.start || ends.end) ? (
        // Under the row, at the column's end: on the cards they'd cover the artwork.
        // Each keeps its place while the other comes and goes.
        <View style={[styles.foot, { marginRight: side + space.gutter }]}>
          {mark}
          <View style={styles.arrows}>
            {ends.start ? (
              <RoundButton
                icon="chevron-back"
                label="Earlier days"
                tone="surface"
                iconSize={18}
                onPress={() => by(-1)}
              />
            ) : (
              <View style={styles.arrowSpace} />
            )}
            {ends.end ? (
              <RoundButton
                icon="chevron-forward"
                label="Later days"
                tone="surface"
                iconSize={18}
                onPress={() => by(1)}
              />
            ) : (
              <View style={styles.arrowSpace} />
            )}
          </View>
        </View>
      ) : (
        mark
      )}
    </View>
  );
});

const DayCard = memo(function DayCard({
  item,
  index,
  width,
  big,
  load,
  onKey,
  register,
}: {
  item: DayItem;
  index: number;
  width: number;
  big: boolean;
  load: boolean;
  onKey: (index: number, e: WebKey) => void;
  register: (index: number, node: View | null) => void;
}) {
  const { day, name, status, theme, title, pending, meta, state, locked, art, progress = 0, keyMoment } = item;
  const today = state === "today";
  const narrow = width < 280;
  const thumb = narrow ? 72 : 88;
  const key = keyMoment ? <KeyLine moment={keyMoment} /> : null;
  return (
    <View style={[styles.card, { width }, today ? styles.cardToday : styles.cardQuiet, snapCard]}>
      <Tap
        ref={(node: View | null) => register(index, node)}
        testID={`path-day-${day}`}
        accessibilityRole="button"
        accessibilityLabel={item.spoken}
        accessibilityHint={item.hint}
        onPress={item.onPress}
        disabled={!item.onPress}
        onWebKey={(e) => onKey(index, e)}
        feedback="scaleLarge"
        style={styles.cardTap}
      >
        <View style={styles.lead}>
          <View style={styles.nameRow}>
            {state === "done" ? (
              <Icon name="checkmark-circle" size={15} color={c.accent} />
            ) : locked ? (
              <Icon name="lock-closed-outline" size={14} color={c.muted} />
            ) : null}
            <T
              style={[styles.name, { color: today ? c.gold : state === "done" ? c.accent : c.muted }]}
              numberOfLines={big ? 3 : 2}
              maxFontSizeMultiplier={textCap.section}
            >
              {status ? `${nowrap(name)} · ${status}` : name}
            </T>
          </View>
          <T
            style={[styles.theme, narrow && styles.themeNarrow]}
            numberOfLines={big ? 5 : 3}
            maxFontSizeMultiplier={textCap.section}
          >
            {theme || title}
          </T>
        </View>
        <View style={[styles.sermon, big && styles.sermonStacked]}>
          <Artwork art={art} width={big ? width - 32 : thumb} radius={8} load={load} priority={today ? "high" : "normal"} />
          <View style={styles.sermonText}>
            {pending ? (
              <View style={styles.titleGhost} />
            ) : (
              // Long headlines take a third line beside the artwork rather than lose their end.
              <T style={styles.headline} numberOfLines={big ? 5 : 3}>
                {title}
              </T>
            )}
            {/* Holds its line while the length loads, so nothing moves. */}
            <T style={[type.meta, styles.muted, tabular]} numberOfLines={1}>
              {meta || " "}
            </T>
          </View>
        </View>
        {/* How far through today's sermon; nothing to show before it's begun. */}
        {today && progress > 0 ? (
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.min(1, progress) * 100}%` }]} />
          </View>
        ) : null}
        {/* The cards are as tall as the tallest: the room goes here, so every
            key moment sits along the bottom. */}
        <View style={styles.fill} />
        {/* Another day's key moment is part of its card: a glimpse of what's ahead. */}
        {key && !item.onKeyMoment ? <View style={styles.key}>{key}</View> : null}
      </Tap>
      {key && item.onKeyMoment ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`Key moment at ${spokenTime(keyMoment!.at)}. ${keyMoment!.title}`}
          accessibilityHint="Plays from the key moment"
          onPress={item.onKeyMoment}
          feedback="dim"
          hitSlop={{ top: 4, bottom: 4 }}
          style={[styles.key, styles.keyButton]}
          testID={`path-day-${day}-key`}
        >
          {key}
        </Tap>
      ) : null}
    </View>
  );
});

/** "✦ Key moment 53:44 · Victory over sin": the title exactly as the editor wrote it. */
function KeyLine({ moment }: { moment: { at: number; title: string } }) {
  return (
    <>
      <Spark size={14} />
      <T style={[type.meta, styles.muted, { flex: 1 }]} numberOfLines={2}>
        {"Key moment "}
        <Text style={styles.keyTime}>{clockText(moment.at)}</Text>
        {" · "}
        {moment.title}
      </T>
    </>
  );
}

const styles = StyleSheet.create({
  // Room for today's shadow, which the row would otherwise clip.
  row: { gap: GAP, paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: 32 },
  rowFrame: { marginTop: -12, marginBottom: -20 },
  card: { borderRadius: radius.r18, backgroundColor: c.surface },
  cardToday: { boxShadow: shadows.lifted },
  // The other days sit flat, a hairline round them.
  cardQuiet: { boxShadow: `inset 0 0 0 1px ${c.border}` },
  cardTap: { flexGrow: 1, padding: 16, paddingBottom: 14 },
  lead: { paddingBottom: 14 },
  fill: { flexGrow: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { ...type.labelSmall, flexShrink: 1, ...tabular },
  // The day's line leads, in the page's serif.
  theme: { ...type.pathName, color: c.text, marginTop: 6 },
  themeNarrow: { fontSize: fontSize.heading, lineHeight: 23 },
  sermon: { flexDirection: "row", alignItems: "center", gap: 10 },
  sermonStacked: { flexDirection: "column", alignItems: "stretch" },
  sermonText: { flex: 1, minWidth: 0 },
  headline: { fontFamily: font.semibold, fontSize: fontSize.small, lineHeight: 18, color: c.text },
  titleGhost: { height: 12, width: "80%", borderRadius: 4, backgroundColor: c.feature, marginTop: 3, marginBottom: 3 },
  muted: { color: c.muted },
  bar: { height: 3, borderRadius: 2, backgroundColor: c.border, marginTop: 12, overflow: "hidden" },
  barFill: { height: 3, backgroundColor: c.accent },
  key: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: c.divider,
  },
  // Today's: a button of its own under the card's, 36pt and more to touch.
  keyButton: { marginTop: 0, marginHorizontal: 16, paddingBottom: 12 },
  keyTime: { fontFamily: font.bold, color: c.accent, ...tabular },
  // The arrows share the line under the row with "Mark Day 3 done".
  foot: { flexDirection: "row", alignItems: "center" },
  arrows: { flexDirection: "row", gap: 8, marginLeft: "auto" },
  arrowSpace: { width: 40, height: 40 },
  // Quiet: a muted line under the row, 44pt to touch.
  mark: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 44,
    marginLeft: space.gutter - 6,
    paddingHorizontal: 6,
  },
});
