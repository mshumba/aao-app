import { memo, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { useReducedMotion } from "../../motion";
import type { BandMarks } from "../NowPlaying";
import { clock, spokenClock } from "../PlayerProvider";
import { c, easeOut, font, radius, space, tabular, textCap } from "../../theme";
import { Icon, T, Tap, gradient, web } from "../../ui";
import { CcBadge, FullscreenIcon, Skip15Icon } from "./icons";
import { StageScrubber } from "./Scrubber";

const HIDE_AFTER_MS = 3000;

/**
 * YouTube's title strip at the top (~48pt) and logo corner at the bottom-right
 * (~96×44pt) stay clear of our buttons, shading, and tap layer at all times.
 */
export const YOUTUBE_TOP_CLEAR = 48;
export const YOUTUBE_LOGO_WIDTH = 96;
export const YOUTUBE_LOGO_HEIGHT = 44;

const BOTTOM_SCRIM =
  "linear-gradient(0deg, rgba(15, 17, 21, 0.78) 0%, rgba(15, 17, 21, 0.34) 60%, rgba(15, 17, 21, 0) 100%)";

export type VideoOverlayProps = {
  /** Whether playback is currently running (or buffering after starting). */
  playing: boolean;
  /** Whether the player is still loading. */
  loading?: boolean;
  /** Current position in seconds. */
  seconds: number;
  /** Total duration in seconds (0 until known). */
  duration: number;
  /** Current playback speed (1, 1.25, 1.5, 2, 0.75). */
  rate: number;
  /** Whether YouTube captions are currently enabled. */
  captionsOn: boolean;
  /** Whether the stage is currently in full-screen mode. */
  fullscreen: boolean;
  /** Safe-area padding when rotated into landscape full-screen. */
  fullscreenInsets?: { top: number; bottom: number; side: number };
  /** Key moments and estimated length for the scrubber. */
  marks: BandMarks;
  /** Bumped when jumping to a moment so the thumb glides. */
  glideKey?: number;
  /** Ref to the Play/Pause button for focus management. */
  toggleRef?: RefObject<View | null>;
  /** When true, browser blocked programmatic autoplay so the underlying iframe must remain tappable. */
  allowPassthroughTap?: boolean;
  onTogglePlay: () => void;
  onSkip: (deltaSeconds: number) => void;
  onSeek: (seconds: number) => void;
  onCycleRate: () => void;
  onToggleCaptions: () => void;
  onToggleFullscreen: () => void;
};

/**
 * Mindvalley-inspired playback overlay drawn over the 16:9 video frame.
 * Leaves YouTube's top 48pt title strip and bottom-right 96×44pt logo corner
 * completely clear of buttons, shading, and tap catchers at all times, and
 * drops shading and the backdrop while paused so YouTube's pause overlay shows.
 */
export const VideoOverlay = memo(function VideoOverlay({
  playing,
  loading = false,
  seconds,
  duration,
  rate,
  captionsOn,
  fullscreen,
  fullscreenInsets,
  marks,
  glideKey = 0,
  toggleRef,
  allowPassthroughTap = false,
  onTogglePlay,
  onSkip,
  onSeek,
  onCycleRate,
  onToggleCaptions,
  onToggleFullscreen,
}: VideoOverlayProps) {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const [previewSeconds, setPreviewSeconds] = useState<number | null>(null);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = previewSeconds != null;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (active) setScreenReaderEnabled(Boolean(on));
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", (on) => {
      setScreenReaderEnabled(Boolean(on));
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (!playing || dragging || screenReaderEnabled) return;
    hideTimer.current = setTimeout(() => {
      setVisible(false);
    }, HIDE_AFTER_MS);
  }, [clearHideTimer, playing, dragging, screenReaderEnabled]);

  // Show controls whenever paused, dragging, or using a screen reader; hide 3s after play starts.
  useEffect(() => {
    if (!playing || dragging || screenReaderEnabled) {
      clearHideTimer();
      setVisible(true);
      return;
    }
    scheduleHide();
    return clearHideTimer;
  }, [playing, dragging, screenReaderEnabled, clearHideTimer, scheduleHide]);

  const registerInteraction = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const toggleVisibility = useCallback(() => {
    setVisible((was) => {
      const next = !was;
      if (next && playing && !dragging && !screenReaderEnabled) scheduleHide();
      else clearHideTimer();
      return next;
    });
  }, [playing, dragging, screenReaderEnabled, scheduleHide, clearHideTimer]);

  const shownSeconds = previewSeconds ?? seconds;
  const totalSeconds = duration > 0 ? duration : marks.estimate;
  // Fixed tabular width sized to the sermon's total length so 9:59 -> 10:00
  // or 59:59 -> 1:00:00 never shifts the scrubber rail under the finger.
  const timeWidth = totalSeconds >= 3600 ? 48 : 36;

  const fsTop = fullscreen ? (fullscreenInsets?.top ?? 0) : 0;
  const fsBottom = fullscreen ? (fullscreenInsets?.bottom ?? 0) : 0;
  const fsSide = fullscreen ? (fullscreenInsets?.side ?? 0) : 0;

  // Only catch background taps while actively playing; when paused, let taps
  // outside our buttons reach YouTube's pause overlay.
  const showBackdrop = playing && !allowPassthroughTap;
  const childBoxPointerEvents = visible ? "box-none" : "none";
  const childAutoPointerEvents = visible ? "auto" : "none";

  return (
    <View
      style={styles.root}
      pointerEvents="box-none"
      {...web({ dataSet: { dark: "true" } })}
    >
      {/* Tap catcher to toggle controls visibility while playing (leaves top 48pt and bottom 44pt clear) */}
      {showBackdrop ? (
        <Pressable
          style={styles.backdrop}
          onPress={toggleVisibility}
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide video controls" : "Show video controls"}
          testID="video-overlay-backdrop"
        />
      ) : null}

      <Animated.View
        pointerEvents={childBoxPointerEvents}
        {...web({
          onFocusCapture: registerInteraction,
          ...(!visible ? { "aria-hidden": true, inert: true } : {}),
        })}
        style={[
          styles.overlayBox,
          {
            opacity: visible ? 1 : 0,
            transitionProperty: "opacity",
            transitionDuration: reduced ? 0 : 180,
            transitionTimingFunction: easeOut,
          },
        ]}
      >
        {/* Bottom scrim only while playing, and clear of the 96×44pt YouTube logo corner */}
        {playing ? (
          <View
            pointerEvents="none"
            style={[
              styles.bottomScrim,
              { right: Math.max(YOUTUBE_LOGO_WIDTH, fsSide) },
              gradient(BOTTOM_SCRIM),
            ]}
          />
        ) : null}

        {/* Top row: leaves top 48pt clear for YouTube's title strip; CC on the right */}
        <View
          pointerEvents={childBoxPointerEvents}
          style={[
            styles.topRow,
            {
              marginTop: Math.max(YOUTUBE_TOP_CLEAR, fsTop),
              paddingLeft: Math.max(space.sm, fsSide),
              paddingRight: Math.max(space.xs, fsSide),
            },
          ]}
        >
          <View pointerEvents="none" style={styles.futureSwitchSlot} />
          <View pointerEvents={childAutoPointerEvents} style={styles.topRightActions}>
            <Tap
              accessibilityRole="button"
              accessibilityLabel={captionsOn ? "Closed captions on" : "Closed captions off"}
              accessibilityHint="Toggles video captions"
              accessibilityState={{ selected: captionsOn, disabled: loading }}
              disabled={loading}
              {...web({ "aria-pressed": captionsOn })}
              onPress={() => {
                registerInteraction();
                onToggleCaptions();
              }}
              feedback="scale"
              style={styles.ccButton}
              testID="player-cc-button"
            >
              <CcBadge active={captionsOn} />
            </Tap>
          </View>
        </View>

        {/* Centre transport: back 15s, large white play/pause disc, forward 15s */}
        <View pointerEvents={childBoxPointerEvents} style={styles.centerRow}>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Back 15 seconds"
            disabled={loading}
            onPress={() => {
              registerInteraction();
              onSkip(-15);
            }}
            feedback="scale"
            style={styles.skipButton}
            testID="player-skip-back"
          >
            <Skip15Icon direction="back" size={34} color={c.white} />
          </Tap>

          <Tap
            ref={toggleRef}
            accessibilityRole="button"
            accessibilityLabel={playing ? "Pause" : "Play"}
            busy={loading}
            aria-busy={loading}
            onPress={() => {
              registerInteraction();
              onTogglePlay();
            }}
            feedback="scale"
            style={styles.playDisc}
            testID="now-playing-toggle"
          >
            {loading ? (
              <ActivityIndicator color={c.media} />
            ) : (
              <View style={!playing ? styles.playNudge : null}>
                <Icon name={playing ? "pause" : "play"} size={28} color={c.media} />
              </View>
            )}
          </Tap>

          <Tap
            accessibilityRole="button"
            accessibilityLabel="Forward 15 seconds"
            disabled={loading}
            onPress={() => {
              registerInteraction();
              onSkip(15);
            }}
            feedback="scale"
            style={styles.skipButton}
            testID="player-skip-forward"
          >
            <Skip15Icon direction="forward" size={34} color={c.white} />
          </Tap>
        </View>

        {/* Bottom row: elapsed time, scrubber, total time, speed pill (1x), full screen.
            Stops 96pt short of the right edge so the YouTube logo corner stays clear. */}
        <View
          pointerEvents={childBoxPointerEvents}
          style={[
            styles.bottomRow,
            {
              paddingLeft: Math.max(space.sm, fsSide),
              marginRight: Math.max(YOUTUBE_LOGO_WIDTH, fsSide),
              marginBottom: fsBottom,
            },
          ]}
        >
          <T
            style={[styles.timeText, styles.timeElapsed, { width: timeWidth }]}
            numberOfLines={1}
            testID="elapsed"
            accessibilityLabel={`${spokenClock(shownSeconds)} played`}
            maxFontSizeMultiplier={textCap.chip}
          >
            {clock(shownSeconds)}
          </T>

          <StageScrubber
            seconds={seconds}
            previewSeconds={previewSeconds}
            duration={duration}
            marks={marks}
            glideKey={glideKey}
            onSeek={onSeek}
            onSkip={onSkip}
            onPreviewChange={setPreviewSeconds}
            onInteract={registerInteraction}
          />

          <T
            style={[styles.timeText, styles.timeDuration, { width: timeWidth }]}
            numberOfLines={1}
            testID="duration"
            accessibilityLabel={
              totalSeconds > 0
                ? `${spokenClock(totalSeconds)} total`
                : "Length not known yet"
            }
            maxFontSizeMultiplier={textCap.chip}
          >
            {totalSeconds > 0 ? clock(totalSeconds) : "–:––"}
          </T>

          <Tap
            accessibilityRole="button"
            accessibilityLabel={`Playback speed ${rate} times`}
            accessibilityHint="Changes the playback speed"
            disabled={loading}
            onPress={() => {
              registerInteraction();
              onCycleRate();
            }}
            feedback="scale"
            style={styles.speedTarget}
            testID="player-speed-button"
          >
            <View style={styles.speedPill}>
              <T style={styles.speedText} maxFontSizeMultiplier={1.15}>
                {`${rate}x`}
              </T>
            </View>
          </Tap>

          <Tap
            accessibilityRole="button"
            accessibilityLabel={fullscreen ? "Exit full screen" : "Full screen"}
            onPress={() => {
              registerInteraction();
              onToggleFullscreen();
            }}
            feedback="scale"
            style={styles.fullscreenButton}
            testID="player-fullscreen-button"
          >
            <FullscreenIcon exit={fullscreen} size={18} color={c.white} />
          </Tap>
        </View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
  },
  backdrop: {
    position: "absolute",
    top: YOUTUBE_TOP_CLEAR,
    bottom: YOUTUBE_LOGO_HEIGHT,
    left: 0,
    right: 0,
  },
  overlayBox: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
  },
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 52,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 36,
  },
  futureSwitchSlot: {
    flex: 1,
    height: 36,
  },
  topRightActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  ccButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  centerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
  },
  skipButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(15, 17, 21, 0.36)",
    alignItems: "center",
    justifyContent: "center",
  },
  playDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.white,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 18px rgba(0, 0, 0, 0.32)",
  },
  playNudge: {
    transform: [{ translateX: 2 }],
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 0,
    gap: 2,
    height: YOUTUBE_LOGO_HEIGHT,
  },
  timeText: {
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 16,
    color: c.white,
    ...tabular,
  },
  timeElapsed: {
    textAlign: "right",
  },
  timeDuration: {
    textAlign: "left",
  },
  speedTarget: {
    width: 40,
    height: YOUTUBE_LOGO_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  speedPill: {
    width: 38,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.85)",
    backgroundColor: "rgba(15, 17, 21, 0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  speedText: {
    fontFamily: font.bold,
    fontSize: 11.5,
    lineHeight: 14,
    color: c.white,
    ...tabular,
  },
  fullscreenButton: {
    width: 36,
    height: YOUTUBE_LOGO_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
});
