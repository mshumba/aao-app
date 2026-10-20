import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useReducedMotion } from "../../motion";
import type { BandMarks } from "../NowPlaying";
import { spokenClock } from "../PlayerProvider";
import { c, easeOut, radius, shadows } from "../../theme";
import { web } from "../../ui";

/** 44pt touch target height so the scrubber is always easy to grab. */
const SCRUBBER_TOUCH_HEIGHT = 44;
const RAIL_PAD = 8;
const RAIL_HEIGHT = 5;
const THUMB_SIZE = 16;
const THUMB_RADIUS = THUMB_SIZE / 2;
const GLIDE_MS = 360;
const PREVIEW_THROTTLE_MS = 90;

type StageScrubberProps = {
  /** Current playback position in seconds. */
  seconds: number;
  /** Preview position in seconds while dragging (null when not dragging). */
  previewSeconds?: number | null;
  /** Known duration in seconds (0 before the player reports it). */
  duration: number;
  /** Key moments and estimated duration before the real length is known. */
  marks: BandMarks;
  /** Bumped when jumping to a moment so the thumb glides smoothly. */
  glideKey?: number;
  /**
   * The rail is turned 90° (full screen on a portrait phone), so a drag
   * along it runs down the window, where the gesture's limits are read.
   */
  rotated?: boolean;
  /** Called when the viewer finishes dragging or taps along the rail. */
  onSeek: (seconds: number) => void;
  /** Called on keyboard / screen-reader step adjustments (±15s). */
  onSkip: (deltaSeconds: number) => void;
  /** Reports the dragged preview time (or null when not dragging) for the elapsed clock. */
  onPreviewChange?: (previewSeconds: number | null) => void;
  /** Notifies the overlay when interaction starts/continues so the 3s auto-hide timer resets. */
  onInteract?: () => void;
};

const clamp01 = (f: number) => Math.min(1, Math.max(0, Number.isFinite(f) ? f : 0));

/**
 * Inline video scrubber with a bright navy played track, small gold dots for
 * key moments, and a gold thumb. While playing, the fill and thumb follow
 * `seconds` with plain styles (no animated style, so Reanimated schedules no
 * React commits as playback ticks). While dragging, a second fill and thumb
 * follow the finger every frame from a shared value the gesture writes on
 * the UI thread; only the elapsed time goes through React, throttled.
 */
