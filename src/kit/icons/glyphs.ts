/**
 * The approved concept's tab glyphs, on its 24-unit grid with round caps
 * and joins (reference/ui/concept). Outline at rest, 2 units wide. Selected:
 * Home and Account fill in, Paths fills its two stops, and Search (which
 * has nothing to fill) draws its ring heavier, as the concept does.
 */
export type GlyphName = "home" | "paths" | "search" | "account";

export type Shape =
  | { kind: "path"; d: string; fillOn?: boolean }
  | { kind: "circle"; cx: number; cy: number; r: number; fillOn?: boolean };

export type Glyph = { shapes: Shape[]; strokeOn: number };

export const STROKE = 2;

export const GLYPHS: Record<GlyphName, Glyph> = {
  home: {
    shapes: [
      { kind: "path", d: "M3.5 10.5L12 3.5l8.5 7V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z", fillOn: true },
    ],
    strokeOn: STROKE,
  },
  paths: {
    shapes: [
      { kind: "circle", cx: 6, cy: 19, r: 2.5, fillOn: true },
      { kind: "circle", cx: 18, cy: 5, r: 2.5, fillOn: true },
      { kind: "path", d: "M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5" },
    ],
    strokeOn: 2.6,
  },
  search: {
    shapes: [
      { kind: "circle", cx: 11, cy: 11, r: 7 },
      { kind: "path", d: "M20.5 20.5L16 16" },
    ],
    strokeOn: 2.6,
  },
  account: {
    shapes: [
      { kind: "circle", cx: 12, cy: 8, r: 4, fillOn: true },
      { kind: "path", d: "M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6", fillOn: true },
    ],
    strokeOn: STROKE,
  },
};

/** The tab route each glyph stands for. */
export const TAB_GLYPHS: Record<string, GlyphName> = {
  index: "home",
  paths: "paths",
  search: "search",
  account: "account",
};

export type GlyphProps = {
  name: GlyphName;
  /** Selected: filled (or heavier, for Search). */
  active?: boolean;
  color: string;
  size?: number;
};
