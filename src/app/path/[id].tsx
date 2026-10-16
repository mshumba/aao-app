import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  Extrapolation,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../../auth/AccountProvider";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import { Kicker, RoundButton, StickyCTA, TrustLine, useStickyCTASpace } from "../../kit";
import { nextDay, useEnrollment, usePath, type PathDayWithSermon } from "../../learning";
import { firstParam, useGo, usePageTitle } from "../../navigation";
import { DayCompleteSheet } from "../../paths/DayCompleteSheet";
import { DayList, type DayItem } from "../../paths/DayList";
import { LockedDaySheet } from "../../paths/LockedDaySheet";
import {
  artOf,
  dayKicker,
  dayTiming,
  dayTitle,
  fanFor,
  isSingleTeaching,
  pathLength,
  pathWords,
  sermonHref,
  stateOf,
} from "../../paths/model";
import { toPathsTab, usePlayDay } from "../../paths/navigation";
import { COVER_OVERLAP, PathCover, coverFanHeight } from "../../paths/PathCover";
import { markSeen, seenDone } from "../../paths/seen";
import { sharePath } from "../../paths/share";
import { useDockInset } from "../../player/useDockInset";
import { useToast } from "../../toast";
import { c, radius, space, textCap, type } from "../../theme";
import { StatePanel, T, TextButton, web } from "../../ui";

const EMPTY: number[] = [];
/** A day finished this soon after the page was last open still gets its "Day 3 done." */
const RECENT_MS = 6 * 60 * 60 * 1000;
/** The pinned header band: under the status bar, then the 40pt buttons and a little air. */
const BAND = 52;
/** "Why this path" longer than this folds to WHY_LINES with "Read more". */
const WHY_LONG = 170;
const WHY_LINES = 4;

/**
 * A guided path or teaching series (concept screen 03): the dark cover with
 * its fan, name and progress; an ivory panel with "Why this path", "Order
 * set by the ministry" (published paths only) and the day timeline (done, today lifted with a quiet
 * "Mark Day 3 done", later days locked); and the navy call to action,
 * "Continue Day 3 · 48 min left" or "Start Day 1 · 2 hr 16 min". Every day
 * plays its whole sermon, from where the viewer left off. Once a day is done
 * (watched, or marked done) the page shows "Day 3 done." A series counts
 * teachings instead of days; one of a single teaching opens that teaching.
 */
