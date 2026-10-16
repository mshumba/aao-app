import { usePathname } from "expo-router";
import { useEffect } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isFlowRoute } from "../auth/gate";
import { useGo } from "../navigation";
import { easeOut, font, radius, space } from "../theme";
import {
  IconButton,
  SermonTitle,
  T,
  Tap,
  TextButton,
  Thumbnail,
  c,
  s,
  web,
} from "../ui";
import Embed from "./Embed";
import {
  DOCK_MARGIN,
  DOCK_PAD,
  dockFrame,
  fullFrame,
  setChrome,
  useChrome,
} from "./layout";
import { usePlayback, usePlayerSession } from "./PlayerProvider";
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
  const { sermon, phase, cover, attempt, start, attach, onEvent, hold } =
    session;
  const pathname = usePathname();
  const full = !!sermon && session.stage === sermon.id;
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
  if (!sermon) return null;
  // The Now Playing screen shows its own error panel and poster.
  if (full && phase === "error") return null;
  const f = fullFrame(window, insets);
  return (
    // box-none must stay a prop: react-native-web only honours it there, and
    // as a style this full-screen layer would swallow every tap in the app.
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        testID={full ? "player-full" : "player-dock"}
        {...web({
          role: "region",
          "aria-label": full ? "Video player" : "Now playing",
        })}
        style={[
          styles.shell,
          full
            ? { left: f.left, top: f.top, width: f.width }
            : { left: d.left, bottom: d.bottom, width: d.width },
          !full && styles.dock,
          covered && styles.gone,
        ]}
      >
        <View
          style={[
            styles.video,
            full
              ? { height: f.height, borderRadius: f.radius }
              : {
                  height: d.videoHeight,
                  margin: DOCK_PAD,
                  marginBottom: 0,
                  borderRadius: radius.sm,
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
              height={full ? f.height : d.videoHeight}
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
            // so YouTube's own controls are never covered.
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
                height={full ? f.height : d.videoHeight}
              />
              <View style={styles.center}>
                <View style={styles.spinner}>
                  <ActivityIndicator color={c.onMedia} />
                </View>
              </View>
            </Animated.View>
          )}
        </View>
        {!full && <DockBar compact={d.compact} />}
      </View>
    </View>
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

function DockBar({ compact }: { compact: boolean }) {
  const session = usePlayerSession();
  const playback = usePlayback();
  const go = useGo();
  const sermon = session.sermon!;
  const playing = playback.playing;
  const failed = session.phase === "error";
  const status = failed
    ? "Couldn’t play"
    : compact
      ? "Paused · Open to keep watching"
      : session.phase === "loading"
        ? "Loading…"
        : playback.status || sermon.collection;
  return (
    <View
      style={styles.bar}
      onLayout={(e) => setChrome("dockBar", e.nativeEvent.layout.height)}
    >
      <Tap
        accessibilityRole="button"
        // The label replaces the text inside, so it carries the status too.
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
        <T style={s.meta} numberOfLines={1} testID="dock-status">
          {status}
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
  // A white card lifted off the page by a hairline and a soft shadow; the
  // video inside stays dark. (The hairline width is part of the geometry
  // layout.ts expects, so only its colour changed.)
  dock: {
    backgroundColor: c.raised,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    boxShadow: `0 8px 24px ${c.shadow}`,
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
  bar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingStart: space.md,
    paddingEnd: space.xs,
  },
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
});
