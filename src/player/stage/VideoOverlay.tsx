import { memo, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import Animated from "react-native-reanimated";
import { useReducedMotion } from "../../motion";
import type { BandMarks } from "../NowPlaying";
import { clock, spokenClock } from "../PlayerProvider";
import { revealStageControls, stageToggleRef } from "../layout";
import { c, easeOut, font, radius, space, tabular } from "../../theme";
import { Icon, T, Tap, gradient, moveFocus, web } from "../../ui";
import { CcBadge, FullscreenIcon, Skip15Icon } from "./icons";
import { StageScrubber } from "./Scrubber";

const HIDE_AFTER_MS = 3000;

/**
 * While YouTube's player is in use, its title strip at the top (~48pt) and
 * logo corner at the bottom-right (~96×44pt) stay clear of our buttons,
 * shading, and tap layer at all times.
 */
const YOUTUBE_TOP_CLEAR = 48;
const YOUTUBE_LOGO_WIDTH = 96;
const YOUTUBE_LOGO_HEIGHT = 44;

/** The times grow with the system text size up to this, and their boxes with them. */
const TIME_TEXT_CAP = 1.3;
const SPEED_TEXT_CAP = 1.15;
const SPEED_WIDTH = 44;
const FULLSCREEN_WIDTH = 36;
const ROW_GAP = 2;
/** The least rail worth dragging; below it the speed pill moves up beside CC. */
const MIN_RAIL = 72;

const BOTTOM_SCRIM =
  "linear-gradient(0deg, rgba(15, 17, 21, 0.78) 0%, rgba(15, 17, 21, 0.34) 60%, rgba(15, 17, 21, 0) 100%)";

/** Not announced or reachable by keyboard: the labelled backdrop is the one control. */
const decorative = {
  accessible: false,
  importantForAccessibility: "no",
  focusable: false,
  ...web({ "aria-hidden": true, tabIndex: -1 }),
} as const;

/**
 * Brings the stage's controls back if they have faded and moves focus to
 * Play/Pause (the sermon page's "Go to video player", Start over).
 */
export function focusStageToggle() {
  revealStageControls();
  requestAnimationFrame(() => moveFocus(stageToggleRef.current));
}

/** Web: whether focus arrived by keyboard (or assistive tech), not a pointer. */
function focusedByKeyboard(target: unknown) {
  const node = target as { matches?: (selector: string) => boolean } | null;
  try {
    return node?.matches?.(":focus-visible") ?? true;
  } catch {
    // A browser without :focus-visible: keep the controls up.
    return true;
  }
}

type VideoOverlayProps = {
  /**
   * The YouTube embed is playing, so YouTube's keep-outs apply (its title
   * strip, its logo corner, its pause screen) and CC drives its captions.
   * The app's own player has no keep-outs and, for now, no captions.
   */
  youtube?: boolean;
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
  /** Full screen turned 90° on a portrait phone (native only). */
  rotated?: boolean;
  /** Safe-area padding when rotated into landscape full-screen. */
  fullscreenInsets?: { top: number; bottom: number; side: number };
  /** Key moments and estimated length for the scrubber. */
  marks: BandMarks;
  /** Bumped when jumping to a moment so the thumb glides. */
  glideKey?: number;
  /** Bumped to bring faded controls back (revealStageControls). */
  revealKey?: number;
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
 * Over YouTube's player it leaves the top 48pt title strip and bottom-right
 * 96×44pt logo corner completely clear of buttons, shading, and tap catchers
 * at all times, and drops shading and the backdrop while paused so YouTube's
 * pause overlay shows. Over the app's own player it uses the whole frame.
 * While playing, the controls fade 3 s after the last touch, except while a
 * screen reader is on (native) or keyboard focus is inside them (web).
 */
export const VideoOverlay = memo(function VideoOverlay({
  youtube = true,
  playing,
  loading = false,
  seconds,
  duration,
  rate,
  captionsOn,
  fullscreen,
  rotated = false,
  fullscreenInsets,
  marks,
  glideKey = 0,
  revealKey = 0,
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
  const window = useWindowDimensions();
  const [visible, setVisible] = useState(true);
  const [previewSeconds, setPreviewSeconds] = useState<number | null>(null);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [frameWidth, setFrameWidth] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Web: keyboard focus is on one of our controls, so they stay up.
  const focusInside = useRef(false);
  const rootRef = useRef<View>(null);
  const fullscreenRef = useRef<View>(null);
  const dragging = previewSeconds != null;

  // Asked to come back (focus is about to move to Play/Pause).
  const [seenReveal, setSeenReveal] = useState(revealKey);
  if (revealKey !== seenReveal) {
    setSeenReveal(revealKey);
    setVisible(true);
  }

  // react-native-web always answers true here, so the web skips it (screen
  // readers there keep the controls up by holding focus in them).
  useEffect(() => {
    if (Platform.OS === "web") return;
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
    if (!playing || dragging || screenReaderEnabled || focusInside.current) return;
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

  // Brought back on purpose: the usual 3 s from now.
  const firstReveal = useRef(revealKey);
  useEffect(() => {
    if (revealKey !== firstReveal.current) scheduleHide();
    // Only when asked again, not as playback changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);

  // Full screen on a phone moves the controls; take VoiceOver/TalkBack to
  // the way back out.
  useEffect(() => {
    if (!fullscreen || Platform.OS === "web") return;
    const timer = setTimeout(() => moveFocus(fullscreenRef.current), 300);
    return () => clearTimeout(timer);
  }, [fullscreen]);

  const registerInteraction = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const toggleVisibility = useCallback(() => {
    if (visible) {
      clearHideTimer();
      setVisible(false);
    } else {
      setVisible(true);
      scheduleHide();
    }
  }, [visible, clearHideTimer, scheduleHide]);

  // Web: keyboard focus inside holds the controls up; a mouse click that
  // focused one doesn't (its press already shows them for 3 s). A key
  // pressed on a control that a click focused holds them from then on.
  const onFocusIn = useCallback(
    (e: { target: unknown }) => {
      focusInside.current = focusedByKeyboard(e.target);
      if (focusInside.current) clearHideTimer();
    },
    [clearHideTimer],
  );
  const onKeyIn = useCallback(() => {
    focusInside.current = true;
    clearHideTimer();
  }, [clearHideTimer]);
  const onFocusOut = useCallback(
    (e: { relatedTarget: unknown }) => {
      const root = rootRef.current as unknown as { contains: (node: unknown) => boolean } | null;
      if (e.relatedTarget && root?.contains(e.relatedTarget)) return;
      focusInside.current = false;
      if (visible) scheduleHide();
    },
    [visible, scheduleHide],
  );

  const shownSeconds = previewSeconds ?? seconds;
  const totalSeconds = duration > 0 ? duration : marks.estimate;
  // Fixed tabular widths sized to the sermon's total length and the text
  // size, so 9:59 -> 10:00 or 59:59 -> 1:00:00 never shifts the rail under
  // the finger and "3:35:14" never truncates. Manrope's tabular figures are
  // 0.62em and its colon 0.343em: "3:35:14" is 45.4pt at 12pt, "46:12" 33.9pt.
  const textScale = Math.min(window.fontScale, TIME_TEXT_CAP);
  const timeWidth = Math.ceil((totalSeconds >= 3600 ? 45.5 : 34) * textScale);

  const fsTop = fullscreen ? (fullscreenInsets?.top ?? 0) : 0;
  const fsBottom = fullscreen ? (fullscreenInsets?.bottom ?? 0) : 0;
  const fsSide = fullscreen ? (fullscreenInsets?.side ?? 0) : 0;
  const topClear = youtube ? YOUTUBE_TOP_CLEAR : space.sm;
  // What the bottom row keeps clear on its right: YouTube's logo corner, or
  // just the edge (and the safe area in full screen).
  const logoClear = youtube ? Math.max(YOUTUBE_LOGO_WIDTH, fsSide) : 0;
  const rowPadRight = youtube ? 0 : Math.max(space.xs, fsSide);
  const rowPadLeft = Math.max(space.sm, fsSide);

  // A narrow frame (a 320pt phone, or large text) can't fit the speed pill
  // in the bottom row and keep a rail worth dragging: it sits beside CC.
  const estimate = fullscreen && rotated ? window.height : window.width;
  const rowWidth = (frameWidth || estimate) - logoClear - rowPadRight;
  const speedUp =
    rowWidth <
    rowPadLeft + timeWidth * 2 + SPEED_WIDTH + FULLSCREEN_WIDTH + ROW_GAP * 4 + MIN_RAIL;
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setFrameWidth((was) => (Math.abs(was - w) < 0.5 ? was : w));
  }, []);

  // Only catch background taps while actively playing; when paused, let taps
  // outside our buttons reach YouTube's pause overlay.
  const showBackdrop = playing && !allowPassthroughTap;
  // Shading under the times: over YouTube only while it plays (its pause
  // screen has its own), over the app's own player whenever they show.
  const showScrim = playing || !youtube;
  const childBoxPointerEvents = visible ? "box-none" : "none";
  const childAutoPointerEvents = visible ? "auto" : "none";

  const speedButton = (inTopRow: boolean) => (
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
      style={[styles.speedTarget, inTopRow && styles.speedTargetTop]}
      testID="player-speed-button"
    >
      <View style={styles.speedPill}>
        <T style={styles.speedText} numberOfLines={1} maxFontSizeMultiplier={SPEED_TEXT_CAP}>
          {`${rate}x`}
        </T>
      </View>
    </Tap>
  );

  return (
    <View
      ref={rootRef}
      style={styles.root}
      pointerEvents="box-none"
      onLayout={onLayout}
      {...web({
        dataSet: { dark: "true" },
        onFocus: onFocusIn,
        onBlur: onFocusOut,
        onKeyDown: onKeyIn,
      })}
    >
      {showBackdrop ? (
        <>
          {/* Tap catcher to toggle controls visibility while playing (over
              YouTube, it leaves the top 48pt clear) */}
          <Pressable
            style={[styles.backdrop, !youtube && styles.backdropWhole]}
            onPress={toggleVisibility}
            accessibilityRole="button"
            accessibilityLabel={visible ? "Hide video controls" : "Show video controls"}
            // With a screen reader on nothing hides, and VoiceOver would
            // activate it by tapping its centre: Play/Pause.
            {...(screenReaderEnabled ? decorative : null)}
            testID="video-overlay-backdrop"
          />
          {/* The bottom strip beside YouTube's logo corner: a tap where the
              times and rail were brings them back rather than reaching YouTube. */}
          {youtube ? (
            <Pressable
              style={[styles.strip, { right: logoClear }]}
              onPress={toggleVisibility}
              {...decorative}
              testID="video-overlay-strip"
            />
          ) : null}
        </>
      ) : null}

      <Animated.View
        pointerEvents={childBoxPointerEvents}
        {...web(!visible ? { "aria-hidden": true, inert: true } : {})}
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
        {/* Bottom scrim, clear of the 96×44pt YouTube logo corner */}
        {showScrim ? (
          <View
            pointerEvents="none"
            style={[styles.bottomScrim, { right: logoClear }, gradient(BOTTOM_SCRIM)]}
          />
        ) : null}

        {/* Top row: leaves top 48pt clear for YouTube's title strip; CC on the right */}
        <View
          pointerEvents={childBoxPointerEvents}
          style={[
            styles.topRow,
            {
              marginTop: Math.max(topClear, fsTop),
              paddingLeft: Math.max(space.sm, fsSide),
              paddingRight: Math.max(space.xs, fsSide),
            },
          ]}
        >
          <View pointerEvents="none" style={styles.futureSwitchSlot} />
          <View pointerEvents={childAutoPointerEvents} style={styles.topRightActions}>
            {speedUp ? speedButton(true) : null}
            {/* R2 has no caption track yet, so CC is offered only for YouTube. */}
            {youtube ? (
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
            ) : null}
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
            Over YouTube it stops 96pt short of the right edge so its logo corner stays clear. */}
        <View
          pointerEvents={childBoxPointerEvents}
          style={[
            styles.bottomRow,
            {
              paddingLeft: rowPadLeft,
              paddingRight: rowPadRight,
              marginRight: logoClear,
              marginBottom: fsBottom,
            },
          ]}
        >
          <T
            style={[styles.timeText, styles.timeElapsed, { width: timeWidth }]}
            numberOfLines={1}
            testID="elapsed"
            accessibilityLabel={`${spokenClock(shownSeconds)} played`}
            maxFontSizeMultiplier={TIME_TEXT_CAP}
          >
            {clock(shownSeconds)}
          </T>

          <StageScrubber
            seconds={seconds}
            previewSeconds={previewSeconds}
            duration={duration}
            marks={marks}
            glideKey={glideKey}
            rotated={rotated}
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
            maxFontSizeMultiplier={TIME_TEXT_CAP}
          >
            {totalSeconds > 0 ? clock(totalSeconds) : "–:––"}
          </T>

          {speedUp ? null : speedButton(false)}

          <Tap
            ref={fullscreenRef}
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
  backdropWhole: { top: 0, bottom: 0 },
  strip: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: YOUTUBE_LOGO_HEIGHT,
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
    gap: ROW_GAP,
    height: YOUTUBE_LOGO_HEIGHT,
    // Never reaches into the logo corner, whatever the text size.
    overflow: "hidden",
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
    width: SPEED_WIDTH,
    height: YOUTUBE_LOGO_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  // The top row is 36pt tall and sits right under YouTube's title strip.
  speedTargetTop: {
    height: 36,
  },
  speedPill: {
    minWidth: 41,
    height: 24,
    paddingHorizontal: 2,
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
    width: FULLSCREEN_WIDTH,
    height: YOUTUBE_LOGO_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
});
