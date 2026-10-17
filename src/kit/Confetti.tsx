import { memo, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { c } from "../theme";
import { web } from "../ui";

/** The whole burst, in ms: up, a tumble, and gone. */
const DURATION = 1200;
const PIECES = 52;
// Paper in air: a strong pull down, slowed by drag (sideways more than
// down), so pieces pop up, hang for a moment and drift, never fly off.
const GRAVITY = 1500;
const DRAG = 3;
const DRAG_X = 4;

// The brand's navy, gold and ivory (ivory shows over the navy card it falls
// back onto), with a soft rose and sky to lift it.
const COLORS = [
  { color: c.accent, weight: 3 },
  { color: c.goldOnDark, weight: 3 },
  { color: c.bg, weight: 2 },
  { color: "#e3b4a6", weight: 1 },
  { color: "#a8c3de", weight: 1 },
];

// Mostly slips of paper, with some squares, dots and thin streamers.
const SHAPES = [
  { w: 6, h: 11, round: false },
  { w: 6, h: 11, round: false },
  { w: 6, h: 11, round: false },
  { w: 7, h: 7, round: false },
  { w: 6, h: 6, round: true },
  { w: 3, h: 14, round: false },
];

type Piece = (typeof SHAPES)[number] & {
  color: string;
  vx: number;
  vy: number;
  spin: number;
  turn: number;
  phase: number;
  sway: number;
  rotate: number;
};

const between = (a: number, b: number) => a + Math.random() * (b - a);

function pickColor() {
  const total = COLORS.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of COLORS) {
    roll -= entry.weight;
    if (roll < 0) return entry.color;
  }
  return COLORS[0].color;
}

function makePieces(): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => {
    // Up and out in a cone, the fastest nearest straight up.
    const angle = -Math.PI / 2 + between(-1, 1) * 1.05;
    const speed = between(520, 1150) * (1 - Math.abs(angle + Math.PI / 2) * 0.25);
    return {
      ...SHAPES[i % SHAPES.length],
      color: pickColor(),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      spin: between(240, 720) * (Math.random() < 0.5 ? -1 : 1),
      turn: between(8, 16),
      phase: between(0, Math.PI * 2),
      sway: between(4, 12),
      rotate: between(0, 360),
    };
  });
}

/**
 * One short burst of confetti from a point, for a moment worth marking (a
 * new account's first visit to Home): slips of paper in navy, gold and ivory
 * pop up and out, tumble and fall away in 1.2 s, then `onDone`. One clock
 * drives every piece on the UI thread, so the JavaScript thread is free
 * throughout. Nothing in it can be touched or read out. Leave it out under
 * Reduce Motion.
 *
 * `origin` is in the coordinates of the screen it covers.
 */
export const Confetti = memo(function Confetti({
  origin,
  onDone,
  testID,
}: {
  origin: { x: number; y: number };
  onDone?: () => void;
  testID?: string;
}) {
  const [pieces] = useState(makePieces);
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.set(withTiming(DURATION / 1000, { duration: DURATION, easing: Easing.linear }));
    const timer = onDone ? setTimeout(onDone, DURATION + 50) : undefined;
    return () => clearTimeout(timer);
  }, [clock, onDone]);
  return (
    <View
      testID={testID}
      style={styles.layer}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
    >
      {pieces.map((piece, i) => (
        <Bit key={i} piece={piece} origin={origin} clock={clock} />
      ))}
    </View>
  );
});

function Bit({
  piece,
  origin,
  clock,
}: {
  piece: Piece;
  origin: { x: number; y: number };
  clock: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const t = clock.get();
    // Distance under drag: v(1 - e^(-kt)) / k, and the fall settles to g/k.
    const reach = (1 - Math.exp(-DRAG * t)) / DRAG;
    const reachX = (1 - Math.exp(-DRAG_X * t)) / DRAG_X;
    const fall = GRAVITY / DRAG;
    const x = piece.vx * reachX + Math.sin(piece.turn * 0.5 * t + piece.phase) * piece.sway * t;
    const y = (piece.vy - fall) * reach + fall * t;
    const end = DURATION / 1000;
    // A slip of paper turning over as it falls (never quite edge-on: a
    // zero scale can't be drawn).
    const turn = Math.cos(piece.turn * t + piece.phase);
    return {
      // Gone by the end: full until 60% of the way, then fading out.
      opacity: Math.min(1, Math.max(0, (end - t) / (end * 0.4))),
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${piece.rotate + piece.spin * t}deg` },
        { scaleY: turn < 0 ? Math.min(turn, -0.06) : Math.max(turn, 0.06) },
        { scale: Math.min(1, 0.4 + t * 8) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.bit,
        {
          left: origin.x - piece.w / 2,
          top: origin.y - piece.h / 2,
          width: piece.w,
          height: piece.h,
          borderRadius: piece.round ? piece.w / 2 : 1.5,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, overflow: "hidden", pointerEvents: "none" },
  bit: { position: "absolute" },
});