export const StageScrubber = memo(function StageScrubber({
  seconds,
  previewSeconds = null,
  duration,
  marks,
  glideKey = 0,
  rotated = false,
  onSeek,
  onSkip,
  onPreviewChange,
  onInteract,
}: StageScrubberProps) {
  const reduced = useReducedMotion();
  const ready = duration > 0;
  const total = ready ? duration : marks.estimate;

  const [stripWidth, setStripWidth] = useState(1);
  // The strip's width and the dragged fraction, for the UI thread.
  const stripWidthSV = useSharedValue(1);
  const dragFraction = useSharedValue(0);
  const lastPreviewSec = useRef<number | null>(null);
  const lastFlushAt = useRef(0);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSec = useRef<number | null>(null);

  const [gliding, setGliding] = useState(false);
  const [seenGlide, setSeenGlide] = useState(glideKey);
  if (glideKey !== seenGlide) {
    setSeenGlide(glideKey);
    setGliding(true);
  }
  useEffect(() => {
    if (!gliding) return;
    const timer = setTimeout(() => setGliding(false), GLIDE_MS + 120);
    return () => clearTimeout(timer);
  }, [gliding, glideKey]);

  const callbacksRef = useRef({ onSeek, onPreviewChange, onInteract });
  callbacksRef.current = { onSeek, onPreviewChange, onInteract };

  const clearThrottle = useCallback(() => {
    if (throttleTimer.current) {
      clearTimeout(throttleTimer.current);
      throttleTimer.current = null;
    }
    pendingSec.current = null;
  }, []);

  useEffect(() => clearThrottle, [clearThrottle]);

  const flushPreview = useCallback((rounded: number | null) => {
    if (lastPreviewSec.current === rounded) return;
    lastPreviewSec.current = rounded;
    lastFlushAt.current = Date.now();
    callbacksRef.current.onPreviewChange?.(rounded);
  }, []);

  // The elapsed time while dragging: at most one React update per 90 ms.
  const schedulePreview = useCallback(
    (sec: number | null, immediate = false) => {
      if (sec == null) {
        clearThrottle();
        flushPreview(null);
        return;
      }
      const rounded = Math.round(sec);
      if (lastPreviewSec.current === rounded) return;
      const now = Date.now();
      const elapsed = now - lastFlushAt.current;
      if (immediate || elapsed >= PREVIEW_THROTTLE_MS) {
        clearThrottle();
        flushPreview(rounded);
        return;
      }
      pendingSec.current = rounded;
      if (!throttleTimer.current) {
        throttleTimer.current = setTimeout(() => {
          throttleTimer.current = null;
          if (pendingSec.current != null) {
            const next = pendingSec.current;
            pendingSec.current = null;
            flushPreview(next);
          }
        }, PREVIEW_THROTTLE_MS - elapsed);
      }
    },
    [clearThrottle, flushPreview],
  );

  // The gesture's side on the JS thread (it runs on the UI thread on a phone).
  const startDrag = useCallback(
    (sec: number) => {
      callbacksRef.current.onInteract?.();
      schedulePreview(sec, true);
    },
    [schedulePreview],
  );
  const moveDrag = useCallback((sec: number | null) => schedulePreview(sec), [schedulePreview]);
  const seekTo = useCallback(
    (sec: number | null) => {
      schedulePreview(null, true);
      if (sec == null) return;
      callbacksRef.current.onInteract?.();
      callbacksRef.current.onSeek(sec);
    },
    [schedulePreview],
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width || 1;
      stripWidthSV.set(w);
      setStripWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    },
    [stripWidthSV],
  );

  const gesture = useMemo(() => {
    const length = duration;
    // Where along the rail, 0 to 1. e.x is in the strip's own (turned) space.
    const fractionAt = (x: number) => {
      "worklet";
      const rail = Math.max(1, stripWidthSV.get() - RAIL_PAD * 2);
      return Math.min(1, Math.max(0, (x - RAIL_PAD) / rail));
    };
    const at = (x: number) => {
      "worklet";
      return Math.max(0, Math.min(length, fractionAt(x) * length));
    };

    // Turned 90°, a drag along the rail runs down the window, where these
    // limits are read; nothing scrolls under full screen.
    const base = Gesture.Pan().enabled(ready);
    const pan = (
      rotated
        ? base.activeOffsetY([-6, 6]).failOffsetX([-10, 10])
        : base.activeOffsetX([-6, 6]).failOffsetY([-10, 10])
    )
      .onStart((e) => {
        "worklet";
        dragFraction.set(fractionAt(e.x));
        scheduleOnRN(startDrag, at(e.x));
      })
      .onUpdate((e) => {
        "worklet";
        dragFraction.set(fractionAt(e.x));
        scheduleOnRN(moveDrag, at(e.x));
      })
      .onEnd((e, success) => {
        "worklet";
        scheduleOnRN(seekTo, success ? at(e.x) : null);
      })
      .onFinalize(() => {
        "worklet";
        scheduleOnRN(moveDrag, null);
      });

    const tap = Gesture.Tap()
      .enabled(ready)
      .maxDistance(10)
      .onEnd((e, success) => {
        "worklet";
        if (success) scheduleOnRN(seekTo, at(e.x));
      });

    return Gesture.Race(pan, tap);
  }, [ready, duration, rotated, stripWidthSV, dragFraction, startDrag, moveDrag, seekTo]);

  // The fill and thumb under the finger, every frame, without React.
  const dragFill = useAnimatedStyle(() => ({
    width: dragFraction.get() * Math.max(1, stripWidthSV.get() - RAIL_PAD * 2),
  }));
  const dragThumb = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          RAIL_PAD + dragFraction.get() * Math.max(1, stripWidthSV.get() - RAIL_PAD * 2) - THUMB_RADIUS,
      },
      { scale: reduced ? 1 : 1.25 },
    ],
  }));

  const railWidth = Math.max(1, stripWidth - RAIL_PAD * 2);
  const dragging = previewSeconds != null;
  const fraction = total > 0 ? clamp01(seconds / total) : 0;
  const fillWidth = fraction * railWidth;
  const thumbX = RAIL_PAD + fillWidth - THUMB_RADIUS;
  const travel = gliding && !reduced ? GLIDE_MS : 0;
  const motion = {
    transitionDuration: travel,
    transitionTimingFunction: easeOut,
  } as const;

  const ticks = useMemo(() => {
    if (!total) return [];
    return marks.moments.map((m) => ({
      key: m.key,
      fraction: clamp01(m.at / total),
      active: m.key === marks.activeKey,
    }));
  }, [marks.moments, marks.activeKey, total]);

  const starts = marks.moments.map((m) => m.at);
  const nextMoment = starts.find((s) => s > seconds + 1);
  const previousMoment = [...starts].reverse().find((s) => s < seconds - 3);
  const actions = [
    { name: "increment" },
    { name: "decrement" },
    ...(nextMoment != null ? [{ name: "nextMoment", label: "Next moment" }] : []),
    ...(previousMoment != null ? [{ name: "previousMoment", label: "Previous moment" }] : []),
  ];

  const keys: Record<string, () => void> = {
    ArrowRight: () => onSkip(15),
    ArrowUp: () => onSkip(15),
    ArrowLeft: () => onSkip(-15),
    ArrowDown: () => onSkip(-15),
    Home: () => onSeek(0),
    End: () => onSeek(duration),
  };

  return (
    <GestureDetector gesture={gesture} touchAction={rotated ? "none" : "pan-y"}>
      <View
        onLayout={onLayout}
        style={styles.strip}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration || total)}
        aria-valuenow={Math.round(seconds)}
        aria-valuetext={`${spokenClock(seconds)} of ${spokenClock(duration || total)}`}
        accessibilityActions={actions}
        onAccessibilityAction={(e) => {
          onInteract?.();
          switch (e.nativeEvent.actionName) {
            case "increment":
              return onSkip(15);
            case "decrement":
              return onSkip(-15);
            case "nextMoment":
              return nextMoment != null && onSeek(nextMoment);
            case "previousMoment":
              return previousMoment != null && onSeek(previousMoment);
          }
        }}
        {...web({
          tabIndex: ready ? 0 : -1,
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            const action = ready ? keys[e.key] : undefined;
            if (!action) return;
            e.preventDefault();
            onInteract?.();
            action();
          },
        })}
        testID="scrubber"
      >
        <View
          style={[styles.trackBox, { pointerEvents: "none" }]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          {...web({ "aria-hidden": true })}
        >
          {/* Unplayed rail */}
          <View style={styles.rail} />
          {/* Bright navy played fill: under the finger while dragging */}
          {dragging ? (
            <Animated.View style={[styles.fill, dragFill]} />
          ) : (
            <Animated.View
              style={[
                styles.fill,
                { width: fillWidth, transitionProperty: "width", ...motion },
              ]}
            />
          )}
          {/* Small gold dots for key moments */}
          {ticks.map((t) => {
            const size = t.active ? 8 : 6;
            const left = RAIL_PAD + t.fraction * railWidth - size / 2;
            return (
              <View
                key={t.key}
                style={[
                  styles.tick,
                  t.active && styles.tickActive,
                  { left },
                ]}
              />
            );
          })}
          {/* Gold thumb: under the finger while dragging */}
          {dragging ? (
            <Animated.View style={[styles.thumb, dragThumb]} testID="scrubber-drag-thumb" />
          ) : (
            <Animated.View
              style={[
                styles.thumb,
                {
                  transform: [{ translateX: thumbX }, { scale: 1 }],
                  transitionProperty: "transform",
                  ...motion,
                },
              ]}
            />
          )}
        </View>
      </View>
    </GestureDetector>
  );
});

