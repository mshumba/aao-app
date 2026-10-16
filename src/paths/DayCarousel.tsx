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
import { Icon, T, Tap, gradient, moveFocus, nowrap, web, type WebKey } from "../ui";
import type { DayState } from "./model";

/**
 * The path page's days, as the owner asked (16 October 2026): "see only
 * your day and the next day, and if you want to scroll ahead, scroll
 * ahead". A row of cards that moves a card at a time and opens on today's
 * (Day 1 before starting; Day 1 again once every day is done), the next day
 * showing at the edge, its artwork first, and the days done off to the
 * left; the row's edges fade into the page. Each card leads with the day's
 * theme in serif under a short "DAY 3 · TODAY"; the sermon it plays sits
 * below, its headline beside the artwork, with its length. One surface per
 * state: today white and lifted, with how far through the sermon you are, a
 * key moment that plays from that moment and a ring to mark the day done;
 * a day done on sand with a check on its artwork; a day ahead an outline
 * with a lock and its artwork faded. Each card is one button to assistive
 * tech, its label composed by the screen; on the web the arrow keys move
 * between cards, and on a wide window arrows under the row, at the
 * column's end, scroll it.
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
  /** The one day waiting for today's (its status says when it opens). */
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
/** The lines a card holds room for: the theme's and the headline's (narrow cards' smaller). */
const THEME_LINE = type.pathName.lineHeight;
const NARROW_THEME_LINE = 23;
const HEAD_LINE = 20;
const NARROW_HEAD_LINE = 18;
/** How much of the next card shows at the row's edge on a phone: its artwork, whole. */
const PEEK = 56;
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
  /** Today's "Mark Day 3 done": a ring at the end of its card's first line. */
  markDone?: MarkDone;
  style?: StyleProp<ViewStyle>;
}) {
  const { width, fontScale } = useWindowDimensions();
  const big = fontScale >= 1.3;
  // Lines a card holds room for grow with the text, up to the cap.
  const textScale = Math.min(fontScale, textCap.section);
  const card = cardWidth(column, big);
  // Beside a centred column, the row's start: it runs on to the window's edge.
  const side = Math.max(0, (width - column) / 2);
  const step = card + GAP;
  const index = Math.max(0, days.findIndex((d) => d.day === focus));
  const offset = index * step;

  const scroller = useRef<ScrollView>(null);
  const x = useRef(offset);
  // Where the arrows last sent the row, and how far it can go: a second
  // press while it's still moving counts on from there, not from wherever
  // the row has got to.
  const aim = useRef<number | null>(null);
  const farthest = useRef(Number.MAX_SAFE_INTEGER);
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
      farthest.current = Math.max(0, contentSize.width - layoutMeasurement.width);
      if (aim.current != null && Math.abs(contentOffset.x - Math.min(aim.current * step, farthest.current)) < 1)
        aim.current = null;
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
    const last = Math.ceil(farthest.current / step);
    const at = Math.min(last, Math.max(0, (aim.current ?? Math.round(x.current / step)) + cards));
    aim.current = at;
    scroller.current?.scrollTo({ x: Math.min(at * step, farthest.current), animated: true });
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
          onScrollBeginDrag={() => {
            aim.current = null;
          }}
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
              textScale={textScale}
              mark={markDone?.day === d.day ? markDone : undefined}
              load={i >= reach.from && i <= reach.to}
              onKey={onKey}
              register={register}
            />
          ))}
        </ScrollView>
        {/* The cut-off cards at the edges fade into the page. */}
        <View style={[styles.fade, styles.fadeEnd]} />
        <View style={[styles.fade, styles.fadeStart]} />
      </View>
      {arrows && (ends.start || ends.end) ? (
        // Under the row, at the column's end: on the cards they'd cover the artwork.
        // Each keeps its place while the other comes and goes.
        <View style={[styles.foot, { marginRight: side + space.gutter }]}>
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
      ) : null}
    </View>
  );
});

type MarkDone = { day: number; label: string; hint?: string; onPress: () => void };

