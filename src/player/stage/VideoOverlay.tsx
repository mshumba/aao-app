import { memo, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useReducedMotion } from "../../motion";
import type { BandMarks } from "../NowPlaying";
import { clock, spokenClock } from "../PlayerProvider";
import { c, easeOut, font, radius, space, tabular, textCap } from "../../theme";
import { Icon, T, Tap, gradient, web } from "../../ui";
import { CcBadge, FullscreenIcon, Skip15Icon } from "./icons";
import { StageScrubber } from "./Scrubber";

const HIDE_AFTER_MS = 3000;

const TOP_SCRIM =
  "linear-gradient(180deg, rgba(15, 17, 21, 0.68) 0%, rgba(15, 17, 21, 0.24) 55%, rgba(15, 17, 21, 0) 100%)";
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
 * Contains only playback controls (per YouTube API policy): top-right CC,
 * centre -15 / white Play-Pause disc / +15, and bottom elapsed time, navy/gold
 * scrubber with moment dots, total time, speed pill (1x), and full screen.
 */
export const VideoOverlay = memo(function VideoOverlay({
  playing,
  loading = false,
  seconds,
  duration,
  rate,
  captionsOn,
  fullscreen,
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
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (!playing) return;
    hideTimer.current = setTimeout(() => {
      setVisible(false);
    }, HIDE_AFTER_MS);
  }, [clearHideTimer, playing]);

  // Show controls whenever paused; hide 3s after play starts.
  useEffect(() => {
    if (!playing) {
      clearHideTimer();
      setVisible(true);
      return;
    }
    scheduleHide();
    return clearHideTimer;
  }, [playing, clearHideTimer, scheduleHide]);

  const registerInteraction = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const toggleVisibility = useCallback(() => {
    setVisible((was) => {
      const next = !was;
      if (next && playing) scheduleHide();
      else clearHideTimer();
      return next;
    });
  }, [playing, scheduleHide, clearHideTimer]);

  const shownSeconds = previewSeconds ?? seconds;
  const totalSeconds = duration > 0 ? duration : marks.estimate;

  return (
    <View
      style={styles.root}
      pointerEvents={allowPassthroughTap ? "box-none" : "auto"}
      {...web({ dataSet: { dark: "true" } })}
    >
      {/* Tap catcher to toggle controls visibility */}
      {!allowPassthroughTap ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={toggleVisibility}
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide video controls" : "Show video controls"}
          testID="video-overlay-backdrop"
        />
      ) : null}

      <Animated.View
        pointerEvents={visible ? "box-none" : "none"}
        style={[
          styles.overlayBox,
          {
            opacity: visible ? 1 : 0,
            transitionProperty: "opacity",
            transitionDuration: reduced ? 0 : 180,
            transitionTimingFunction: easeOut,
          },
        ]}
        {...web({ "aria-hidden": !visible })}
      >
        {/* Soft dark scrim at the top and bottom */}
        <View
          pointerEvents="none"
          style={[styles.topScrim, gradient(TOP_SCRIM)]}
        />
        <View
          pointerEvents="none"
          style={[styles.bottomScrim, gradient(BOTTOM_SCRIM)]}
        />

        {/* Top row: leaves top-centre room for a future Video/Audio switch; CC on the right */}
        <View pointerEvents="box-none" style={styles.topRow}>
          <View pointerEvents="none" style={styles.futureSwitchSlot} />
          <View style={styles.topRightActions}>
            <Tap
              accessibilityRole="button"
              accessibilityLabel={captionsOn ? "Closed captions on" : "Closed captions off"}
              accessibilityHint="Toggles video captions"
              accessibilityState={{ selected: captionsOn }}
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
        <View pointerEvents="box-none" style={styles.centerRow}>
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

        {/* Bottom row: elapsed time, scrubber, total time, speed pill (1x), full screen */}
        <View pointerEvents="box-none" style={styles.bottomRow}>
          <T
            style={styles.timeText}
            testID="elapsed"
            accessibilityLabel={`${spokenClock(shownSeconds)} played`}
            maxFontSizeMultiplier={textCap.chip}
          >
            {clock(shownSeconds)}
          </T>

          <StageScrubber
            seconds={seconds}
            duration={duration}
            marks={marks}
            glideKey={glideKey}
            onSeek={onSeek}
            onSkip={onSkip}
            onPreviewChange={setPreviewSeconds}
            onInteract={registerInteraction}
          />

          <T
            style={styles.timeText}
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
              <T style={styles.speedText} maxFontSizeMultiplier={1.2}>
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
  overlayBox: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
  },
  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 76,
  },
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 92,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    minHeight: 48,
  },
  futureSwitchSlot: {
    flex: 1,
    minHeight: 36,
  },
  topRightActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  ccButton: {
    width: 44,
    height: 44,
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
    paddingLeft: space.md,
    paddingRight: space.xs,
    paddingBottom: space.xs,
    gap: 6,
    minHeight: 48,
  },
  timeText: {
    fontFamily: font.bold,
    fontSize: 12.5,
    lineHeight: 16,
    color: c.white,
    ...tabular,
  },
  speedTarget: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  speedPill: {
    minWidth: 38,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.85)",
    backgroundColor: "rgba(15, 17, 21, 0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  speedText: {
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 15,
    color: c.white,
    ...tabular,
  },
  fullscreenButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
