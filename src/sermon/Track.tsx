import { memo, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Animated from "react-native-reanimated";
import { useReducedMotion } from "../motion";
import { c, easeOut, shadows, tabular, textCap, type } from "../theme";
import { T, web } from "../ui";

/** The strip you can grab: the track's centre line sits this far down it. */
export const STRIP_HEIGHT = 34;
const CENTRE = 9;
/**
 * The rail stops this far in from each side of the strip, level with the
 * times under it, so the thumb is whole at 0:00 and at the end. The strip
 * itself still runs edge to edge, to be easy to grab.
 */
export const RAIL_INSET = 20;
/** "Find the minute": the thumb travels to a moment over this long. */
export const GLIDE_MS = 600;

/** A moment's mark on the track, as a fraction of the sermon. */
export type Tick = { key: string; at: number; active?: boolean };

const clamp = (f: number) => Math.min(1, Math.max(0, Number.isFinite(f) ? f : 0));

/**
 * The stage's progress line: a 4pt white-22% rail under the video, inset to
 * line up with the times, the played part in white, each moment a 6pt gold
 * dot on the rail (8pt for the one playing or searched for: marks, not
 * handles) and a 16pt white thumb. A path day plays its whole sermon, so
 * nothing marks a part of it.
 * Decorative: the strip around it carries the slider semantics.
 *
 * `glide` moves the thumb to a new place over 600ms (a jump to a moment);
 * otherwise it follows playback directly. Reduce Motion never glides.
 */
export const Track = memo(function Track({
  width,
  position,
  ticks,
  dragging = false,
  glide = false,
  played = true,
}: {
  width: number;
  /** 0 to 1, or null for no thumb (nothing played yet). */
  position: number | null;
  ticks: readonly Tick[];
  dragging?: boolean;
  glide?: boolean;
  /**
   * The white fill means "watched": false before play when the thumb only
   * marks where Play will start (a moment, a shared time).
   */
  played?: boolean;
}) {
  const reduced = useReducedMotion();
  const rail = Math.max(1, width - RAIL_INSET * 2);
  const at = (f: number) => RAIL_INSET + clamp(f) * rail;
  const x = position == null ? RAIL_INSET : at(position);
  const travel = glide && !reduced && !dragging ? GLIDE_MS : 0;
  const motion = {
    transitionDuration: travel,
    transitionTimingFunction: easeOut,
  } as const;
  return (
    <View
      style={[styles.box, { pointerEvents: "none" }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
    >
      <View style={styles.rail} />
      {played ? (
        <Animated.View
          style={[styles.fill, { width: x - RAIL_INSET, transitionProperty: "width", ...motion }]}
        />
      ) : null}
      {ticks.map((tick) => (
        <View
          key={tick.key}
          style={[
            styles.tick,
            tick.active && styles.tickActive,
            { left: at(tick.at) - (tick.active ? 4 : 3) },
          ]}
        />
      ))}
      {position != null ? (
        <Animated.View
          style={[
            styles.knobSlot,
            { transform: [{ translateX: x - 8 }], transitionProperty: "transform", ...motion },
          ]}
        >
          <Animated.View
            style={[
              styles.knob,
              {
                transform: [{ scale: dragging ? 1.25 : 1 }],
                transitionProperty: "transform",
                transitionDuration: reduced ? 0 : 120,
                transitionTimingFunction: easeOut,
              },
            ]}
          />
        </Animated.View>
      ) : null}
    </View>
  );
});

/** Where a touch `x` points along a strip `width` wide: 0 to 1 along the rail. */
export function railFraction(x: number, width: number) {
  return clamp((x - RAIL_INSET) / Math.max(1, width - RAIL_INSET * 2));
}

/** Measures the strip so the track can place things in points. */
export function useStripWidth(initial = 1) {
  const [width, setWidth] = useState(initial);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width || 1;
    setWidth((was) => (Math.abs(was - next) < 0.5 ? was : next));
  };
  return [width, onLayout] as const;
}

/**
 * True for a moment after `key` changes (a jump to a moment), so the thumb
 * glides there instead of snapping.
 */
export function useGlide(key: number) {
  const [gliding, setGliding] = useState(false);
  const [seen, setSeen] = useState(key);
  if (key !== seen) {
    setSeen(key);
    setGliding(true);
  }
  useEffect(() => {
    if (!gliding) return;
    const timer = setTimeout(() => setGliding(false), GLIDE_MS + 120);
    return () => clearTimeout(timer);
  }, [gliding, key]);
  return gliding;
}

/**
 * The line under the track: elapsed on the left, remaining on the right
 * (tabular, white 74%), and context in the centre (the status, "From your
 * search", how many moments are marked). Only the centre's own controls take
 * touches; elsewhere a tap falls through to the strip above it.
 */
export function TimesRow({
  left,
  right,
  center,
  leftTestID,
  leftLabel,
  rightLabel,
}: {
  left?: string | null;
  right?: string | null;
  center?: ReactNode;
  leftTestID?: string;
  /** The times as words, for screen readers ("53 minutes 44 seconds"). */
  leftLabel?: string;
  rightLabel?: string;
}) {
  const { width, fontScale } = useWindowDimensions();
  // A narrow phone or large text: the times share a row, the context sits
  // on its own line under them, so nothing is cut off. Without times the
  // context has the row to itself.
  const stacked = (width < 360 || fontScale >= 1.35) && !!center && (left != null || right != null);
  const leftText =
    left != null ? (
      <T
        style={[styles.time, styles.elapsed]}
        testID={leftTestID}
        accessibilityLabel={leftLabel}
        maxFontSizeMultiplier={textCap.chip}
        // The slider says the same in words.
        {...web({ "aria-hidden": true })}
      >
        {left}
      </T>
    ) : null;
  const rightText =
    right != null ? (
      <T
        style={[styles.time, styles.right]}
        accessibilityLabel={rightLabel}
        maxFontSizeMultiplier={textCap.chip}
        {...web({ "aria-hidden": true })}
      >
        {right}
      </T>
    ) : null;
  if (stacked)
    return (
      <View pointerEvents="box-none" style={styles.timesStacked}>
        <View pointerEvents="none" style={styles.timesPair}>
          <View>{leftText}</View>
          <View style={styles.timeEnd}>{rightText}</View>
        </View>
        <View pointerEvents="box-none" style={styles.centerBelow}>
          {center}
        </View>
      </View>
    );
  return (
    // box-none stays a prop: react-native-web only honours it there.
    <View pointerEvents="box-none" style={styles.times}>
      <View style={[left != null && styles.timeSlot, { pointerEvents: "none" }]}>{leftText}</View>
      <View pointerEvents="box-none" style={styles.center}>
        {center}
      </View>
      <View style={[right != null && styles.timeSlot, styles.timeEnd, { pointerEvents: "none" }]}>
        {rightText}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { ...StyleSheet.absoluteFill },
  rail: {
    position: "absolute",
    left: RAIL_INSET,
    right: RAIL_INSET,
    top: CENTRE - 2,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.onMediaRail,
  },
  fill: {
    position: "absolute",
    left: RAIL_INSET,
    top: CENTRE - 2,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.white,
  },
  tick: {
    position: "absolute",
    top: CENTRE - 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.goldOnDark,
  },
  tickActive: { top: CENTRE - 4, width: 8, height: 8, borderRadius: 4 },
  knobSlot: { position: "absolute", left: 0, top: CENTRE - 8, width: 16, height: 16 },
  knob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: c.white,
    boxShadow: shadows.knob,
  },
  // Starts under the strip's lower edge, so the strip stays easy to grab.
  times: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 26,
    marginTop: -(STRIP_HEIGHT - 14),
    paddingHorizontal: 20,
    gap: 8,
  },
  timesStacked: { marginTop: -(STRIP_HEIGHT - 14), paddingHorizontal: 20, gap: 4 },
  timesPair: { flexDirection: "row", justifyContent: "space-between", minHeight: 22, alignItems: "center" },
  centerBelow: { alignItems: "center", justifyContent: "center", minHeight: 22 },
  timeSlot: { minWidth: 58 },
  timeEnd: { alignItems: "flex-end" },
  center: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center" },
  time: { ...type.metaSmall, ...tabular },
  elapsed: { color: c.white },
  right: { color: c.onMediaMuted },
});