const DayCard = memo(function DayCard({
  item,
  index,
  width,
  big,
  textScale,
  mark,
  load,
  onKey,
  register,
}: {
  item: DayItem;
  index: number;
  width: number;
  big: boolean;
  /** The text size, as far as the cards follow it: what their reserved lines grow by. */
  textScale: number;
  /** Today's "Mark Day 3 done". */
  mark?: MarkDone;
  load: boolean;
  onKey: (index: number, e: WebKey) => void;
  register: (index: number, node: View | null) => void;
}) {
  const { day, name, status, theme, title, pending, meta, state, art, progress = 0, keyMoment } = item;
  const today = state === "today";
  const done = state === "done";
  const ahead = state === "upcoming";
  const narrow = width < 280;
  const thumb = narrow ? 72 : 96;
  const key = keyMoment ? <KeyLine moment={keyMoment} /> : null;
  // Every card holds two lines for the theme, and two for the headline over
  // its length beside the artwork, so the cards match without a gap; large
  // text lets them run on.
  const room = (height: number) => (big ? null : { minHeight: height * textScale });
  const themeLines = room(2 * (narrow ? NARROW_THEME_LINE : THEME_LINE));
  const sermonLines = room(2 * (narrow ? NARROW_HEAD_LINE : HEAD_LINE) + type.meta.lineHeight);
  return (
    <View style={[styles.card, { width }, styles[state], snapCard]}>
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
          <View style={[styles.nameRow, mark && styles.nameRowMark]}>
            {ahead ? <Icon name="lock-closed-outline" size={14} color={c.muted} /> : null}
            <T
              style={[styles.name, { color: today ? c.gold : done ? c.accent : c.muted }]}
              numberOfLines={big ? 3 : 2}
              maxFontSizeMultiplier={textCap.section}
            >
              {/* "Opens after Day 3" never leaves its "3" alone on a line. */}
              {status ? `${nowrap(name)} · ${status.replace(/\b\w+ \d+\b/g, nowrap)}` : name}
            </T>
          </View>
          <T
            style={[styles.theme, narrow && styles.themeNarrow, done && styles.muted, themeLines]}
            numberOfLines={big ? 5 : 2}
            maxFontSizeMultiplier={textCap.section}
          >
            {theme || title}
          </T>
        </View>
        <View style={[styles.sermon, big && styles.sermonStacked]}>
          <View style={ahead && styles.artAhead}>
            <Artwork art={art} width={big ? width - 32 : thumb} radius={8} load={load} priority={today ? "high" : "normal"} />
            {/* Done: a check on the artwork's corner. */}
            {done ? (
              <View style={styles.doneBadge}>
                <Icon name="checkmark" size={12} color={c.white} />
              </View>
            ) : null}
          </View>
          <View style={[styles.sermonText, sermonLines]}>
            {pending ? (
              <View style={styles.titleGhost} />
            ) : (
              // A narrow card keeps the smaller headline, whole in three lines.
              <T style={[styles.headline, narrow && styles.headlineNarrow]} numberOfLines={big ? 5 : narrow ? 3 : 2}>
                {title}
              </T>
            )}
            {/* Holds its line while the length loads, so nothing moves. */}
            <T style={[type.meta, styles.muted, tabular]} numberOfLines={1}>
              {meta || " "}
            </T>
          </View>
        </View>
        {/* How far through today's sermon; nothing to show before it's begun. */}
        {today && progress > 0 ? (
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.min(1, progress) * 100}%` }]} />
          </View>
        ) : null}
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
      {/* A button of its own over the card's corner, never inside the card's. */}
      {mark ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={mark.label}
          accessibilityHint={mark.hint}
          onPress={mark.onPress}
          feedback="scale"
          hitSlop={8}
          style={styles.ring}
          testID={`path-day-${mark.day}-mark-done`}
        />
      ) : null}
    </View>
  );
});

/** "✦ Key moment 53:44 · Victory over sin": the title exactly as the editor wrote it. */
function KeyLine({ moment }: { moment: { at: number; title: string } }) {
  return (
    <>
      <Spark size={14} style={styles.spark} />
      <T style={[type.meta, styles.muted, { flex: 1 }]} numberOfLines={1}>
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
  // Over the row's ends: the page's ivory, from clear.
  fade: { position: "absolute", top: 0, bottom: 0, pointerEvents: "none" },
  fadeEnd: { right: 0, width: 32, ...gradient("linear-gradient(90deg, rgba(247,244,238,0), #f7f4ee)") },
  fadeStart: { left: 0, width: 20, ...gradient("linear-gradient(270deg, rgba(247,244,238,0), #f7f4ee)") },
  card: { borderRadius: radius.r18 },
  // One surface per state: today white and lifted, a day done on sand, a day ahead an outline.
  today: { backgroundColor: c.surface, boxShadow: shadows.lifted },
  done: { backgroundColor: c.feature },
  upcoming: { boxShadow: `inset 0 0 0 1px ${c.border}` },
  cardTap: { flexGrow: 1, padding: 16, paddingBottom: 14 },
  lead: { paddingBottom: 14 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  // Clear of today's ring.
  nameRowMark: { paddingRight: 30 },
  name: { ...type.overline, flexShrink: 1, ...tabular },
  // The day's line leads, in the page's serif.
  theme: { ...type.pathName, color: c.text, marginTop: 6 },
  themeNarrow: { fontSize: fontSize.heading, lineHeight: NARROW_THEME_LINE },
  sermon: { flexDirection: "row", alignItems: "center", gap: 10 },
  sermonStacked: { flexDirection: "column", alignItems: "stretch" },
  artAhead: { opacity: 0.55 },
  doneBadge: {
    position: "absolute",
    top: -6,
    left: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sermonText: { flex: 1, minWidth: 0, justifyContent: "center" },
  headline: { fontFamily: font.semibold, fontSize: fontSize.body, lineHeight: HEAD_LINE, color: c.text },
  headlineNarrow: { fontSize: fontSize.small, lineHeight: NARROW_HEAD_LINE },
  titleGhost: { height: 12, width: "80%", borderRadius: 4, backgroundColor: c.feature, marginTop: 4, marginBottom: 4 },
  muted: { color: c.muted },
  bar: { height: 3, borderRadius: 2, backgroundColor: c.border, marginTop: 12, overflow: "hidden" },
  barFill: { height: 3, backgroundColor: c.accent },
  key: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: c.divider,
  },
  spark: { marginTop: 2 },
  // Today's: a button of its own under the card's, 36pt and more to touch.
  keyButton: { marginTop: 0, marginHorizontal: 16, paddingBottom: 12 },
  keyTime: { fontFamily: font.bold, color: c.accent, ...tabular },
  // "Mark Day 3 done": an empty ring at the end of today's first line, 44pt to touch.
  ring: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.nodeRing,
  },
  // The arrows have the line under the row to themselves.
  foot: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  arrows: { flexDirection: "row", gap: 8, marginLeft: "auto" },
  arrowSpace: { width: 40, height: 40 },
});