const CENTRE_Y = SCRUBBER_TOUCH_HEIGHT / 2;

const styles = StyleSheet.create({
  strip: {
    flex: 1,
    // Shrinks rather than pushing the row into YouTube's logo corner.
    minWidth: 0,
    height: SCRUBBER_TOUCH_HEIGHT,
    justifyContent: "center",
  },
  trackBox: {
    ...StyleSheet.absoluteFill,
  },
  rail: {
    position: "absolute",
    left: RAIL_PAD,
    right: RAIL_PAD,
    top: CENTRE_Y - RAIL_HEIGHT / 2,
    height: RAIL_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
  },
  fill: {
    position: "absolute",
    left: RAIL_PAD,
    top: CENTRE_Y - RAIL_HEIGHT / 2,
    height: RAIL_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: "#4d84d6",
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.55)",
  },
  tick: {
    position: "absolute",
    top: CENTRE_Y - 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.goldOnMedia,
  },
  tickActive: {
    top: CENTRE_Y - 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: c.white,
  },
  thumb: {
    position: "absolute",
    left: 0,
    top: CENTRE_Y - THUMB_RADIUS,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_RADIUS,
    backgroundColor: c.goldOnMedia,
    borderWidth: 2,
    borderColor: c.white,
    boxShadow: shadows.knob,
  },
});
