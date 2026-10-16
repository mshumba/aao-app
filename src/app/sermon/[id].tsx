import { useLocalSearchParams, useNavigation } from "expo-router";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { eventLine, headline } from "../../data/display";
import { Sermon, seriesSermons } from "../../data/sermons";
import {
  ItalicTitle,
  Kicker,
  Wash,
  clockText,
  leftText,
  parseDuration,
  spokenTime,
} from "../../kit";
import { FocusedStatusBar } from "../../kit/FocusedStatusBar";
import { useMoments } from "../../learning";
import { STAGE_BAR, fullFrame, stageColumn } from "../../player/layout";
import {
  LiveBand,
  PlayerCenter,
  Transport,
  type BandMarks,
} from "../../player/NowPlaying";
import { clock, usePlayback, usePlayerSession } from "../../player/PlayerProvider";
import { fraction, resumePoint } from "../../player/progress";
import { useDockInset } from "../../player/useDockInset";
import {
  clearWatchRequest,
  exitTo,
  firstParam,
  useFocusEffect,
  useGo,
  usePageTitle,
  watchRequested,
} from "../../navigation";
import { SaveButton, ShareButton, WatchPill } from "../../sermon/Actions";
import { MarkedCaption, SearchPill, StaticBand } from "../../sermon/Band";
import { MomentsSection } from "../../sermon/Moments";
import { MoreMenu, SeriesRow, type MenuItem } from "../../sermon/MoreMenu";
import { readSermonParams, type SermonParams } from "../../sermon/params";
import { PathDayRow, useOpenPath, usePathDay } from "../../sermon/PathDay";
import { AboutSermon, MoreSermons, TopicsSection } from "../../sermon/Sections";
import { ErrorSlot, Poster, StageBar } from "../../sermon/Stage";
import { c, radius, space, textCap, type } from "../../theme";
import { Header, Page, StatePanel, T, dockScrollPadding, gradient, web } from "../../ui";

