import { expect, test } from "@playwright/test";
import { pressTint } from "../src/lib/pressTint";

type Rgba = [number, number, number, number];

/** The colour forms the app's grounds and tints use, as 0–255 channels. */
function rgba(color: string): Rgba {
  if (color === "transparent") return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16), 255];
  const fn = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3]), Math.round(Number(fn[4]) * 255)];
  throw new Error(`Unknown colour ${color}`);
}

/**
 * A phone's native driver, as React Native's RCTInterpolateColorInRange
 * (iOS) and InterpolationAnimatedNode::interpolateColor do it: the segment
 * holding the value, or the last one past it, extended linearly whatever
 * `extrapolate` says, then each channel wrapped to a byte.
 */
function nativeColor(value: number, inputRange: number[], outputRange: string[]): Rgba {
  let index = 1;
  for (; index < inputRange.length - 1; index++) if (inputRange[index] >= value) break;
  index--;
  const [inMin, inMax] = [inputRange[index], inputRange[index + 1]];
  const [from, to] = [rgba(outputRange[index]), rgba(outputRange[index + 1])];
  const ratio = (value - inMin) / (inMax - inMin);
  return from.map((start, i) => {
    const channel = Math.round(start + ratio * (to[i] - start));
    return ((channel % 256) + 256) % 256;
  }) as Rgba;
}

// Grounds and tints the app presses: a tab or icon button (no ground, the
// pressed tint), a row on a white surface (sand on surface), a chip on white
// (sand) and the selected tab (sand on sand).
const presses: [string, string][] = [
  ["transparent", "rgba(27, 30, 36, 0.06)"],
  ["#ffffff", "#f3eee5"],
  ["#ffffff", "#efe9de"],
  ["#efe9de", "#efe9de"],
];

test("a highlight press never leaves its two colours on a phone's native driver", () => {
  for (const [ground, tint] of presses) {
    const { inputRange, outputRange } = pressTint(ground, tint);
    const [rest, on] = [rgba(ground), rgba(tint)];
    expect(nativeColor(0, inputRange, outputRange)).toEqual(rest);
    expect(nativeColor(1, inputRange, outputRange)).toEqual(on);
    // The press eases between 0 and 1 and never past them.
    const strays: string[] = [];
    for (let step = 0; step <= 1000; step++) {
      const drawn = nativeColor(step / 1000, inputRange, outputRange);
      const between = drawn.every(
        (channel, i) => channel >= Math.min(rest[i], on[i]) && channel <= Math.max(rest[i], on[i]),
      );
      if (!between) strays.push(`${ground} → ${tint} at ${step / 1000}: rgba(${drawn})`);
    }
    expect(strays).toEqual([]);
  }
});
