import { usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  BackHandler,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isFlowRoute } from "../auth/gate";
import { useGo } from "../navigation";
import { easeOut, font, radius, shadows, space, tabular } from "../theme";
import {
  IconButton,
  SermonTitle,
  T,
  Tap,
  TextButton,
  Thumbnail,
  c,
  moveFocus,
  s,
  web,
} from "../ui";
import Embed from "./Embed";
import {
  DOCK_MARGIN,
  DOCK_PAD,
  clearStageFocusToggle,
  consumeStageFocusToggle,
  dockFrame,
  fullFrame,
  setChrome,
  setStageOverlay,
  stageToggleRef,
  useChrome,
  useStageOverlay,
} from "./layout";
import { BLOCKED, STILL, clock, usePlayback, usePlayerSession } from "./PlayerProvider";
import { VideoOverlay } from "./stage/VideoOverlay";
import { headline } from "../data/display";
import { canRetry, playerError } from "./types";
import { useDayDoneNotice } from "./dayDone";
import { useDockAboveTabs, usePublishDockInset } from "./useDockInset";

/**
 * Renders the app's single YouTube player. On the sermon's own screen it sits
 * in the Now Playing slot; everywhere else it docks at the bottom. The embed
 * keeps the same place in the tree in both, so moving never restarts it.
 */
