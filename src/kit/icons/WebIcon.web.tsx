import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useSyncExternalStore, type ComponentProps } from "react";
import { IONICON_BOX, IONICON_PATHS } from "./ionicons";

type IconName = ComponentProps<typeof Ionicons>["name"];
type Props = { name: IconName; size: number; color: string };

/**
 * The web's icons. The Ionicons font is 210 KB, and on a slow connection
 * every icon used to show as an empty box (□) until it arrived, seconds
 * after the first screen. The icons the app uses are drawn instead as SVG
 * from the font's own outlines (src/kit/icons/ionicons.ts), so they look as
 * before, take the same room, and need nothing from the network.
 *
 * An icon missing from that set still comes from the font, which then loads,
 * and shows nothing (never a box) until the font is in.
 */
export const WebIcon = memo(function WebIcon({ name, size, color }: Props) {
  const d = IONICON_PATHS[name];
  if (d) return <Outline d={d} size={size} color={color} />;
  return <FontIcon name={name} size={size} color={color} />;
});

/**
 * The box the font's glyph took at `size`, and where in it the glyph sat:
 * the line box is ascent, descent and line gap, each rounded to a whole
 * pixel, with the gap's top half (rounded down) above the ascent, as Chrome
 * lays it out. Same size, same place, so nothing around an icon moves.
 */
function fontBox(size: number) {
  const k = size / IONICON_BOX.unitsPerEm;
  const ascent = Math.round(IONICON_BOX.ascent * k);
  const descent = Math.round(IONICON_BOX.descent * k);
  const gap = Math.round(IONICON_BOX.lineGap * k);
  const height = ascent + descent + gap;
  const baseline = Math.floor(gap / 2) + ascent;
  return {
    height,
    // In font units: the outlines' baseline is IONICON_BOX.baseline down.
    viewBox: `0 ${IONICON_BOX.baseline - baseline / k} ${IONICON_BOX.unitsPerEm} ${height / k}`,
    // Inside a line of text, the glyph sits on the text's baseline.
    verticalAlign: baseline - height,
  };
}

function Outline({ d, size, color }: { d?: string; size: number; color: string }) {
  const box = fontBox(size);
  return (
    <svg
      width={size}
      height={box.height}
      viewBox={box.viewBox}
      aria-hidden="true"
      focusable="false"
      data-icon=""
      fill={color}
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: box.verticalAlign }}
    >
      {d ? <path d={d} /> : null}
    </svg>
  );
}

// ---- The font, for an icon without an outline ---------------------------------------

let fontReady = false;
let fontRequested = false;
const listeners = new Set<() => void>();

function requestFont() {
  if (fontRequested) return;
  fontRequested = true;
  // Adds the font's @font-face rule at once and starts the download.
  const injected = Ionicons.loadFont();
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  // Settles when the file is in (the loader's own check gives up after 12 s).
  const loaded = fonts
    ? fonts.load(`16px ${Ionicons.getFontFamily()}`).then((faces) => (faces.length ? undefined : injected))
    : injected;
  loaded.then(
    () => {
      fontReady = true;
      listeners.forEach((listener) => listener());
    },
    // A font that can't load leaves the icon blank, rather than a box.
    () => {},
  );
  injected.catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function FontIcon({ name, size, color }: Props) {
  const ready = useSyncExternalStore(subscribe, () => fontReady, () => fontReady);
  useEffect(() => {
    if (!ready) requestFont();
  }, [ready]);
  if (!ready) return <Outline size={size} color={color} />;
  return <Ionicons accessible={false} aria-hidden name={name} size={size} color={color} />;
}
