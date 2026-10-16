import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "../../motion";
import type { BandMarks } from "../NowPlaying";
import { spokenClock } from "../PlayerProvider";
import { c, radius, shadows } from "../../theme";
import { web } from "../../ui";

/** 44pt touch target height so the scrubber is always easy to grab. */
export const SCRUBBER_TOUCH_HEIGHT = 44;
const RAIL_PAD = 8;
const RAIL_HEIGHT = 5;
const THUMB_SIZE = 16;
const THUMB_RADIUS = THUMB_SIZE / 2;

export type StageScrubberProps = {
  /** Current playback position in seconds. */
  seconds: number;
  /** Known duration in seconds (0 before the player reports it). */
  duration: number;
  /** Key moments and estimated duration before the real length is known. */
  marks: BandMarks;
  /** Bumped when jumping to a moment so the thumb glides smoothly. */
  glideKey?: number;
  /** Called when the viewer finishes dragging or taps along the rail. */
  onSeek: (seconds: number) => void;
  /** Called on keyboard / screen-reader step adjustments (±15s). */
  onSkip: (deltaSeconds: number) => void;
  /** Reports the dragged preview time (or null when not dragging) for the elapsed clock. */
  onPreviewChange?: (previewSeconds: number | null) => void;
  /** Notifies the overlay when interaction starts/continues so the 3s auto-hide timer resets. */
  onInteract?: () => void;
};

/**
 * Inline video scrubber with a navy played track, small gold dots for key
 * moments, and a gold thumb dragged on the UI thread with Reanimated and
 * Gesture Handler.
 */
export const StageScrubber = memo(function StageScrubber({
  seconds,
  duration,
  marks,
  glideKey = 0,
  onSeek,
  onSkip,
  onPreviewChange,
  onInteract,
}: StageScrubberProps) {
  const reduced = useReducedMotion();
  const ready = duration > 0;
  const total = ready ? duration : marks.estimate;

  const [stripWidth, setStripWidth] = useState(1);
  const [previewSec, setPreviewSec] = useState<number | null>(null);
  const lastPreviewSec = useRef<number | null>(null);
  const seenGlide = useRef(glideKey);

  const railWidthSV = useSharedValue(1);
  const progressSV = useSharedValue(total > 0 ? Math.min(1, Math.max(0, seconds / total)) : 0);
  const draggingSV = useSharedValue(false);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width || 1;
      const rail = Math.max(1, w - RAIL_PAD * 2);
      railWidthSV.value = rail;
      setStripWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    },
    [railWidthSV],
  );

  // Sync shared value with playback position when not actively dragging.
  useEffect(() => {
    if (draggingSV.value) return;
    const next = total > 0 ? Math.min(1, Math.max(0, seconds / total)) : 0;
    const shouldGlide = glideKey !== seenGlide.current && !reduced;
    seenGlide.current = glideKey;
    if (shouldGlide) {
      progressSV.value = withTiming(next, { duration: 360 });
    } else {
      progressSV.value = next;
    }
  }, [seconds, total, glideKey, reduced, draggingSV, progressSV]);

  const updatePreviewJS = useCallback(
    (sec: number | null) => {
      const rounded = sec == null ? null : Math.round(sec);
      if (lastPreviewSec.current === rounded) return;
      lastPreviewSec.current = rounded;
      setPreviewSec(rounded);
      onPreviewChange?.(rounded);
    },
    [onPreviewChange],
  );

  const commitSeekJS = useCallback(
    (sec: number) => {
      onInteract?.();
      updatePreviewJS(null);
      onSeek(Math.max(0, Math.min(duration, sec)));
    },
    [duration, onInteract, onSeek, updatePreviewJS],
  );

  const startDragJS = useCallback(
    (sec: number) => {
      onInteract?.();
      updatePreviewJS(sec);
    },
    [onInteract, updatePreviewJS],
  );

  const endDragJS = useCallback(() => {
    updatePreviewJS(null);
  }, [updatePreviewJS]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(ready)
      .activeOffsetX([-6, 6])
      .failOffsetY([-10, 10])
      .onStart((e) => {
        "worklet";
        const rail = Math.max(1, railWidthSV.value);
        const f = Math.min(1, Math.max(0, (e.x - RAIL_PAD) / rail));
        draggingSV.value = true;
        progressSV.value = f;
        runOnJS(startDragJS)(f * duration);
      })
      .onUpdate((e) => {
        "worklet";
        const rail = Math.max(1, railWidthSV.value);
        const f = Math.min(1, Math.max(0, (e.x - RAIL_PAD) / rail));
        progressSV.value = f;
        runOnJS(updatePreviewJS)(f * duration);
      })
      .onEnd((e, success) => {
        "worklet";
        const rail = Math.max(1, railWidthSV.value);
        const f = Math.min(1, Math.max(0, (e.x - RAIL_PAD) / rail));
        draggingSV.value = false;
        if (success) {
          progressSV.value = f;
          runOnJS(commitSeekJS)(f * duration);
        } else {
          runOnJS(endDragJS)();
        }
      })
      .onFinalize(() => {
        "worklet";
        draggingSV.value = false;
        runOnJS(endDragJS)();
      });

    const tap = Gesture.Tap()
      .enabled(ready)
      .maxDistance(10)
      .onEnd((e, success) => {
        "worklet";
        if (!success) return;
        const rail = Math.max(1, railWidthSV.value);
        const f = Math.min(1, Math.max(0, (e.x - RAIL_PAD) / rail));
        progressSV.value = f;
        runOnJS(commitSeekJS)(f * duration);
      });

    return Gesture.Race(pan, tap);
  }, [
    ready,
    duration,
    railWidthSV,
    draggingSV,
    progressSV,
    startDragJS,
    updatePreviewJS,
    commitSeekJS,
    endDragJS,
  ]);

  const fillStyle = useAnimatedStyle(() => ({
    width: Math.max(0, progressSV.value * railWidthSV.value),
  }));

  const thumbSlotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: RAIL_PAD + progressSV.value * railWidthSV.value - THUMB_RADIUS },
      { scale: draggingSV.value && !reduced ? 1.25 : 1 },
    ],
  }));

  const railWidth = Math.max(1, stripWidth - RAIL_PAD * 2);
  const ticks = useMemo(() => {
    if (!total) return [];
    return marks.moments.map((m) => ({
      key: m.key,
      fraction: Math.min(1, Math.max(0, m.at / total)),
      active: m.key === marks.activeKey,
    }));
  }, [marks.moments, marks.activeKey, total]);

  const shown = previewSec ?? seconds;
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
    <GestureDetector gesture={gesture} touchAction="pan-y">
      <View
        onLayout={onLayout}
        style={styles.strip}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration || total)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${spokenClock(shown)} of ${spokenClock(duration || total)}`}
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
          {/* Navy played fill */}
          <Animated.View style={[styles.fill, fillStyle]} />
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
          {/* Gold thumb */}
          <Animated.View style={[styles.thumb, thumbSlotStyle]} />
        </View>
      </View>
    </GestureDetector>
  );
});

const CENTRE_Y = SCRUBBER_TOUCH_HEIGHT / 2;

const styles = StyleSheet.create({
  strip: {
    flex: 1,
    minWidth: 64,
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
    backgroundColor: "#254b7c",
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.45)",
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