export default function SermonScreen() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const id = firstParam(params.id);
  const catalogue = useCatalogue();
  const sermon = catalogue.find(id);
  // The link's asks, kept stable while the values are the same.
  const key = JSON.stringify([params.t, params.from, params.q, params.path, params.day, params.play]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const link = useMemo(() => readSermonParams(params), [key]);
  // A sermon newer than the device's copy of the library arrives with the sync.
  if (!sermon && !catalogue.settled)
    return (
      <Page>
        <Header back />
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} accessibilityLabel="Loading sermon" />
        </View>
      </Page>
    );
  if (!sermon)
    return (
      <Page>
        <Header back />
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
      const hide = () => setStage((current) => (current === id ? null : current));
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
 * The navy light on the stage, centred just under the video (the concept's),
 * `y` points below the top of the box it's drawn in. When the video is
 * narrower than the window, it sits lower so it has faded out by the band's
 * top edge, beside the video.
 */
const stageLight = (y: number) =>
  `radial-gradient(420px 300px at 70% ${Math.round(y)}px, rgba(31,58,95,0.85) 0%, rgba(31,58,95,0) 70%)`;

/** Under the pinned band and the stage bar: the page slides under, not against, them. */
const BAND_FADE = "linear-gradient(180deg, rgba(15,17,21,0.85) 0%, rgba(15,17,21,0) 100%)";
const BAR_FADE = "linear-gradient(180deg, rgba(15,17,21,0.6) 0%, rgba(15,17,21,0) 100%)";
/** The playing band's height before it has measured itself (strip and times). */
const BAND_GUESS = 40;

/**
 * Keeps the last two words of a title together, so a line never ends with
 * one word alone ("Day Two / *Morning*"). The words are unchanged; only the
 * space between the last two can't break.
 */
const keepLastTwo = (text: string) => text.replace(/ (\S+)$/, " $1");

/** A byline's short parts ("Lioness Conference") never break inside. */
const keepSegments = (text: string) =>
  text
    .split(" · ")
    .map((part) => (part.length <= 24 ? part.replace(/ /g, " ") : part))
    .join(" · ");

/**
 * The sermon page, which is also Now Playing: a dark stage flush under the
 * status bar (the bar with Back and "…", the video, the band with its
 * moments, the title and the transport), then an ivory panel rising over it
 * (the path or series it belongs to, its moments, more sermons, details).
 */
function NowPlayingScreen({ sermon, link }: { sermon: Sermon; link: SermonParams }) {
  usePageTitle(headline(sermon));
  const session = usePlayerSession();
  const account = useAccount();
  const progressFor = useProgressOf([sermon.id]);
  const gate = useGate();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dock = useDockInset();
  const catalogue = useCatalogue();
  const go = useGo();
  const openPath = useOpenPath();
  const scroll = useRef<NativeScrollView>(null);
  const toggle = useRef<View>(null);
  const aboutY = useRef(0);
  // Watch's button is replaced by the transport, so focus moves to Play/Pause.
  const [watched, setWatched] = useState(false);
  // Bumped when playback jumps to a moment, so the band's thumb glides.
  const [glideKey, setGlideKey] = useState(0);
  const [menu, setMenu] = useState(false);
  useStage(sermon.id);

  const frame = fullFrame(window, insets);
  const column = stageColumn(window, frame);
  const current = session.sermon?.id === sermon.id;
  const failed = current && session.phase === "error";
  const pinned = current && !failed;

  // ---- Scrolling ------------------------------------------------------------------------
  // Where the title ends in the scroll content (summed from its ancestors'
  // layouts, which each report a change on their own), so the bar can take
  // the headline once it has scrolled away.
  const offset = useRef(0);
  const titleAt = useRef({ lit: 0, column: 0, meta: 0, title: 0 });
  const [titleShown, setTitleShown] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const shownNow = useRef({ title: false, scrolled: false });
  const reread = useCallback(() => {
    const t = titleAt.current;
    const title = t.title > 0 && offset.current > t.lit + t.column + t.meta + t.title;
    const moved = offset.current > 4;
    if (title !== shownNow.current.title) setTitleShown(title);
    if (moved !== shownNow.current.scrolled) setScrolled(moved);
    shownNow.current = { title, scrolled: moved };
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
  const onLit = useCallback((e: LayoutChangeEvent) => record("lit", e.nativeEvent.layout.y), [record]);
  const onColumn = useCallback((e: LayoutChangeEvent) => record("column", e.nativeEvent.layout.y), [record]);
  const onMeta = useCallback((e: LayoutChangeEvent) => record("meta", e.nativeEvent.layout.y), [record]);
  const onTitle = useCallback(
    (e: LayoutChangeEvent) => record("title", e.nativeEvent.layout.y + e.nativeEvent.layout.height),
    [record],
  );
  // The video (and, while it plays, the band) leave the scroll content for
  // the fixed slot above it as playback starts, and come back when it
  // stops. The page keeps its place: what you tapped stays under your
  // finger. (Browsers' scroll anchoring would otherwise move it.)
  useLayoutEffect(() => {
    if (offset.current <= 0) return;
    const y = offset.current;
    scroll.current?.scrollTo({ y, animated: false });
    const id = requestAnimationFrame(() => scroll.current?.scrollTo({ y, animated: false }));
    return () => cancelAnimationFrame(id);
  }, [pinned]);
  // The playing band, fixed under the video, measures itself.
  const [bandH, setBandH] = useState(BAND_GUESS);
  const onBand = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setBandH((was) => (Math.abs(was - h) < 1 ? was : h));
  }, []);
  const lightY = frame.width >= window.width ? 11 : 210;

  const { moments } = useMoments(sermon.id);
  const pathDay = usePathDay(sermon.id, link);

  // Where Watch would pick up for a signed-in viewer.
  const saved = account.user ? progressFor(sermon.id) : null;
  const resumeAt = resumePoint(saved);
  // A place the link asks for (a moment, a shared time). Otherwise the
  // player decides: where a member left off, or the beginning. A path day
  // is the whole sermon, so it asks for no place of its own.
  const startAt = link.t;

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
  // The gate and the session change identity as they update; the handlers
  // read the latest through a ref, so the parts of the page they're passed
  // to stay memoised.
  const latest = useRef({ gate, session, dayOfPath });
  useLayoutEffect(() => {
    latest.current = { gate, session, dayOfPath };
  });
  const start = useCallback(
    (at?: number | null) => {
      const { gate, session, dayOfPath } = latest.current;
      if (!gate.require(watchIntent(sermon.id, at, dayOfPath))) return;
      setWatched(true);
      session.load(sermon, at ?? undefined);
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
    if (!current && gate.require(watchIntent(sermon.id, startAt, dayOfPath)))
      session.load(sermon, startAt ?? undefined);
    // Continue means play even when this sermon is already paused in the
    // dock. A requested timestamp keeps its seek-then-play path below.
    else if (current && startAt == null) session.play();
    // Only when the request is first carried out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playOnOpen, staged]);
  const seekOnOpen =
    playOnOpen && loadedOnOpen && staged && current && startAt != null && !seeked ? startAt : null;
  // More sermons, Topics and About sit below the fold. They're drawn once
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

  const marked = useMemo(
    () => (moments.length ? <MarkedCaption count={moments.length} /> : null),
    [moments.length],
  );
  const centerExtra = useMemo(
    () => (searchPill && link.q ? <SearchPill q={link.q} /> : null),
    [searchPill, link.q],
  );

  const shared = !account.user && account.guestWatch === "shared" && account.hasPass(sermon.id);
  const kicker = shared
    ? link.t != null
      ? `Shared with you · at ${clockText(link.t)}`
      : `Shared with you · ${sermon.date}`
    : `${sermon.date} · ${sermon.duration}`;

  // Its series, in order: a pass over the whole library, so only when that changes.
  const { seriesKey } = sermon;
  const series = useMemo(
    () => (seriesKey ? seriesSermons(catalogue.sermons, seriesKey) : []),
    [catalogue.sermons, seriesKey],
  );
  const seriesName = catalogue.seriesName(seriesKey);
  const inSeries = series.length > 1 && !!seriesName;
  const fan = useMemo(() => seriesFan(series, sermon), [series, sermon]);
  const openSeries = useCallback(
    () => go.push({ pathname: "/series/[key]", params: { key: seriesKey! } }),
    [go, seriesKey],
  );
  const openYouTube = useCallback(() => {
    const { session } = latest.current;
    if (session.sermon?.id === sermon.id) session.watchOnYouTube();
    else Linking.openURL(sermon.source).catch(() => {});
  }, [sermon]);
  const onAbout = useCallback((e: LayoutChangeEvent) => {
    aboutY.current = e.nativeEvent.layout.y;
  }, []);
  const openMenu = useCallback(() => setMenu(true), []);
  const closeMenu = useCallback(() => setMenu(false), []);

  const pathId = pathDay?.path.id;
  const pathName = pathDay?.path.name;
  const menuItems = useMemo<MenuItem[]>(
    () => [
      { key: "youtube", label: "Open in YouTube", icon: "logo-youtube", onPress: openYouTube },
      ...(pathId
        ? [{ key: "path", label: `Go to ${pathName}`, icon: "route" as const, onPress: () => openPath(pathId) }]
        : inSeries
          ? [{ key: "series", label: `Go to ${seriesName}`, icon: "albums-outline" as const, onPress: openSeries }]
          : []),
      {
        key: "about",
        label: "About this sermon",
        icon: "information-circle-outline",
        onPress: () => scroll.current?.scrollTo({ y: aboutY.current, animated: true }),
      },
    ],
    [openYouTube, pathId, pathName, openPath, inSeries, seriesName, openSeries],
  );

  const sideGutter = (window.width - column) / 2;

  return (
    <View style={styles.screen}>
      {/* Light clock and icons over the dark stage, while this is in front. */}
      <FocusedStatusBar style="light" animated={false} />
      <View style={{ height: insets.top }} />
      <StageBar
        width={column}
        skipToPlayer={pinned}
        onMore={openMenu}
        title={headline(sermon)}
        titleShown={titleShown}
      />

      {/* Fixed slot the app-wide player fills while this sermon plays.
          Otherwise the poster (or the error) scrolls with the page, which
          leaves room for the page when another sermon is docked. */}
      {pinned && (
        <View style={{ marginLeft: frame.left, width: frame.width, height: frame.height }}>
          <View style={[styles.slot, { borderRadius: frame.radius }]} testID="player-slot" />
        </View>
      )}
      {/* While it plays, the band stays at the video's foot: the thumb, the
          moments and the time are always in view, and the page slides under
          a short fade. */}
      {pinned && (
        <View style={[styles.pinnedBand, gradient(stageLight(lightY))]} onLayout={onBand}>
          <View style={{ marginLeft: frame.left, width: frame.width }}>
            <LiveBand
              marks={marks}
              glideKey={glideKey}
              center={<PlayerCenter toggle={toggle} fallback={centerExtra} />}
            />
          </View>
          <View style={[styles.underFade, { height: 12, opacity: scrolled ? 1 : 0 }, gradient(BAND_FADE)]} />
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
        <View style={styles.stage}>
          {/* Dark above the content too, so pulling down shows the stage. */}
          <View style={styles.overscroll} />
          {!pinned && (
            <View style={{ marginLeft: frame.left, width: frame.width }}>
              {failed ? (
                <ErrorSlot width={frame.width} height={frame.height} />
              ) : (
                <Poster sermon={sermon} width={frame.width} height={frame.height} radius={frame.radius} onPress={watch} />
              )}
            </View>
          )}
          <View
            style={[styles.lit, gradient(stageLight(pinned ? lightY - bandH : lightY))]}
            onLayout={onLit}
          >
            {pinned ? null : (
              <View style={{ marginLeft: frame.left, width: frame.width }}>
                <StaticBand
                  marks={marks}
                  position={startAt != null ? startAt / (estimate || 1) : resumeAt && saved ? fraction(saved) : null}
                  arrive={startAt != null}
                  center={centerExtra ?? marked}
                />
              </View>
            )}
            <View style={[styles.column, { width: column }]} onLayout={onColumn}>
              <StageHeading sermon={sermon} kicker={kicker} onLayout={onMeta} onTitle={onTitle} />
              <View style={styles.actions}>
                {current && !failed ? (
                  <Transport toggle={toggle} focusTransport={watched}>
                    <SaveButton sermon={sermon} />
                    <ShareButton sermon={sermon} />
                  </Transport>
                ) : (
                  <View style={styles.preplay}>
                    {!failed ? (
                      <View style={styles.watchSlot}>
                        <WatchButton
                          sermon={sermon}
                          startAt={startAt}
                          resumeAt={resumeAt}
                          watched={saved && resumeAt ? fraction(saved) : 0}
                          left={saved ? saved.durationSeconds - resumeAt : 0}
                          guest={!gate.canWatch(sermon.id)}
                          onPress={watch}
                        />
                      </View>
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                    <View style={styles.acts}>
                      <SaveButton sermon={sermon} />
                      <ShareButton sermon={sermon} />
                    </View>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={[styles.panelInner, { width: column }]}>
            {pathDay ? (
              <PathDayRow ctx={pathDay} current={current} />
            ) : inSeries ? (
              <SeriesRow
                name={seriesName!}
                part={series.findIndex((s) => s.id === sermon.id) + 1 || null}
                total={series.length}
                fan={fan}
                onPress={openSeries}
              />
            ) : null}

            <MomentsSection
              moments={moments}
              current={current && !failed}
              markedAt={link.t}
              onStart={start}
              onJump={jumped}
            />

            {settled ? (
              <>
                <MoreSermons
                  sermon={sermon}
                  sermons={catalogue.sermons}
                  seriesName={inSeries && pathDay ? seriesName! : null}
                  onSeries={openSeries}
                />
                <TopicsSection sermon={sermon} />
                <AboutSermon sermon={sermon} onYouTube={openYouTube} onLayout={onAbout} />
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* Once the page moves, it slides under the stage bar through a short fade. */}
      {!pinned ? (
        <View
          style={[
            styles.underFade,
            { top: insets.top + STAGE_BAR, height: 10, opacity: scrolled ? 1 : 0 },
            gradient(BAR_FADE),
          ]}
        />
      ) : null}
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
      <MoreMenu
        visible={menu}
        onClose={closeMenu}
        items={menuItems}
        top={insets.top + 46}
        right={sideGutter + space.lg}
      />
    </View>
  );
}

/**
 * Who preached it, then the occasion when the headline doesn't already say
 * it: "Apostle Arome Osayi · Lioness Conference · Grand Finale". The venue
 * alone ("The Votage") isn't worth the line.
 */
function byline(sermon: Sermon) {
  const context = eventLine(sermon);
  // Named preachers lead eventLine already.
  if (sermon.speaker) return context;
  if (!context || context === sermon.channel || context === sermon.venue) return sermon.channel;
  return `${sermon.channel} · ${context}`;
}

/** Watching this sermon, as the gate carries it through signing up. */
function watchIntent(sermonId: string, at?: number | null, path?: { id: string; day: number }) {
  return { kind: "watch", sermonId, at: at ?? undefined, path } as const;
}

/**
 * The kicker, the headline (the page's h1, its last two words kept
 * together) and who preached it, on the stage under the band.
 */
const StageHeading = memo(function StageHeading({
  sermon,
  kicker,
  onLayout,
  onTitle,
}: {
  sermon: Sermon;
  kicker: string;
  onLayout: (e: LayoutChangeEvent) => void;
  /** The headline's own layout, so the bar can take it once it scrolls away. */
  onTitle: (e: LayoutChangeEvent) => void;
}) {
  return (
    <View style={styles.meta} onLayout={onLayout}>
      <Kicker tone="onMedia">{kicker}</Kicker>
      <ItalicTitle
        text={keepLastTwo(headline(sermon))}
        accessibilityLabel={headline(sermon)}
        italicLast
        accessibilityRole="header"
        {...web({ "aria-level": 1 })}
        onLayout={onTitle}
        style={styles.title}
        maxFontSizeMultiplier={textCap.display}
      />
      <T style={styles.byline}>{keepSegments(byline(sermon))}</T>
    </View>
  );
});

/** Front first: this sermon, then the part after it (or before, at the end). */
function seriesFan(series: Sermon[], sermon: Sermon) {
  const i = series.findIndex((s) => s.id === sermon.id);
  const other = series[i + 1] ?? series[i - 1];
  return other ? [sermon, other] : [sermon];
}

/**
 * The stage's call to play before the player loads. It says where it starts
 * and how long, always of the whole sermon (a path day included): "Watch ·
 * 1 hr 53 min", "Resume · 1 hr 16 min left" (with how far in), "Play from
 * 34:12".
 */
const WatchButton = memo(function WatchButton({
  sermon,
  startAt,
  resumeAt,
  watched,
  left,
  guest,
  onPress,
}: {
  sermon: Sermon;
  startAt: number | null;
  resumeAt: number;
  watched: number;
  left: number;
  guest: boolean;
  onPress: () => void;
}) {
  // A guest is asked for a free account first; the sermon starts once they
  // have one.
  const ask = guest ? "Asks you to create a free account first" : undefined;
  if (startAt != null)
    return (
      <WatchPill
        label={`Play from ${clockText(startAt)}`}
        accessibilityLabel={`Play from ${spokenTime(startAt)}`}
        hint={ask ?? `Starts the sermon at ${spokenTime(startAt)}`}
        onPress={onPress}
      />
    );
  if (resumeAt)
    return (
      <WatchPill
        label="Resume"
        detail={left > 0 ? leftText(left) : null}
        accessibilityLabel={`Resume at ${clock(resumeAt)}`}
        hint={ask ?? "Plays the sermon from where you left off"}
        progress={watched}
        onPress={onPress}
      />
    );
  return (
    <WatchPill
      label="Watch"
      detail={sermon.duration}
      accessibilityLabel="Watch sermon"
      hint={ask ?? "Starts the sermon in the YouTube player"}
      onPress={onPress}
    />
  );
});

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
  }, [ready]);
  return null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.media },
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  slot: { flex: 1, backgroundColor: c.media },
  // Ivory behind the content, so the end of the page (and an overscroll)
  // is the panel's colour; the stage brings its own dark.
  scroll: { flex: 1, backgroundColor: c.bg },
  stage: { backgroundColor: c.media },
  overscroll: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -1000,
    height: 1000,
    backgroundColor: c.media,
  },
  // The navy light under the video, behind the band, title and transport.
  // Its foot runs under the panel's rounded corners.
  lit: { paddingBottom: 18 + radius.r28 },
  column: { alignSelf: "center", paddingHorizontal: space.xl },
  meta: { marginTop: 4 },
  title: { ...type.sermonTitle, color: c.white, marginTop: 8 },
  byline: {
    fontFamily: type.meta.fontFamily,
    fontSize: 13.5,
    lineHeight: 19,
    color: "rgba(255,255,255,0.76)",
    marginTop: 4,
  },
  actions: { marginTop: 10, minHeight: 56, justifyContent: "center" },
  // One row: the play control takes what the round actions leave.
  preplay: { flexDirection: "row", alignItems: "center", gap: 12 },
  watchSlot: { flex: 1, minWidth: 0 },
  acts: { flexDirection: "row", alignItems: "center", gap: 10 },
  // Over the page below it (drawn after it), so the fade can hang off its foot.
  pinnedBand: { backgroundColor: c.media, zIndex: 2 },
  underFade: { position: "absolute", left: 0, right: 0, top: "100%", pointerEvents: "none", zIndex: 2 },
  panel: {
    marginTop: -radius.r28,
    backgroundColor: c.bg,
    borderTopLeftRadius: radius.r28,
    borderTopRightRadius: radius.r28,
  },
  panelInner: { alignSelf: "center", paddingHorizontal: space.s20, paddingTop: space.s20 },
});
