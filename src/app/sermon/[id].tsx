import {
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView as NativeScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../../auth/AccountProvider";
import { useGate } from "../../auth/gate";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import { eventLine, headline } from "../../data/display";
import {
  Sermon,
  relatedSermons,
  sermonCategoryIds,
  seriesSermons,
} from "../../data/sermons";
import {
  ItalicTitle,
  Kicker,
  SectionHeader,
  Wash,
  clockText,
  leftText,
  parseDuration,
  spokenText,
  spokenTime,
} from "../../kit";
import { useMoments } from "../../learning";
import { fullFrame, stageColumn } from "../../player/layout";
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
  useGo,
  usePageTitle,
  watchRequested,
} from "../../navigation";
import { SaveButton, ShareButton, WatchPill } from "../../sermon/Actions";
import { FocusCaption, MarkedCaption, SearchPill, StaticBand } from "../../sermon/Band";
import { MomentsSection } from "../../sermon/Moments";
import { MoreMenu, SeriesRow, type MenuItem } from "../../sermon/MoreMenu";
import { readSermonParams, type SermonParams } from "../../sermon/params";
import { DayDoneWatcher, PathDayRow, useOpenPath, usePathDay, type PathDayContext } from "../../sermon/PathDay";
import { ErrorSlot, Poster, StageBar } from "../../sermon/Stage";
import { c, radius, space, textCap, type } from "../../theme";
import { TopicNotice, TopicTags } from "../../topics";
import {
  Header,
  Notice,
  Page,
  SermonRow,
  SermonTitle,
  StatePanel,
  T,
  TextButton,
  dockScrollPadding,
  gradient,
  web,
} from "../../ui";

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
 * The navy light on the stage, centred just under the video (the concept's).
 * When the video is narrower than the window, it sits lower so it has faded
 * out by the band's top edge, beside the video.
 */
const stageLight = (fullBleed: boolean) =>
  `radial-gradient(420px 300px at 70% ${fullBleed ? 11 : 210}px, rgba(31,58,95,0.85) 0%, rgba(31,58,95,0) 70%)`;

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
  const gate = useGate();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dock = useDockInset();
  const catalogue = useCatalogue();
  const go = useGo();
  const focused = useIsFocused();
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

  const { moments } = useMoments(sermon.id);
  const pathDay = usePathDay(sermon.id, link);

  // Where Watch would pick up for a signed-in viewer.
  const saved = account.user ? account.progressFor(sermon.id) : null;
  const resumeAt = resumePoint(saved);
  const startAt = startFor(link.t, pathDay, resumeAt);

  // What a guest asked for, kept through signing up: where to start, and
  // the path day it is (so the path starts with the new account).
  const dayOfPath = pathDay?.explicit ? { id: pathDay.path.id, day: pathDay.day.day } : undefined;
  const intentFor = (at?: number | null) =>
    ({ kind: "watch", sermonId: sermon.id, at: at ?? undefined, path: dayOfPath }) as const;
  const start = useCallback(
    (at?: number | null) => {
      if (!gate.require(intentFor(at))) return;
      setWatched(true);
      session.load(sermon, at ?? undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gate, session, sermon, dayOfPath?.id, dayOfPath?.day],
  );
  const watch = () => start(startAt);
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
    if (!current && gate.require(intentFor(startAt))) session.load(sermon, startAt ?? undefined);
    // Only when the request is first carried out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playOnOpen, staged]);
  const seekOnOpen =
    playOnOpen && loadedOnOpen && staged && current && startAt != null && !seeked ? startAt : null;

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
      focus: pathDay ? { start: pathDay.day.focusStart, end: pathDay.day.focusEnd } : null,
      estimate,
    };
  }, [moments, link.from, link.t, pathDay, estimate]);

  const marked = moments.length ? <MarkedCaption count={moments.length} /> : null;
  const centerExtra = searchPill && link.q ? (
    <SearchPill q={link.q} />
  ) : pathDay ? (
    <FocusCaption day={pathDay.day.day} start={pathDay.day.focusStart} end={pathDay.day.focusEnd} />
  ) : null;

  const shared = !account.user && account.guestWatch === "shared" && account.hasPass(sermon.id);
  const kicker = shared
    ? link.t != null
      ? `Shared with you · at ${clockText(link.t)}`
      : `Shared with you · ${sermon.date}`
    : `${sermon.date} · ${sermon.duration}`;

  const topics = sermonCategoryIds(sermon);
  // The rest of its series first, then sermons sharing a topic, then the newest.
  const more = relatedSermons(sermon, catalogue.sermons);
  const series = sermon.seriesKey ? seriesSermons(catalogue.sermons, sermon.seriesKey) : [];
  const seriesName = catalogue.seriesName(sermon.seriesKey);
  const openSeries = () =>
    go.push({ pathname: "/series/[key]", params: { key: sermon.seriesKey! } });
  const inSeries = series.length > 1 && !!seriesName;

  const menuItems: MenuItem[] = [
    {
      key: "youtube",
      label: "Open in YouTube",
      icon: "logo-youtube",
      onPress: () =>
        current ? session.watchOnYouTube() : Linking.openURL(sermon.source).catch(() => {}),
    },
    ...(pathDay
      ? [{ key: "path", label: `Go to ${pathDay.path.name}`, icon: "trail-sign-outline" as const, onPress: () => openPath(pathDay.path.id) }]
      : inSeries
        ? [{ key: "series", label: `Go to ${seriesName}`, icon: "albums-outline" as const, onPress: openSeries }]
        : []),
    {
      key: "about",
      label: "About this sermon",
      icon: "information-circle-outline",
      onPress: () => scroll.current?.scrollTo({ y: aboutY.current, animated: true }),
    },
  ];

  const sideGutter = (window.width - column) / 2;

  return (
    <View style={styles.screen}>
      {/* Light clock and icons over the dark stage, while this is in front. */}
      {focused ? <StatusBar style="light" /> : null}
      <View style={{ height: insets.top }} />
      <StageBar width={column} skipToPlayer={pinned} onMore={() => setMenu(true)} />

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
          <View style={[styles.lit, gradient(stageLight(frame.width >= window.width))]}>
            <View style={{ marginLeft: frame.left, width: frame.width }}>
              {current && !failed ? (
                <LiveBand
                  scroll={scroll}
                  marks={marks}
                  glideKey={glideKey}
                  center={<PlayerCenter toggle={toggle} fallback={centerExtra} />}
                />
              ) : (
                <StaticBand
                  marks={marks}
                  position={startAt != null ? startAt / (estimate || 1) : resumeAt && saved ? fraction(saved) : null}
                  arrive={startAt != null}
                  center={centerExtra ?? marked}
                />
              )}
            </View>
            <View style={[styles.column, { width: column }]}>
              <View style={styles.meta}>
                <Kicker tone="onMedia">{kicker}</Kicker>
                <ItalicTitle
                  text={headline(sermon)}
                  italicLast
                  accessibilityRole="header"
                  {...web({ "aria-level": 1 })}
                  style={styles.title}
                  maxFontSizeMultiplier={textCap.display}
                />
                <T style={styles.byline}>{byline(sermon)}</T>
              </View>
              <View style={styles.actions}>
                {current && !failed ? (
                  <Transport toggle={toggle} focusTransport={watched}>
                    <SaveButton sermon={sermon} />
                    <ShareButton sermon={sermon} />
                  </Transport>
                ) : (
                  <View style={styles.preplay}>
                    {!failed ? (
                      <WatchButton
                        sermon={sermon}
                        startAt={startAt}
                        resumeAt={resumeAt}
                        watched={saved && resumeAt ? fraction(saved) : 0}
                        left={saved ? saved.durationSeconds - resumeAt : 0}
                        pathDay={pathDay?.explicit ? pathDay : null}
                        guest={!gate.canWatch(sermon.id)}
                        onPress={watch}
                      />
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
                fan={seriesFan(series, sermon)}
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

            <SectionHeader
              title="More sermons"
              size="md"
              action={
                inSeries && pathDay
                  ? { label: "Whole series", hint: `Opens every part of ${seriesName}`, onPress: openSeries }
                  : undefined
              }
              style={styles.sectionGap}
            />
            <View style={{ gap: space.sm, marginTop: space.md }}>
              {more.map((item) => (
                <SermonRow key={item.id} sermon={item} />
              ))}
            </View>
            <View style={{ marginTop: space.sm }}>
              <TextButton label="Browse all sermons" icon="chevron-forward" onPress={() => exitTo("/")} />
            </View>

            {topics.length > 0 && (
              <>
                <SectionHeader title="Topics" size="md" style={styles.sectionGap} />
                <View style={{ gap: space.md, marginTop: space.md }}>
                  <TopicNotice />
                  <TopicTags ids={topics} />
                </View>
              </>
            )}

            {/* The exact title as published, kept with its source. */}
            <View onLayout={(e) => (aboutY.current = e.nativeEvent.layout.y)}>
              <SectionHeader title="About this sermon" size="md" style={styles.sectionGap} />
              <View style={styles.source}>
                <Kicker tone="muted">On YouTube</Kicker>
                <SermonTitle title={sermon.title} style={styles.sourceTitle} />
                <TextButton
                  label="Open in YouTube"
                  icon="open-outline"
                  align="start"
                  onPress={() =>
                    current ? session.watchOnYouTube() : Linking.openURL(sermon.source).catch(() => {})
                  }
                />
                <Notice icon="logo-youtube">
                  Plays through YouTube. Loading the player connects to Google, which may set cookies.
                </Notice>
              </View>
            </View>
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
      {pathDay ? <DayDoneWatcher ctx={pathDay} sermonId={sermon.id} /> : null}
      <MoreMenu
        visible={menu}
        onClose={() => setMenu(false)}
        items={menuItems}
        top={insets.top + 46}
        right={sideGutter + space.lg}
      />
    </View>
  );
}

/**
 * Where Play starts when the link asks for a place: its time, else a path
 * day's focus (or your place inside it). Null lets the player decide (where
 * a member left off, or the beginning).
 */
function startFor(t: number | null, pathDay: PathDayContext | null, resumeAt: number) {
  if (t != null) return t;
  if (pathDay?.explicit) {
    const { focusStart, focusEnd } = pathDay.day;
    return resumeAt >= focusStart && resumeAt < focusEnd ? resumeAt : focusStart;
  }
  return null;
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

/** Front first: this sermon, then the part after it (or before, at the end). */
function seriesFan(series: Sermon[], sermon: Sermon) {
  const i = series.findIndex((s) => s.id === sermon.id);
  const other = series[i + 1] ?? series[i - 1];
  return other ? [sermon, other] : [sermon];
}

/**
 * The stage's call to play before the player loads. It says where it starts
 * and how long: "Watch · 1 hr 53 min", "Resume · 1 hr 16 min left" (with how
 * far in), "Play from 34:12", "Play Day 3 · 16-min focus".
 */
function WatchButton({
  sermon,
  startAt,
  resumeAt,
  watched,
  left,
  pathDay,
  guest,
  onPress,
}: {
  sermon: Sermon;
  startAt: number | null;
  resumeAt: number;
  watched: number;
  left: number;
  pathDay: PathDayContext | null;
  guest: boolean;
  onPress: () => void;
}) {
  // A guest is asked for a free account first; the sermon starts once they
  // have one.
  const ask = guest ? "Asks you to create a free account first" : undefined;
  if (pathDay && startAt != null) {
    const { day, focusStart, focusEnd } = pathDay.day;
    const minutes = Math.max(1, Math.round((focusEnd - focusStart) / 60));
    if (startAt <= focusStart + 15)
      return (
        <WatchPill
          label={`Play Day ${day}`}
          detail={`${minutes}-min focus`}
          accessibilityLabel={`Play day ${day}`}
          hint={ask ?? `A ${minutes}-minute focus from ${spokenTime(focusStart)}`}
          onPress={onPress}
        />
      );
    if (startAt < focusEnd)
      return (
        <WatchPill
          label={`Resume Day ${day}`}
          detail={`${leftText(focusEnd - startAt).replace(" left", "")} to go`}
          accessibilityLabel={`Resume day ${day} at ${clock(startAt)}`}
          hint={ask ?? `${spokenText(leftText(focusEnd - startAt))} in today’s focus`}
          progress={(startAt - focusStart) / (focusEnd - focusStart)}
          onPress={onPress}
        />
      );
  }
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
  preplay: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  acts: { flexDirection: "row", alignItems: "center", gap: 10, marginLeft: "auto" },
  panel: {
    marginTop: -radius.r28,
    backgroundColor: c.bg,
    borderTopLeftRadius: radius.r28,
    borderTopRightRadius: radius.r28,
  },
  panelInner: { alignSelf: "center", paddingHorizontal: space.s20, paddingTop: space.s20 },
  sectionGap: { marginTop: space.xxl, marginHorizontal: 4 },
  source: { gap: space.sm, marginTop: space.md, marginHorizontal: 4 },
  sourceTitle: { ...type.caption, color: c.text },
});
