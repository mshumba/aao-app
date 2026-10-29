import { useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView as NativeScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount, useProgressOf } from "../../auth/AccountProvider";
import { useGate } from "../../auth/gate";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import { headline } from "../../data/display";
import { Sermon, seriesSermons } from "../../data/sermons";
import { Wash, clockText, parseDuration } from "../../kit";
import { useStatusBar } from "../../kit/statusBar";
import { useMoments, useSermonCard } from "../../learning";
import { LockedDaySheet } from "../../paths/LockedDaySheet";
import { pathWords, stateOf } from "../../paths/model";
import { usePlayDay } from "../../paths/navigation";
import {
  bumpStageFocusToggle,
  fullFrame,
  setStageOverlay,
  stageColumn,
  useStageOverlay,
} from "../../player/layout";
import { PlayerCenter, type BandMarks } from "../../player/NowPlaying";
import { prefetchVideo, usePlayback, usePlayerSession } from "../../player/PlayerProvider";
import { fraction, resumePoint } from "../../player/progress";
import { DaysDrawer } from "../../player/stage/DaysDrawer";
import { LightHeader } from "../../player/stage/LightHeader";
import { SermonMeta } from "../../player/stage/SermonMeta";
import { SermonDescription, SermonTabs, type SermonTabKey } from "../../player/stage/SermonTabs";
import { focusStageToggle } from "../../player/stage/VideoOverlay";
import { useDockInset } from "../../player/useDockInset";
import {
  clearWatchRequest,
  firstParam,
  useExitTo,
  useFocusEffect,
  useGo,
  usePageTitle,
  watchRequested,
} from "../../navigation";
import { SearchPill } from "../../sermon/Band";
import { MomentsSection } from "../../sermon/Moments";
import { SeriesRow } from "../../sermon/MoreMenu";
import { readSermonParams, type SermonParams } from "../../sermon/params";
import { PathDayRow, useOpenPath, usePathDay } from "../../sermon/PathDay";
import { AboutSermon, MoreSermons, TopicsSection } from "../../sermon/Sections";
import { ErrorSlot, Poster } from "../../sermon/Stage";
import { c, space } from "../../theme";
import { Header, Page, StatePanel, dockScrollPadding, web } from "../../ui";

export default function SermonScreen() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const id = firstParam(params.id);
  const catalogue = useCatalogue();
  const exitTo = useExitTo();
  const sermon = catalogue.find(id);
  // The link's asks, kept stable while the values are the same.
  const key = JSON.stringify([params.t, params.from, params.q, params.path, params.day, params.play]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const link = useMemo(() => readSermonParams(params), [key]);
  // A sermon newer than the device's copy of the library arrives with the sync.
  if (!sermon && !catalogue.settled)
    return (
      <Page header={<Header back />}>
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} accessibilityLabel="Loading sermon" />
        </View>
      </Page>
    );
  if (!sermon)
    return (
      <Page header={<Header back />}>
        <StatePanel
          level={1}
          icon="videocam-off-outline"
          title="This sermon isn’t available"
          body="The link may be out of date. Choose another sermon from the library."
          label="Browse sermons"
          action={() => exitTo("/")}
        />
      </Page>
    );
  return <NowPlayingScreen key={sermon.id} sermon={sermon} link={link} />;
}

type Transition = { data?: { closing?: boolean } };

/**
 * Tells the app-wide player this screen can show it full size, once the push
 * has settled, so the video doesn't jump ahead of the sliding screen. When the
 * screen starts to leave (including an iOS swipe-back, which only blurs it
 * once the gesture completes) the player docks, and a cancelled swipe brings
 * it back.
 */
