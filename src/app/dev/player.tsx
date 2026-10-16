import { Redirect, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { authMode } from "../../auth/config";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import { headline } from "../../data/display";
import { seriesSermons, type Sermon } from "../../data/sermons";
import {
  Artwork,
  MomentRow,
  PartOfPathRow,
  SectionHeader,
  Wash,
  type ArtSource,
  type MomentRowState,
} from "../../kit";
import { FocusedStatusBar } from "../../kit/FocusedStatusBar";
import { fixtureDays, fixtureMoments, fixturePaths } from "../../learning/fixtures";
import type { Moment } from "../../learning";
import { firstParam, useGo, usePageTitle } from "../../navigation";
import { RATES } from "../../player/PlayerProvider";
import {
  DaysDrawer,
  LIGHT_HEADER_HEIGHT,
  LightHeader,
  SermonDescription,
  SermonMeta,
  SermonTabs,
  StageVideoFrame,
  VideoOverlay,
  useStageFullscreen,
  type SermonTabKey,
} from "../../player/stage";
import type { BandMarks } from "../../player/NowPlaying";
import { SeriesRow } from "../../sermon/MoreMenu";
import type { PathDayContext } from "../../sermon/PathDay";
import { AboutSermon, MoreSermons, TopicsSection } from "../../sermon/Sections";
import { c, font, radius, space, type } from "../../theme";
import { useToast } from "../../toast";
import { Icon, T, Tap } from "../../ui";

const MIN_PLAYER = 200;

/**
 * Preview route (/dev/player) for Phase 1 of the new Mindvalley-style sermon
 * player. Uses the bundled test fixtures and a deterministic test player so
 * the full layout, Reanimated scrubber, overlay controls, tabs, and drawer can
 * be inspected and verified at 390pt and 320pt before wiring into sermon/[id].
 */
export default function DevPlayerRoute() {
  if (!__DEV__ && authMode !== "local") return <Redirect href="/" />;
  return <DevPlayerScreen />;
}

function DevPlayerScreen() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const mode = (firstParam(params.mode) as "path" | "series" | "solo" | null) ?? "path";
  const initialTab = (firstParam(params.tab) as SermonTabKey | null) ?? "moments";

  const { sermons, find, seriesName } = useCatalogue();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const go = useGo();
  const toast = useToast();
  const scrollRef = useRef<NativeScrollView>(null);
  const toggleRef = useRef<View>(null);

  // Pick a sample sermon that has rich moments and path/series relationships.
  const sermon: Sermon = useMemo(
    () => find("H9sRbSUt0YE") ?? sermons[0],
    [find, sermons],
  );
  usePageTitle(headline(sermon));

  // Build PathDayContext from fixturePaths ("Learning to wait on God", Day 2)
  const [doneDays, setDoneDays] = useState<number[]>([1]);
  const pathDay = useMemo<PathDayContext | null>(() => {
    if (mode !== "path") return null;
    const path = fixturePaths.find((p) => p.id === "learning-to-wait-on-god") ?? fixturePaths[0];
    const rawDays = fixtureDays.filter((d) => d.pathId === path.id);
    const days = rawDays.map((d) => ({
      ...d,
      sermon: find(d.youtubeId) ?? undefined,
    }));
    const day = days.find((d) => d.day === 2) ?? days[0];
    return {
      path,
      day,
      days,
      total: days.length,
      done: doneDays,
      enrolled: true,
      today: doneDays.includes(2) ? 3 : 2,
      explicit: true,
    };
  }, [mode, find, doneDays]);

  const moments = useMemo<Moment[]>(
    () => fixtureMoments.filter((m) => m.youtubeId === sermon.id),
    [sermon.id],
  );

  // Test player state (deterministic, ticks while playing)
  const duration = 8915; // 2 hr 28 min 35 s
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(3405); // 56:45 (~38% across, showing navy track + gold thumb)
  const [rate, setRate] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [glideKey, setGlideKey] = useState(0);
  const [activeTab, setActiveTab] = useState<SermonTabKey>(initialTab);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { fullscreen, toggleFullscreen } = useStageFullscreen();

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setSeconds((s) => (s + 1 >= duration ? 0 : s + 1));
    }, Math.round(1000 / rate));
    return () => clearInterval(timer);
  }, [playing, rate, duration]);

  // Track scroll so lone sermons can show their headline in the header once scrolled past
  const titleBottom = useRef(0);
  const [titleScrolledPast, setTitleScrolledPast] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const past = titleBottom.current > 0 && y > titleBottom.current;
    setTitleScrolledPast((was) => (was === past ? was : past));
  }, []);
  const onTitleLayout = useCallback((e: LayoutChangeEvent) => {
    titleBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height + 24;
  }, []);

  const marks = useMemo<BandMarks>(
    () => ({
      moments: moments.map((m) => ({ key: m.id, at: m.at })),
      activeKey: moments.find((m) => Math.abs(m.at - seconds) <= 20)?.id ?? null,
      estimate: duration,
    }),
    [moments, seconds, duration],
  );

  // Series info
  const series = useMemo(
    () => (sermon.seriesKey ? seriesSermons(sermons, sermon.seriesKey) : []),
    [sermons, sermon.seriesKey],
  );
  const sName = seriesName(sermon.seriesKey);
  const inSeries = series.length > 1 && !!sName;
  const seriesPart = series.findIndex((s) => s.id === sermon.id) + 1 || 1;
  const sFan = useMemo<ArtSource[]>(() => {
    const i = series.findIndex((s) => s.id === sermon.id);
    const other = series[i + 1] ?? series[i - 1];
    return other ? [sermon, other] : [sermon];
  }, [series, sermon]);

  // Header & kicker text per the brief:
  // Header: path or series name centred (or nothing for a lone sermon)
  // Kicker: "DAY 2" on a path, "TEACHING 3" in a series, or the date
  const headerTitle =
    mode === "path" && pathDay
      ? pathDay.path.name
      : mode === "series" && sName
        ? sName
        : null;

  const kicker =
    mode === "path" && pathDay
      ? `Day ${pathDay.day.day}`
      : mode === "series" && inSeries
        ? `Teaching ${seriesPart}`
        : sermon.date;

  // Video dimensions: edge to edge at 16:9, at least 200pt in both directions
  const videoWidth = Math.max(MIN_PLAYER, window.width);
  const videoHeight = Math.max(
    MIN_PLAYER,
    Math.min(Math.round((videoWidth * 9) / 16), Math.round(window.height * 0.48)),
  );
  const columnWidth = Math.min(window.width, Math.max(videoWidth, 560));

  const handleSeek = useCallback((to: number) => {
    setSeconds(Math.max(0, Math.min(duration, Math.round(to))));
  }, [duration]);

  const handleSkip = useCallback(
    (delta: number) => {
      setSeconds((s) => Math.max(0, Math.min(duration, s + delta)));
    },
    [duration],
  );

  const handleCycleRate = useCallback(() => {
    setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length] ?? 1);
  }, []);

  const handleJumpToMoment = useCallback(
    (at: number) => {
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
      setGlideKey((k) => k + 1);
      setSeconds(at);
      setPlaying(true);
    },
    [],
  );

  const openYouTube = useCallback(() => {
    Linking.openURL(sermon.source).catch(() => {});
  }, [sermon.source]);

  const activeCaption = useMemo(() => {
    if (!captionsOn) return null;
    const currentMoment =
      moments.find((m) => Math.abs(m.at - seconds) <= 60) ?? moments[1] ?? moments[0];
    return currentMoment?.quote ?? null;
  }, [captionsOn, moments, seconds]);

  // Path progress card ("Part of your path · Day 2 of 7" + "Mark Day 2 done")
  const pathSlot = useMemo(() => {
    if (!pathDay) return null;
    const isDone = pathDay.done.includes(pathDay.day.day);
    const due = pathDay.today === pathDay.day.day && !isDone;
    const partial = isDone ? 0 : Math.min(1, seconds / duration);
    const fan: ArtSource[] = [
      pathDay.day.sermon ?? { id: pathDay.day.youtubeId },
      pathDay.days[0]?.sermon ?? { id: pathDay.days[0]?.youtubeId ?? sermon.id },
    ];
    return (
      <View>
        <PartOfPathRow
          testID="part-of-path"
          name={pathDay.path.name}
          day={pathDay.day.day}
          total={pathDay.total}
          done={pathDay.done}
          partial={partial}
          fan={fan}
          kicker={`Part of your path · Day ${pathDay.day.day} of ${pathDay.total}`}
          onPress={() =>
            go.push({ pathname: "/path/[id]", params: { id: pathDay.path.id } })
          }
        />
        {due ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={`Mark Day ${pathDay.day.day} done`}
            accessibilityHint={`Counts day ${pathDay.day.day} as done`}
            onPress={() => {
              setDoneDays((prev) =>
                prev.includes(pathDay.day.day) ? prev : [...prev, pathDay.day.day],
              );
              toast(`Day ${pathDay.day.day} done`, "checkmark-circle");
            }}
            feedback="dim"
            style={styles.markDone}
            testID="part-of-path-mark-done"
          >
            <Icon name="checkmark-circle-outline" size={17} color={c.muted} />
            <T style={[type.meta, { color: c.muted }]}>
              {`Mark Day ${pathDay.day.day} done`}
            </T>
          </Tap>
        ) : null}
      </View>
    );
  }, [pathDay, seconds, duration, sermon.id, go, toast]);

  // Moments tab body
  const momentsSlot = useMemo(() => {
    const stampWidth = moments.some((m) => m.at >= 3600) ? 86 : 74;
    let playingIdx = -1;
    moments.forEach((m, i) => {
      if (m.at <= seconds && seconds < Math.max(m.end, m.at + 20)) playingIdx = i;
    });
    const nextIdx = moments.findIndex((m) => m.at > seconds);
    const states: { state: MomentRowState; minutes?: number }[] = moments.map((m, i) => {
      if (i === playingIdx) return { state: "playing" };
      if (i === nextIdx && m.at - seconds <= 15 * 60) {
        return { state: "next", minutes: Math.max(0, Math.round((m.at - seconds) / 60)) };
      }
      return { state: m.at < seconds ? "past" : "default" };
    });
    const lifted = (s?: { state: MomentRowState }) =>
      s?.state === "playing" || s?.state === "next";

    return (
      <View testID="sermon-moments">
        <SectionHeader
          title="Moments in this sermon"
          size="sermon"
          count={`${moments.length} moment${moments.length === 1 ? "" : "s"}`}
          style={styles.momentsHeader}
        />
        {moments.map((m, i) => (
          <MomentRow
            key={m.id}
            testID="moment-row"
            at={m.at}
            title={m.title}
            quote={m.quote}
            state={states[i].state}
            comingUpMinutes={states[i].minutes}
            stampWidth={stampWidth}
            first={i > 0 && lifted(states[i - 1])}
            onPress={handleJumpToMoment}
          />
        ))}
      </View>
    );
  }, [moments, seconds, handleJumpToMoment]);

  // About tab body
  const aboutSlot = useMemo(
    () => (
      <View testID="sermon-about-tab">
        <SermonDescription
          sermon={sermon}
          pathTheme={pathDay?.day.theme ?? null}
        />
        <AboutSermon sermon={sermon} onYouTube={openYouTube} first />
        {inSeries && sName ? (
          <View style={{ marginTop: space.xl }}>
            <SeriesRow
              name={sName}
              part={seriesPart}
              total={series.length}
              fan={sFan}
              onPress={() =>
                go.push({ pathname: "/series/[key]", params: { key: sermon.seriesKey! } })
              }
            />
          </View>
        ) : null}
        <TopicsSection sermon={sermon} />
        <MoreSermons
          sermon={sermon}
          sermons={sermons}
          seriesName={inSeries && sName ? sName : null}
          onSeries={() =>
            go.push({ pathname: "/series/[key]", params: { key: sermon.seriesKey! } })
          }
        />
      </View>
    ),
    [sermon, pathDay, openYouTube, inSeries, sName, seriesPart, series.length, sFan, sermons, go],
  );

  return (
    <View style={styles.screen}>
      <FocusedStatusBar style="dark" animated={false} />
      <View style={{ height: insets.top, backgroundColor: c.bg }} />

      {/* 1. Light Header */}
      <LightHeader
        title={headerTitle}
        scrollTitle={headline(sermon)}
        scrollTitleShown={titleScrolledPast}
        onBack={go.back}
        onRightPress={() => setDrawerOpen(true)}
        rightLabel={pathDay ? "Path days" : "Moments in this sermon"}
        rightHint={
          pathDay
            ? `Opens the days in ${pathDay.path.name}`
            : "Opens the key moments in this sermon"
        }
      />

      {/* 2 & 3. Edge-to-edge 16:9 video with on-video controls */}
      <View style={styles.videoRow}>
        <StageVideoFrame
          fullscreen={fullscreen}
          width={videoWidth}
          height={videoHeight}
        >
          {/* Stand-in video surface for the preview route */}
          <View style={StyleSheet.absoluteFill} testID="dev-test-video">
            <Artwork
              art={sermon}
              width={Math.max(videoWidth, 640)}
              radius={0}
              lift="none"
              priority="high"
              fallback={headline(sermon)}
              style={{ width: "100%", height: "100%" }}
            />
            <View style={styles.videoDim} pointerEvents="none" />
            {activeCaption ? (
              <View pointerEvents="none" style={styles.captionBanner} testID="player-caption-banner">
                <T style={styles.captionText} numberOfLines={2}>
                  {activeCaption}
                </T>
              </View>
            ) : null}
          </View>

          <VideoOverlay
            playing={playing}
            seconds={seconds}
            duration={duration}
            rate={rate}
            captionsOn={captionsOn}
            fullscreen={fullscreen}
            marks={marks}
            glideKey={glideKey}
            toggleRef={toggleRef}
            onTogglePlay={() => setPlaying((p) => !p)}
            onSkip={handleSkip}
            onSeek={handleSeek}
            onCycleRate={handleCycleRate}
            onToggleCaptions={() => setCaptionsOn((c) => !c)}
            onToggleFullscreen={toggleFullscreen}
          />
        </StageVideoFrame>
      </View>

      {/* 4 & 5. Ivory page under the video: meta, Save/Share, Moments | About tabs */}
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 48 + insets.bottom }}
      >
        <View style={[styles.column, { width: columnWidth }]}>
          <SermonMeta
            sermon={sermon}
            kicker={kicker}
            onTitleLayout={onTitleLayout}
          />

          <SermonTabs
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            momentsCount={moments.length}
            pathSlot={pathSlot}
            momentsSlot={momentsSlot}
            aboutSlot={aboutSlot}
            bleedHorizontal={space.s20}
          />
        </View>
      </ScrollView>

      <Wash kind="pageEnd" band="bottom" height={40} />

      <DaysDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pathDay={pathDay}
        moments={moments}
        onSelectMoment={handleJumpToMoment}
        onOpenPath={
          pathDay
            ? (id) => go.push({ pathname: "/path/[id]", params: { id } })
            : undefined
        }
        onOpenYouTube={openYouTube}
        onShowAbout={() => setActiveTab("about")}
      />
    </View>
  );
}

export { LIGHT_HEADER_HEIGHT };

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.bg,
  },
  videoRow: {
    alignItems: "center",
    backgroundColor: c.black,
  },
  videoDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(15, 17, 21, 0.22)",
  },
  captionBanner: {
    position: "absolute",
    left: space.xl,
    right: space.xl,
    bottom: 54,
    alignItems: "center",
  },
  captionText: {
    fontFamily: font.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: c.white,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm / 2,
    textAlign: "center",
  },
  scroll: {
    flex: 1,
    backgroundColor: c.bg,
  },
  column: {
    alignSelf: "center",
    paddingHorizontal: space.s20,
  },
  momentsHeader: {
    marginBottom: 6,
    marginHorizontal: 4,
  },
  markDone: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 8,
    marginTop: 2,
  },
});
