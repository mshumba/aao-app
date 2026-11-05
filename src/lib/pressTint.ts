/**
 * How a "highlight" press (Tap in src/ui.tsx) turns a control's own ground
 * into its pressed tint, as an Animated interpolation of the press, which
 * runs from 0 (at rest) to 1 (pressed). Plain data with no imports, so the
 * Node tests can check it (tests/press-tint.spec.ts).
 *
 * The tint switches halfway rather than fading through a darker mix. The
 * range names both ends of the press: on a phone the look runs on the
 * native driver, whose colour interpolation ignores `extrapolate` and wraps
 * each channel past 255 (React Native's RCTInterpolateColorInRange and
 * InterpolationAnimatedNode::interpolateColor). With only the switch in the
 * range, a press drew cyan, then neon green, until it settled.
 */
export function pressTint(ground: string, tint: string) {
  return {
    inputRange: [0, 0.5, 0.51, 1],
    outputRange: [ground, ground, tint, tint],
    extrapolate: "clamp" as const,
  };
}