function useStage(id: string) {
  const { setStage, setDockAboveTabs } = usePlayerSession();
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      let leaving = false;
      const show = () => {
        leaving = false;
        setDockAboveTabs(false);
        setStage(() => id);
      };
      const hide = () => {
        setStageOverlay({ fullscreen: false });
        setStage((current) => (current === id ? null : current));
      };
      const listen = (event: string, handler: (e: Transition) => void) =>
        navigation.addListener(event as never, handler as never);
      const unsubscribe = [
        listen("transitionEnd", (e) => {
          if (!e.data?.closing) show();
        }),
        listen("transitionStart", (e) => {
          if (!e.data?.closing) return;
          leaving = true;
          // Returning to the tabs: dock above the tab bar from the start.
          const state = navigation.getState();
          const below = state?.routes[state.index - 1];
          setDockAboveTabs(below?.name === "(tabs)");
          hide();
        }),
        listen("gestureCancel", show),
      ];
      const fallback = setTimeout(() => {
        if (!leaving) show();
      }, Platform.OS === "web" ? 0 : 450);
      return () => {
        unsubscribe.forEach((remove) => remove());
        clearTimeout(fallback);
        hide();
        setDockAboveTabs(false);
      };
    }, [id, navigation, setStage, setDockAboveTabs]),
  );
}

/**
 * The sermon page, which is also Now Playing: a light header above an
 * edge-to-edge 16:9 video stage (with on-video Play/Pause, ±15s, scrubber,
 * speed, CC and full-screen controls), then an ivory page below with the
 * sermon title, Save and Share pills, and Moments | About tabs.
 */