export function PlayerHost() {
  const session = usePlayerSession();
  // A path day finished while it plays (docked or full) says so here.
  useDayDoneNotice();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const aboveTabs = useDockAboveTabs();
  const chrome = useChrome();
  const overlay = useStageOverlay();
  const { sermon, phase, cover, attempt, start, attach, onEvent, hold } =
    session;
  const pathname = usePathname();
  const full = !!sermon && session.stage === sermon.id;
  const isFullscreen = full && overlay.fullscreen;
  const rotateFullscreen = isFullscreen && turnsFullscreen(window);
  const nativeSafeSpan = rotateFullscreen
    ? Math.min(
        window.height - (insets.top > 0 ? insets.top + 4 : 0) - insets.bottom,
        Math.ceil(window.width * (16 / 9)),
      )
    : window.height;
  const fsWidth = rotateFullscreen ? nativeSafeSpan : window.width;
  const fsHeight = rotateFullscreen ? window.width : window.height;
  const d = dockFrame(window, insets, aboveTabs, chrome);
  const hidden = !!sermon && !full && d.compact;
  // The room screens keep below their content so it scrolls clear of the dock.
  usePublishDockInset(sermon && !full ? d.height + DOCK_MARGIN : 0);
  // Sign-in and onboarding screens cover the whole player, as the native
  // sheet and modals do. On the web this layer would otherwise draw over them.
  const covered = !!sermon && isFlowRoute(pathname.replace(/^\//, ""));
  // A video that can't be shown mustn't play.
  useEffect(() => {
    if (hidden || covered) hold();
  }, [hidden, covered, hold]);
  // Clear any pending focus-on-play flag if playback fails or the player closes.
  useEffect(() => {
    if (!sermon || phase === "error") clearStageFocusToggle();
  }, [sermon, phase]);
  // Exit fullscreen if the sermon docks or fails (its error panel and Try
  // again are on the page), or on Escape (web) / hardware Back (Android).
  useEffect(() => {
    if ((!full || phase === "error") && overlay.fullscreen) setStageOverlay({ fullscreen: false });
  }, [full, phase, overlay.fullscreen]);
  useEffect(() => {
    if (!isFullscreen) return;
    if (Platform.OS === "web") {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setStageOverlay({ fullscreen: false });
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
    StatusBar.setHidden(true, "fade");
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setStageOverlay({ fullscreen: false });
      return true;
    });
    return () => {
      StatusBar.setHidden(false, "fade");
      sub.remove();
    };
  }, [isFullscreen]);
  if (!sermon) return null;
  // The Now Playing screen shows its own error panel and poster.
  if (full && phase === "error") return null;
  const f = fullFrame(window, insets);
  const videoHeight = isFullscreen ? fsHeight : full ? f.height : d.videoHeight;
  return (
    // box-none must stay a prop: react-native-web only honours it there, and
    // as a style this full-screen layer would swallow every tap in the app.
    // In full screen VoiceOver keeps to the player; the sermon screen under
    // it is hidden from assistive tech too.
    <View
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      accessibilityViewIsModal={isFullscreen}
    >
      {isFullscreen ? <StatusBar hidden animated /> : null}
      <View
        testID={full ? "player-full" : "player-dock"}
        {...web({
          role: "region",
          "aria-label": full ? "Video player" : "Now playing",
        })}
        style={[
          styles.shell,
          isFullscreen
            ? {
                left: 0,
                top: 0,
                width: window.width,
                height: window.height,
                paddingTop: rotateFullscreen && insets.top > 0 ? insets.top + 4 : 0,
                paddingBottom: rotateFullscreen ? insets.bottom : 0,
                backgroundColor: "#000",
                zIndex: 100,
                alignItems: "center",
                justifyContent: "center",
              }
            : full
              ? { left: f.left, top: f.top, width: f.width }
              : { left: d.left, bottom: d.bottom, width: d.width },
          !full && styles.dock,
          covered && styles.gone,
        ]}
      >
        <View
          style={[
            styles.video,
            isFullscreen
              ? {
                  width: fsWidth,
                  height: fsHeight,
                  borderRadius: 0,
                  transform: rotateFullscreen ? [{ rotate: "90deg" }] : undefined,
                }
              : full
                ? { height: f.height, borderRadius: f.radius }
                : {
                    height: d.videoHeight,
                    margin: DOCK_PAD,
                    marginBottom: 0,
                    // Flush in the dock's top corners.
                    borderTopLeftRadius: radius.lg,
                    borderTopRightRadius: radius.lg,
                  },
            // Kept mounted, so opening Now Playing picks up where it paused.
            hidden && styles.gone,
          ]}
        >
          {phase !== "error" ? (
            <Embed
              key={attempt}
              ref={attach}
              videoId={sermon.id}
              height={videoHeight}
              startSeconds={start}
              onEvent={onEvent}
            />
          ) : (
            <View style={{ opacity: 0.4 }}>
              <Thumbnail sermon={sermon} height={d.videoHeight} />
            </View>
          )}
          {cover !== "off" && (
            // Never receives touches, and is gone once the player is ready,
            // so controls are never covered.
            <Animated.View
              testID="player-cover"
              style={[
                StyleSheet.absoluteFill,
                {
                  pointerEvents: "none",
                  opacity: cover === "fading" ? 0 : 1,
                  transitionProperty: "opacity",
                  transitionDuration: 200,
                  transitionTimingFunction: easeOut,
                },
              ]}
            >
              <Thumbnail
                sermon={sermon}
                height={videoHeight}
              />
              <View style={styles.center}>
                <View style={styles.spinner}>
                  <ActivityIndicator color={c.onMedia} />
                </View>
              </View>
            </Animated.View>
          )}
          {full && phase !== "error" ? <StageFullOverlay /> : null}
        </View>
        {!full && <DockBar compact={d.compact} />}
      </View>
    </View>
  );
}

/**
 * Full screen on a portrait phone turns the video 90° (the app is locked to
 * portrait). A browser turns its own page, so the web never does.
 */
function turnsFullscreen(window: { width: number; height: number }) {
  return Platform.OS !== "web" && window.height > window.width;
}

/**
 * Connects the Mindvalley VideoOverlay to the active player session when the
 * player is shown full-size on the sermon screen.
 */
function StageFullOverlay() {
  const session = usePlayerSession();
  const p = usePlayback();
  const overlay = useStageOverlay();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const rotateFullscreen = overlay.fullscreen && turnsFullscreen(window);

  useEffect(() => {
    if (consumeStageFocusToggle()) {
      moveFocus(stageToggleRef.current);
    }
  }, [overlay.focusToggleKey, session.attempt]);

  const fullscreenInsets = overlay.fullscreen
    ? rotateFullscreen
      ? {
          top: Math.max(insets.left, 8),
          bottom: Math.max(insets.right, 8),
          side: space.sm,
        }
      : {
          top: Math.max(insets.top, 8),
          bottom: Math.max(insets.bottom, 8),
          side: Math.max(insets.left, insets.right, 16),
        }
    : undefined;

  return (
    <VideoOverlay
      playing={p.playing}
      loading={session.phase === "loading"}
      seconds={p.seconds}
      duration={p.duration}
      rate={p.rate}
      captionsOn={p.captionsOn}
      fullscreen={overlay.fullscreen}
      rotated={rotateFullscreen}
      fullscreenInsets={fullscreenInsets}
      marks={overlay.marks}
      glideKey={overlay.glideKey}
      revealKey={overlay.revealKey}
      toggleRef={stageToggleRef}
      allowPassthroughTap={p.status === BLOCKED || p.status === STILL}
      onTogglePlay={p.toggle}
      onSkip={p.skip}
      onSeek={p.seek}
      onCycleRate={p.cycleRate}
      onToggleCaptions={p.toggleCaptions}
      onToggleFullscreen={() => setStageOverlay({ fullscreen: !overlay.fullscreen })}
    />
  );
}

/**
 * The dock and its focused Close button are gone. On web, put keyboard focus
 * back on the page: the selected tab, or the screen's Back or Close.
 */
function afterClose() {
  if (Platform.OS !== "web") {
    AccessibilityInfo.announceForAccessibility("Player closed.");
    return;
  }
  setTimeout(() => {
    const target = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="tab"][aria-selected="true"], [aria-label="Back"], [aria-label="Close"]',
      ),
    ).find((node) => !node.closest('[aria-hidden="true"]'));
    target?.focus();
  }, 0);
}