export default function PathScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = firstParam(params.id);
  const { path, days, loading, missing } = usePath(id);
  const { progressFor, start, complete, loading: progressLoading, ready } = useEnrollment();
  const account = useAccount();
  const { hydrated, settled } = useCatalogue();
  const go = useGo();
  const play = usePlayDay();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  // Under the status bar on a phone; a little air above the buttons where
  // there's none (the web).
  const top = Math.max(insets.top, 12);
  const ctaSpace = useStickyCTASpace();
  const dock = useDockInset();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  usePageTitle(path?.name ?? (missing ? "Path not found" : "Path"));

  const mine = path ? progressFor(path.id) : null;
  const enrolled = !!mine;
  const done = mine?.done ?? EMPTY;
  const total = days.length || path?.dayCount || 0;
  const words = pathWords(path ?? { kind: "path" });
  // Today: the first day not done (Day 1 before starting); null once all are.
  const today = enrolled ? nextDay(total, done) : total ? 1 : null;
  const todayDay = today != null ? days.find((d) => d.day === today) : undefined;
  const watchOf = useCallback(
    (youtubeId: string) => (account.user ? account.progressFor(youtubeId) : null),
    [account],
  );
  const timing = todayDay ? dayTiming(todayDay, watchOf(todayDay.youtubeId)) : null;
  const fan = fanFor(days, today ?? 1);
  const length = useMemo(() => pathLength(days), [days]);

  // A teaching series of one teaching has no page: open the teaching.
  const single = !!path && isSingleTeaching(path, total) && !!days[0];
  const singleId = single ? days[0].youtubeId : null;
  useEffect(() => {
    if (singleId && focused) router.replace(sermonHref(singleId));
  }, [singleId, focused]);

  // ---- Playing ------------------------------------------------------------------------

  // The whole sermon, from where the viewer left off; `at` for a key moment.
  const playDay = useCallback(
    (day: PathDayWithSermon, at?: number) => {
      if (path) play(day.youtubeId, { path: { id: path.id, day: day.day }, at });
    },
    [path, play],
  );

  const [starting, setStarting] = useState(false);
  const primary = useCallback(async () => {
    if (!path || !todayDay) return;
    if (enrolled) return playDay(todayDay);
    setStarting(true);
    try {
      // Guests go through the sign-up sheet first; after signing up, the
      // path starts and Day 1 plays (useEnrollment).
      const result = await start(path.id);
      if (result === "started") playDay(todayDay);
    } finally {
      setStarting(false);
    }
  }, [path, todayDay, enrolled, playDay, start]);

  // ---- Locked days -------------------------------------------------------------------

  const [locked, setLocked] = useState<number | null>(null);

  // ---- Day complete --------------------------------------------------------------------

  const owner = account.user?.id ?? "guest";
  const [completed, setCompleted] = useState<number | null>(null);
  // The sheet shows on coming back to this page after the sermon page
  // marked the day done, or on opening it again soon after; never for days
  // done long ago (another device, a first visit on this one).
  const returned = useRef(false);
  useFocusEffect(
    useCallback(
      () => () => {
        returned.current = true;
      },
      [],
    ),
  );
  const doneKey = done.join(",");
  useEffect(() => {
    if (!focused || !path || progressLoading) return;
    let alive = true;
    const now = doneKey ? doneKey.split(",").map(Number) : [];
    seenDone(owner, path.id).then((seen) => {
      if (!alive) return;
      const fresh = seen ? now.filter((d) => !seen.days.includes(d)) : [];
      const recent = !!seen && (returned.current || Date.now() - seen.at < RECENT_MS);
      if (recent && fresh.length) {
        const day = Math.max(...fresh);
        setCompleted(day);
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        AccessibilityInfo.announceForAccessibility(
          nextDay(total, now) == null
            ? `${words.series ? "Series" : "Path"} complete`
            : `${words.unit} ${day} done`,
        );
      }
      markSeen(owner, path.id, now);
    });
    return () => {
      alive = false;
    };
  }, [focused, path, progressLoading, doneKey, owner, total, words.series, words.unit]);

  // ---- Scroll: the pinned band ----------------------------------------------------------

  // Once the cover's title has scrolled up under the buttons, a dark band
  // (the cover's own colour) fades in behind them with the path's name, so
  // the name never shows twice. On a short path it never needs to.
  const [titleBottom, setTitleBottom] = useState(() => top + 34 + coverFanHeight(width) + 80);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y);
    },
  });
  const bandStyle = useAnimatedStyle(() => {
    const under = titleBottom - (top + BAND);
    return { opacity: interpolate(scrollY.get(), [under - 16, under + 8], [0, 1], Extrapolation.CLAMP) };
  });

  // "Why this path": four lines, the rest a tap away when it runs long.
  const [whyOpen, setWhyOpen] = useState(false);

  // ---- Rows ----------------------------------------------------------------------------

  const items = useMemo<DayItem[]>(() => {
    if (!path) return [];
    // Only the next day waits for today's (the concept's one lock); later
    // days show their theme, so the path reads as a journey. Before a path
    // is started, nothing is locked.
    const nextOpen = enrolled && today != null ? today + 1 : null;
    const { unit } = words;
    const lower = unit.toLowerCase();
    return days.map((d) => {
      const state = stateOf(d.day, done, today);
      const isLocked = state === "upcoming" && d.day === nextOpen;
      const { text: title, pending } = dayTitle(d, settled);
      const kicker = dayKicker(d.day, state, d.theme, { enrolled, locked: isLocked, unit });
      if (state === "today" && timing) {
        const key = d.keyTitle && d.keyAt > 0 ? { at: d.keyAt, title: d.keyTitle } : undefined;
        const now = words.series ? "next" : "today";
        return {
          day: d.day,
          kicker,
          title,
          pending,
          state,
          art: artOf(d),
          meta: timing.meta,
          progress: timing.partial,
          keyMoment: key,
          label: `${unit} ${d.day}, ${enrolled ? now : "start here"}. ${d.theme}. ${title}.${timing.spokenMeta ? ` ${timing.spokenMeta}.` : ""}`,
          hint: enrolled ? `Plays ${words.series ? "the next teaching" : "today’s day"}` : `Starts the ${words.noun} with ${unit} 1`,
          onPress: primary,
          onKeyMoment: key
            ? () => (enrolled ? playDay(d, d.keyAt) : play(d.youtubeId, { at: d.keyAt }))
            : undefined,
          // "Mark Day 3 done": the sheet below says so, as when the sermon is watched.
          markDone: enrolled
            ? {
                label: `Mark ${unit} ${d.day} done`,
                hint: `Counts ${lower} ${d.day} as done`,
                onPress: () => complete(path.id, d.day),
              }
            : undefined,
        };
      }
      if (state === "done")
        return {
          day: d.day,
          kicker,
          title,
          pending,
          state,
          label: `${unit} ${d.day}. ${d.theme}. ${title}. Done.`,
          hint: `Plays this ${lower} again`,
          onPress: () => playDay(d),
        };
      return {
        day: d.day,
        kicker,
        title,
        pending,
        state,
        locked: isLocked,
        label: isLocked
          ? `${unit} ${d.day}. Opens after ${lower} ${d.day - 1}. ${title}.`
          : `${unit} ${d.day}. ${d.theme}. ${title}. Coming up.`,
        hint: `Says when this ${lower} opens`,
        onPress: () => setLocked(d.day),
      };
    });
  }, [path, days, done, today, settled, enrolled, timing, primary, playDay, play, setLocked, words, complete]);

  // ---- States --------------------------------------------------------------------------

  // Until the viewer's progress is read, the page can't say which day is
  // today: it never offers Day 1 to someone on Day 3, even for a moment. A
  // single teaching holds here while it opens.
  if (!path || !ready || single) {
    return (
      <View style={styles.screen}>
        {focused ? <StatusBar style={missing ? "dark" : "light"} /> : null}
        {missing ? (
          <View style={[styles.missing, { paddingTop: top + BAND + space.lg }]}>
            <StatePanel
              level={1}
              icon="trail-sign-outline"
              title="This path isn’t available"
              body="It may have been moved or taken down while it’s reviewed."
              action={toPathsTab}
              label="See all paths"
            />
          </View>
        ) : (
          <View
            style={[styles.coverGhost, { height: top + 316 }]}
            accessible
            accessibilityLabel={loading || !ready ? "Loading path" : undefined}
          />
        )}
        <View style={[styles.nav, { top: top + 2 }]}>
          <RoundButton
            icon="chevron-back"
            label="Back"
            onPress={go.back}
            tone={missing ? "surface" : "glass"}
            iconSize={20}
          />
        </View>
      </View>
    );
  }

  const next = nextDay(total, done);
  const completedDay = completed != null ? days.find((d) => d.day === completed) : undefined;
  const nextAfter = next != null ? days.find((d) => d.day === next) : undefined;
  const finished = enrolled && today == null;
  const completedWatch = completedDay ? watchOf(completedDay.youtubeId) : null;
  const completedLeft = completedDay ? dayTiming(completedDay, completedWatch) : null;
  const cta = finished
    ? { label: "Choose your next path", detail: undefined, icon: "albums-outline" as const, onPress: toPathsTab }
    : todayDay && timing
      ? {
          label: `${enrolled && (timing.started || done.length > 0) ? "Continue" : "Start"} ${words.unit} ${todayDay.day}`,
          detail: timing.detail || undefined,
          icon: "play" as const,
          onPress: primary,
        }
      : null;

  const longWhy = !!path.why && path.why.length > WHY_LONG;
  return (
    <View style={styles.screen}>
      {focused ? <StatusBar style="light" animated /> : null}
      {/* Pinned over the page once the cover's title has scrolled away. First
          in order (it's drawn above), so Back is read before the page. */}
      <Animated.View
        style={[styles.band, { height: top + BAND }, bandStyle]}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <T style={styles.bandTitle} numberOfLines={1} aria-hidden>
          {path.name}
        </T>
      </Animated.View>
      <View style={[styles.nav, { top: top + 2 }]} {...web({ dataSet: { dark: "true" } })}>
        <RoundButton icon="chevron-back" label="Back" onPress={go.back} iconSize={20} testID="path-back" />
        <RoundButton
          icon="share-outline"
          label="Share path"
          onPress={() => sharePath(path, toast)}
          iconSize={18}
          testID="path-share"
        />
      </View>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: ctaSpace + dock }}
        testID="path-scroll"
      >
        <PathCover
          path={path}
          fan={fan}
          total={total}
          done={done}
          today={enrolled ? today : null}
          partial={timing?.partial ?? 0}
          enrolled={enrolled}
          length={length}
          topInset={top}
          onTitleBottom={setTitleBottom}
        />
        <View style={styles.panel}>
          <View style={styles.column}>
            <View style={styles.whyRow}>
              <Kicker>{`Why this ${words.noun}`}</Kicker>
              <TrustLine status={path.status} />
            </View>
            {path.why ? (
              <T
                style={[type.prose, styles.why]}
                maxFontSizeMultiplier={textCap.quote}
                numberOfLines={longWhy && !whyOpen ? WHY_LINES : undefined}
              >
                {path.why}
              </T>
            ) : null}
            {longWhy ? (
              <View style={styles.whyMore}>
                <TextButton
                  label={whyOpen ? "Show less" : "Read more"}
                  align="start"
                  onPress={() => setWhyOpen((was) => !was)}
                />
              </View>
            ) : null}
            <DayList days={items} style={[styles.days, longWhy && styles.daysAfterMore]} />
          </View>
        </View>
      </Animated.ScrollView>

      {cta ? (
        <View style={[styles.ctaSlot, { bottom: dock, height: ctaSpace - 24 + 44 }]}>
          <StickyCTA
            testID="path-cta"
            label={cta.label}
            detail={cta.detail}
            icon={cta.icon}
            onPress={() => {
              if (!starting) void cta.onPress();
            }}
            hint={
              finished
                ? "Opens the Paths tab"
                : enrolled
                  ? `Plays ${words.series ? "the next teaching" : "today’s day"}`
                  : `Starts the ${words.noun} and plays ${words.unit} 1`
            }
          />
        </View>
      ) : null}

      <LockedDaySheet
        day={locked}
        today={today ?? 1}
        enrolled={enrolled}
        unit={words.unit}
        noun={words.noun}
        onClose={() => setLocked(null)}
        onGoToday={() => {
          setLocked(null);
          void primary();
        }}
        onOpenAnyway={(n) => {
          setLocked(null);
          // The message on its own, outside the path.
          const d = days.find((x) => x.day === n);
          if (d) play(d.youtubeId);
        }}
      />
      <DayCompleteSheet
        visible={completedDay != null}
        path={path}
        day={completedDay}
        total={total}
        done={done}
        next={nextAfter}
        nextMeta={nextAfter ? dayTiming(nextAfter, null).meta : ""}
        left={completedLeft?.started ? completedLeft.meta : null}
        hydrated={hydrated}
        onClose={() => setCompleted(null)}
        onKeepListening={(d) => {
          setCompleted(null);
          playDay(d);
        }}
        onNextPath={() => {
          setCompleted(null);
          toPathsTab();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  panel: {
    marginTop: -COVER_OVERLAP,
    backgroundColor: c.bg,
    borderTopLeftRadius: radius.r28,
    borderTopRightRadius: radius.r28,
  },
  column: { width: "100%", maxWidth: 760, alignSelf: "center", paddingTop: 20 },
  whyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 12,
    rowGap: 4,
    paddingHorizontal: space.gutter,
  },
  why: { color: c.text, marginTop: 6, paddingHorizontal: space.gutter },
  whyMore: { paddingHorizontal: space.gutter - 2, marginTop: -4, marginBottom: -10 },
  daysAfterMore: { paddingTop: 10 },
  days: { paddingTop: 14, paddingLeft: space.gutter, paddingRight: 20 },
  nav: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    pointerEvents: "box-none",
    zIndex: 20,
  },
  band: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: c.media,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.onMediaHairline,
    justifyContent: "flex-end",
    paddingHorizontal: 76,
    paddingBottom: 15,
    zIndex: 10,
    pointerEvents: "none",
  },
  bandTitle: { ...type.cardTitle, color: c.white, textAlign: "center" },
  ctaSlot: { position: "absolute", left: 0, right: 0, pointerEvents: "box-none", zIndex: 30 },
  coverGhost: { backgroundColor: c.media },
  missing: { flex: 1, paddingHorizontal: space.gutter },
});