function NowPlayingScreen({ sermon, link }: { sermon: Sermon; link: SermonParams }) {
  usePageTitle(headline(sermon));
  const session = usePlayerSession();
  const overlay = useStageOverlay();
  const account = useAccount();
  const progressFor = useProgressOf([sermon.id]);
  const gate = useGate();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dock = useDockInset();
  const catalogue = useCatalogue();
  const go = useGo();
  const openPath = useOpenPath();
  const playDay = usePlayDay();
  const scroll = useRef<NativeScrollView>(null);
  const about = useRef<View>(null);
  const { moments } = useMoments(sermon.id);
  // Fetched as the page opens, so About has it by the time it's drawn.
  const card = useSermonCard(sermon.id);
  const pathDay = usePathDay(sermon.id, link);
  // Full screen hides the status bar (and Android's navigation bar).
  useStatusBar("dark", overlay.fullscreen);
  // Whether it's on R2, asked now so Watch starts straight away.
  useEffect(() => prefetchVideo(sermon.id), [sermon.id]);

  // Bumped when playback jumps to a moment, so the stage scrubber's thumb glides.
  const [glideKey, setGlideKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lockedDay, setLockedDay] = useState<number | null>(null);
  const userPickedTab = useRef(false);
  const [activeTab, setActiveTab] = useState<SermonTabKey>(() =>
    moments.length > 0 ? "moments" : "about",
  );
  useEffect(() => {
    if (!userPickedTab.current) {
      setActiveTab(moments.length > 0 ? "moments" : "about");
    }
  }, [moments.length]);
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);
  useStage(sermon.id);

  const frame = fullFrame(window, insets);
  const column = stageColumn(window, frame);
  const current = session.sermon?.id === sermon.id;
  const failed = current && session.phase === "error";
  const pinned = current && !failed;

  // ---- Scrolling ------------------------------------------------------------------------
  // Where the title ends in the scroll content, so the header bar can show
  // the headline once it has scrolled away (when not already showing a path
  // or series name).
  const offset = useRef(0);
  const titleAt = useRef({ panel: 0, column: 0, meta: 0, title: 0 });
  const [titleShown, setTitleShown] = useState(false);
  const shownNow = useRef(false);
  const reread = useCallback(() => {
    const t = titleAt.current;
    const title = t.title > 0 && offset.current > t.panel + t.column + t.meta + t.title;
    if (title !== shownNow.current) {
      shownNow.current = title;
      setTitleShown(title);
    }
  }, []);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = e.nativeEvent.contentOffset.y;
      reread();
    },
    [reread],
  );
  const record = useCallback(
    (part: keyof typeof titleAt.current, value: number) => {
      titleAt.current[part] = value;
      reread();
    },
    [reread],
  );
  const onPanel = useCallback((e: LayoutChangeEvent) => record("panel", e.nativeEvent.layout.y), [record]);
  const onColumn = useCallback((e: LayoutChangeEvent) => record("column", e.nativeEvent.layout.y), [record]);
  const onMeta = useCallback((e: LayoutChangeEvent) => record("meta", e.nativeEvent.layout.y), [record]);
  const onTitle = useCallback(
    (e: LayoutChangeEvent) => record("title", e.nativeEvent.layout.y + e.nativeEvent.layout.height),
    [record],
  );
  // The video leaves the scroll content for the fixed slot above it as
  // playback starts, and comes back when it stops. The page keeps its place.
  useLayoutEffect(() => {
    if (offset.current <= 0) return;
    const y = offset.current;
    scroll.current?.scrollTo({ y, animated: false });
    const id = requestAnimationFrame(() => scroll.current?.scrollTo({ y, animated: false }));
    return () => cancelAnimationFrame(id);
  }, [pinned]);

  // Where Watch would pick up for a signed-in viewer.
  const saved = account.user ? progressFor(sermon.id) : null;
  const resumeAt = resumePoint(saved);
  // A place the link asks for (a moment, a shared time). Otherwise the
  // player decides: where a member left off, else (as a day of a path)
  // where the Apostle starts preaching, else the beginning.
  const startAt = link.t;
  const opening = pathDay?.day.teachingStart ?? undefined;

  // Playing as a day of a path: the app-wide player keeps that, so the day
  // is marked done when the sermon has been watched, even after this page
  // has closed and the sermon plays on docked.
  const { setPathDay } = session;
  const dayKey = pathDay ? `${pathDay.path.id}:${pathDay.day.day}` : null;
  useEffect(() => {
    if (!current || !pathDay) return;
    setPathDay({ pathId: pathDay.path.id, day: pathDay.day.day, sermonId: sermon.id });
    // pathDay is rebuilt as progress changes; the day it names is what counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, dayKey, sermon.id, setPathDay]);

  // What a guest asked for, kept through signing up: where to start, and
  // the path day it is (so the path starts with the new account).
  const dayOfPath = pathDay?.explicit ? { id: pathDay.path.id, day: pathDay.day.day } : undefined;
  const latest = useRef({ gate, session, dayOfPath, opening });
  useLayoutEffect(() => {
    latest.current = { gate, session, dayOfPath, opening };
  });
  const start = useCallback(
    (at?: number | null) => {
      const { gate, session, dayOfPath, opening } = latest.current;
      if (!gate.require(watchIntent(sermon.id, at, dayOfPath, opening))) return;
      bumpStageFocusToggle();
      session.load(sermon, at ?? undefined, opening);
    },
    [sermon],
  );
  const watch = useCallback(() => start(startAt), [start, startAt]);
  const jumped = useCallback(() => setGlideKey((k) => k + 1), []);

  // Opened to play (Continue watching, "Play from" in search, a path day):
  // start once the screen has settled and can show the player, so it never
  // appears in the dock first. Already loaded, it moves to the asked place.
  const [playOnOpen] = useState(() => watchRequested(sermon.id) || link.play);
  const [loadedOnOpen] = useState(() => session.sermon?.id === sermon.id);
  const [seeked, setSeeked] = useState(false);
  const resumed = useRef(false);
  const staged = session.stage === sermon.id;
  useEffect(() => {
    if (!playOnOpen || !staged || resumed.current) return;
    resumed.current = true;
    clearWatchRequest();
    if (!current && gate.require(watchIntent(sermon.id, startAt, dayOfPath, opening)))
      session.load(sermon, startAt ?? undefined, opening);
    // Continue means play even when this sermon is already paused in the
    // dock. A requested timestamp keeps its seek-then-play path below.
    else if (current && startAt == null) session.playWhenReady();
    // Only when the request is first carried out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playOnOpen, staged]);
  const seekOnOpen =
    playOnOpen && loadedOnOpen && staged && current && startAt != null && !seeked ? startAt : null;
  // About, Topics and More sermons sit below the fold. They're drawn once
  // the push has settled (the stage is set then), so the tap that opens the
  // page builds only what it shows first.
  const [settled, setSettled] = useState(staged);
  if (staged && !settled) setSettled(true);

  // "From your search: …" for the first six seconds.
  const [searchPill, setSearchPill] = useState(link.from === "search" && !!link.q);
  useEffect(() => {
    if (!searchPill) return;
    const timer = setTimeout(() => setSearchPill(false), 6000);
    return () => clearTimeout(timer);
  }, [searchPill]);

  const estimate = parseDuration(sermon.duration) ?? 0;
  const marks = useMemo<BandMarks>(() => {
    const list = moments.map((m) => ({ key: m.id, at: m.at }));
    const t = link.t;
    // The search moment gets its own tick, unless a verified one is there.
    if (link.from === "search" && t != null && !moments.some((m) => Math.abs(m.at - t) <= 10))
      list.push({ key: "search", at: t });
    list.sort((a, b) => a.at - b.at);
    return {
      moments: list,
      activeKey: t != null ? (list.find((m) => Math.abs(m.at - t) <= 10)?.key ?? null) : null,
      estimate,
    };
  }, [moments, link.from, link.t, estimate]);

  // Share marks and glideKey with the full-size overlay in PlayerHost.
  useLayoutEffect(() => {
    if (!staged) return;
    setStageOverlay({ marks, glideKey });
  }, [staged, marks, glideKey]);

  const centerExtra = useMemo(
    () => (searchPill && link.q ? <SearchPill q={link.q} /> : null),
    [searchPill, link.q],
  );

  // Its series, in order: a pass over the whole library, so only when that changes.
  const { seriesKey } = sermon;
  const series = useMemo(
    () => (seriesKey ? seriesSermons(catalogue.sermons, seriesKey) : []),
    [catalogue.sermons, seriesKey],
  );
  const seriesName = catalogue.seriesName(seriesKey);
  const inSeries = series.length > 1 && !!seriesName;
  const seriesPart = inSeries ? series.findIndex((s) => s.id === sermon.id) + 1 : 0;
  const fan = useMemo(() => seriesFan(series, sermon), [series, sermon]);
  const openSeries = useCallback(
    () => go.push({ pathname: "/series/[key]", params: { key: seriesKey! } }),
    [go, seriesKey],
  );

  const shared = !account.user && account.guestWatch === "shared" && account.hasPass(sermon.id);
  const baseKicker = pathDay
    ? `${pathWords(pathDay.path).unit} ${pathDay.day.day}`
    : inSeries && seriesPart > 0
      ? `Teaching ${seriesPart}`
      : sermon.date;
  const kicker = shared
    ? link.t != null
      ? `Shared with you · at ${clockText(link.t)}`
      : `Shared with you · ${baseKicker}`
    : baseKicker;

  const openYouTube = useCallback(() => {
    const { session } = latest.current;
    if (session.sermon?.id === sermon.id) session.watchOnYouTube();
    else Linking.openURL(sermon.source).catch(() => {});
  }, [sermon]);

  // "About this sermon" in the drawer: switches to the About tab and scrolls
  // what it's about (its card, then the source line) into view.
  const aboutAsked = useRef(false);
  const scrollToAbout = useCallback(() => {
    const target = about.current;
    const view = scroll.current?.getNativeScrollRef();
    aboutAsked.current = !target || !view;
    if (!target || !view) return;
    target.measureInWindow((_x, y) => {
      view.measureInWindow((_vx, top) => {
        scroll.current?.scrollTo({
          y: Math.max(0, offset.current + y - top - space.lg),
          animated: true,
        });
      });
    });
  }, []);
  const showAbout = useCallback(() => {
    userPickedTab.current = true;
    setSettled(true);
    setActiveTab("about");
    aboutAsked.current = true;
    requestAnimationFrame(scrollToAbout);
  }, [scrollToAbout]);
  const onAbout = useCallback(() => {
    if (aboutAsked.current) requestAnimationFrame(scrollToAbout);
  }, [scrollToAbout]);

  const handleChangeTab = useCallback((nextTab: SermonTabKey) => {
    userPickedTab.current = true;
    if (nextTab === "about") setSettled(true);
    setActiveTab(nextTab);
  }, []);

  const handleSelectDay = useCallback(
    (dayNum: number, targetSermonId: string) => {
      if (!pathDay || dayNum === pathDay.day.day) return;
      const todayNum = pathDay.enrolled ? pathDay.today : pathDay.total ? 1 : null;
      const state = stateOf(dayNum, pathDay.done, todayNum);
      if (state === "upcoming") {
        setLockedDay(dayNum);
        return;
      }
      playDay(targetSermonId, { path: { id: pathDay.path.id, day: dayNum } });
    },
    [pathDay, playDay],
  );

  const handleSelectMoment = useCallback(
    (atSeconds: number) => {
      if (current && !failed) {
        setPendingSeek(atSeconds);
      } else {
        jumped();
        start(atSeconds);
      }
    },
    [current, failed, jumped, start],
  );

  const headerStaticTitle = pathDay?.path.name ?? (inSeries ? seriesName : null);
  const rightLabel = pathDay ? "Path days" : moments.length > 0 ? "Show moments" : "More";
  const rightHint = pathDay
    ? `Opens this day and the next in ${pathDay.path.name}`
    : moments.length > 0
      ? "Opens the moments and options for this sermon"
      : "Open in YouTube, About this sermon";

  const statusNode = pinned ? (
    <View key="live">
      <PlayerCenter fallback={centerExtra} />
    </View>
  ) : centerExtra ? (
    <View key="static">{centerExtra}</View>
  ) : null;

  const pathSlot = pathDay ? <PathDayRow ctx={pathDay} current={current} /> : null;

  const momentsSlot = (
    <MomentsSection
      moments={moments}
      current={current && !failed}
      markedAt={link.t}
      onStart={start}
      onJump={jumped}
      first={!pathDay}
    />
  );

  const aboutSlot = (
    <View>
      <SermonDescription sermon={sermon} pathTheme={pathDay?.day.theme ?? null} />
      {inSeries && !pathDay ? (
        <SeriesRow
          name={seriesName!}
          part={seriesPart || null}
          total={series.length}
          fan={fan}
          onPress={openSeries}
        />
      ) : null}
      {settled || activeTab === "about" ? (
        <>
          <AboutSermon
            ref={about}
            sermon={sermon}
            card={card}
            onYouTube={openYouTube}
            onLayout={onAbout}
          />
          <TopicsSection sermon={sermon} />
          <MoreSermons
            sermon={sermon}
            sermons={catalogue.sermons}
            seriesName={inSeries && pathDay ? seriesName! : null}
            onSeries={openSeries}
          />
        </>
      ) : null}
    </View>
  );

  return (
    <View
      style={styles.screen}
      // In full screen the player covers the page: hidden from assistive
      // tech, and on the web from the keyboard too.
      accessibilityElementsHidden={overlay.fullscreen}
      importantForAccessibility={overlay.fullscreen ? "no-hide-descendants" : "auto"}
      {...web(overlay.fullscreen ? { "aria-hidden": true, inert: true } : {})}
    >
      <View style={{ height: insets.top, backgroundColor: c.bg }} />
      <LightHeader
        width={column}
        title={headerStaticTitle}
        scrollTitle={headline(sermon)}
        scrollTitleShown={titleShown}
        onBack={go.back}
        onRightPress={() => setDrawerOpen(true)}
        rightLabel={rightLabel}
        rightHint={rightHint}
        skipToPlayer={pinned}
        onSkipToPlayer={focusStageToggle}
      />

      {/* Fixed slot the app-wide player fills while this sermon plays.
          Otherwise the poster (or the error) scrolls with the page, which
          leaves room for the page when another sermon is docked. */}
      {pinned && (
        <View style={{ marginLeft: frame.left, width: frame.width, height: frame.height }}>
          <View style={[styles.slot, { borderRadius: frame.radius }]} testID="player-slot" />
        </View>
      )}

      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={[styles.scroll, dockScrollPadding(dock)]}
        contentContainerStyle={{ paddingBottom: 48 + insets.bottom + dock }}
      >
        {!pinned && (
          <View style={{ marginLeft: frame.left, width: frame.width }}>
            {failed ? (
              <ErrorSlot width={frame.width} height={frame.height} />
            ) : (
              <Poster
                sermon={sermon}
                width={frame.width}
                height={frame.height}
                radius={frame.radius}
                startAt={startAt}
                resumeAt={resumeAt}
                watched={saved && resumeAt ? fraction(saved) : 0}
                left={saved ? saved.durationSeconds - resumeAt : 0}
                guest={!gate.canWatch(sermon.id)}
                marks={marks}
                onPress={watch}
              />
            )}
          </View>
        )}

        <View style={styles.panel} onLayout={onPanel}>
          <View style={[styles.panelInner, { width: column }]} onLayout={onColumn}>
            <SermonMeta
              sermon={sermon}
              kicker={kicker}
              statusSlot={statusNode}
              onLayout={onMeta}
              onTitleLayout={onTitle}
            />

            <SermonTabs
              activeTab={activeTab}
              onChangeTab={handleChangeTab}
              pathSlot={pathSlot}
              momentsSlot={momentsSlot}
              aboutSlot={aboutSlot}
              bleedHorizontal={space.s20}
            />
          </View>
        </View>
      </ScrollView>

      {/* The page melts into ivory above the home indicator. */}
      <Wash kind="pageEnd" band="bottom" height={44} />

      {seekOnOpen != null ? (
        <SeekOnce
          at={seekOnOpen}
          onDone={() => {
            setSeeked(true);
            jumped();
          }}
        />
      ) : null}
      {pendingSeek != null ? (
        <SeekOnce
          at={pendingSeek}
          onDone={() => {
            setPendingSeek(null);
            jumped();
          }}
        />
      ) : null}

      <DaysDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pathDay={pathDay}
        moments={moments}
        sermonTitle={headline(sermon)}
        seriesName={inSeries && !pathDay ? seriesName : null}
        onSelectDay={handleSelectDay}
        onOpenPath={openPath}
        onOpenSeries={inSeries && !pathDay ? openSeries : undefined}
        onSelectMoment={handleSelectMoment}
        onOpenYouTube={openYouTube}
        onShowAbout={showAbout}
      />

      {pathDay ? (
        <LockedDaySheet
          day={lockedDay}
          today={pathDay.today ?? 1}
          enrolled={pathDay.enrolled}
          unit={pathWords(pathDay.path).unit}
          noun={pathWords(pathDay.path).noun}
          onClose={() => setLockedDay(null)}
          onGoToday={() => {
            setLockedDay(null);
            const todayNum = pathDay.today ?? 1;
            if (todayNum === pathDay.day.day) {
              watch();
              return;
            }
            const todayItem = pathDay.days.find((d) => d.day === todayNum);
            if (todayItem) {
              playDay(todayItem.youtubeId, {
                path: { id: pathDay.path.id, day: todayItem.day },
              });
            }
          }}
          onOpenAnyway={(n) => {
            setLockedDay(null);
            const d = pathDay.days.find((x) => x.day === n);
            if (d) playDay(d.youtubeId);
          }}
        />
      ) : null}
    </View>
  );
}

/** Watching this sermon, as the gate carries it through signing up. */
function watchIntent(
  sermonId: string,
  at?: number | null,
  path?: { id: string; day: number },
  opening?: number,
) {
  return { kind: "watch", sermonId, at: at ?? undefined, path, opening } as const;
}

/** Front first: this sermon, then the part after it (or before, at the end). */
function seriesFan(series: Sermon[], sermon: Sermon) {
  const i = series.findIndex((s) => s.id === sermon.id);
  const other = series[i + 1] ?? series[i - 1];
  return other ? [sermon, other] : [sermon];
}

/** Moves the loaded sermon to `at` and plays, once the player is ready. */
function SeekOnce({ at, onDone }: { at: number; onDone: () => void }) {
  const session = usePlayerSession();
  const { seek, play } = usePlayback();
  const ready = session.phase === "ready";
  useEffect(() => {
    if (!ready) return;
    seek(at);
    play();
    onDone();
    // Once, when ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, at]);
  return null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  slot: { flex: 1, backgroundColor: c.media },
  scroll: { flex: 1, backgroundColor: c.bg },
  panel: {
    backgroundColor: c.bg,
  },
  panelInner: {
    alignSelf: "center",
    paddingHorizontal: space.s20,
    paddingTop: space.lg,
  },
});