/**
 * The dock's slim bar: the title, then what's happening ("Loading…",
 * "Paused"), or while it plays how long is left ("1:12:04 left") over a
 * thin line of how far in it is.
 */
function DockBar({ compact }: { compact: boolean }) {
  const session = usePlayerSession();
  const playback = usePlayback();
  const go = useGo();
  const sermon = session.sermon!;
  const playing = playback.playing;
  const failed = session.phase === "error";
  const { duration, seconds } = playback;
  const status = failed
    ? "Couldn’t play"
    : compact
      ? "Paused · Open to keep watching"
      : session.phase === "loading"
        ? "Loading…"
        : playback.status || sermon.collection;
  // Playing is plain to see from the pause button: the line says what's left.
  const left = !failed && !compact && status === "Playing" && duration > 0;
  const played = !failed && duration > 0 ? Math.min(1, seconds / duration) : 0;
  return (
    <View
      style={styles.bar}
      onLayout={(e) => setChrome("dockBar", e.nativeEvent.layout.height)}
    >
      {played > 0 ? (
        <View style={[styles.line, compact && styles.lineInset]} {...web({ "aria-hidden": true })}>
          <View style={[styles.lineFill, { width: `${Math.round(played * 1000) / 10}%` }]} />
        </View>
      ) : null}
      <Tap
        accessibilityRole="button"
        // The label replaces the text inside, so it carries the status too
        // (the word, not the ticking time).
        accessibilityLabel={`Open Now Playing: ${headline(sermon)}. ${status}`}
        onPress={() =>
          go.push({ pathname: "/sermon/[id]", params: { id: sermon.id } })
        }
        feedback="dim"
        style={styles.barText}
      >
        <SermonTitle
          title={headline(sermon)}
          numberOfLines={1}
          style={styles.barTitle}
        />
        <T style={[s.meta, left && styles.left]} numberOfLines={1} testID="dock-status">
          {left ? `${clock(duration - seconds)} left` : status}
        </T>
      </Tap>
      {failed
        ? canRetry(session.error ?? 0) && (
            <TextButton label="Try again" onPress={session.retry} />
          )
        : !compact && (
            <IconButton
              name={playing ? "pause" : "play"}
              label={playing ? "Pause" : "Play"}
              color={c.accent}
              onPress={playback.toggle}
            />
          )}
      <IconButton
        name="close"
        label="Close player"
        color={c.muted}
        onPress={() => {
          session.close();
          afterClose();
        }}
      />
      {/* Native announces failures itself; on web these regions do. */}
      {Platform.OS === "web" && (
        <View style={styles.offscreen}>
          <T accessibilityRole="alert">
            {failed ? playerError(session.error ?? 0) : ""}
          </T>
          <T accessibilityLiveRegion="polite">
            {playback.state === 0 ? "Sermon ended." : ""}
          </T>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { position: "absolute" },
  // A white card lifted off the page like the tab bar under it (its
  // shadow carries the hairline edge); the video inside stays dark.
  dock: {
    backgroundColor: c.raised,
    borderRadius: radius.lg,
    boxShadow: shadows.floating,
  },
  video: { overflow: "hidden", backgroundColor: c.media },
  gone: { display: "none" },
  offscreen: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  // As tall as its 48pt buttons (layout.ts's DOCK_BAR_HEIGHT).
  bar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingStart: space.md,
    paddingEnd: space.xs,
  },
  // How far in, along the bar's top edge (inset from the rounded corners
  // when the bar is the whole dock).
  line: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: c.track,
  },
  lineInset: { left: radius.lg, right: radius.lg, borderRadius: 1, overflow: "hidden" },
  lineFill: { height: 2, backgroundColor: c.accent },
  // Fills the bar's height so the tap target is at least 48pt tall.
  barText: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignSelf: "stretch",
    justifyContent: "center",
    gap: 1,
  },
  barTitle: { fontFamily: font.semibold, fontSize: 14, lineHeight: 19 },
  left: tabular,
});
