// Writes src/kit/icons/ionicons.ts: the outlines of the Ionicons the app
// uses, read from the Ionicons font that @expo/vector-icons ships, so the web
// can draw them as SVG instead of waiting for the 210 KB font (see
// src/kit/icons/WebIcon.web.tsx). The shapes are the font's own, so they look
// exactly as before.
//
// Usage: node scripts/ionicon-paths.mjs
// Add a name to NAMES when the app starts using a new icon; until then the
// web draws it from the font, which loads only when such an icon shows.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const vendor = dirname(require.resolve("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json"));
const glyphMap = JSON.parse(readFileSync(join(vendor, "Ionicons.json"), "utf8"));
const font = readFileSync(join(vendor, "..", "Fonts", "Ionicons.ttf"));

/** Every icon name the app passes to Icon (and the kit's icon props). */
const NAMES = [
  "albums-outline",
  "alert-circle",
  "alert-circle-outline",
  "arrow-forward",
  "bookmark",
  "bookmark-outline",
  "chatbubble-ellipses-outline",
  "checkmark",
  "checkmark-circle",
  "checkmark-circle-outline",
  "chevron-back",
  "chevron-down",
  "chevron-forward",
  "chevron-up",
  "close",
  "cloud-offline-outline",
  "compass-outline",
  "document-text-outline",
  "ear-outline",
  "ellipsis-horizontal",
  "eye-off-outline",
  "eye-outline",
  "flame-outline",
  "flask-outline",
  "footsteps-outline",
  "heart-outline",
  "hourglass-outline",
  "information-circle-outline",
  "leaf-outline",
  "lock-closed-outline",
  "lock-open-outline",
  "log-out-outline",
  "logo-apple",
  "logo-google",
  "logo-youtube",
  "mail-outline",
  "notifications-outline",
  "open-outline",
  "pause",
  "person",
  "person-circle-outline",
  "person-outline",
  "play",
  "play-circle-outline",
  "pricetags-outline",
  "refresh",
  "search",
  "search-outline",
  "share-outline",
  "shield-checkmark-outline",
  "sparkles",
  "sparkles-outline",
  "sunny-outline",
  "sync-outline",
  "time-outline",
  "trail-sign-outline",
  "trash-outline",
  "videocam-off-outline",
];

// ---- A small TrueType reader: metrics, cmap and glyf outlines --------------------

const tables = {};
for (let i = 0; i < font.readUInt16BE(4); i++) {
  const o = 12 + i * 16;
  tables[font.toString("ascii", o, o + 4)] = font.readUInt32BE(o + 8);
}
const unitsPerEm = font.readUInt16BE(tables.head + 18);
const longLoca = font.readInt16BE(tables.head + 50) === 1;
const ascent = font.readInt16BE(tables.hhea + 4);
const descent = -font.readInt16BE(tables.hhea + 6);
const lineGap = font.readInt16BE(tables.hhea + 8);
const numHMetrics = font.readUInt16BE(tables.hhea + 34);
const numGlyphs = font.readUInt16BE(tables.maxp + 4);
const loca = (g) =>
  longLoca ? font.readUInt32BE(tables.loca + g * 4) : font.readUInt16BE(tables.loca + g * 2) * 2;
const advance = (g) => font.readUInt16BE(tables.hmtx + Math.min(g, numHMetrics - 1) * 4);

function glyphFor(codepoint) {
  const count = font.readUInt16BE(tables.cmap + 2);
  for (let i = 0; i < count; i++) {
    const sub = tables.cmap + font.readUInt32BE(tables.cmap + 4 + i * 8 + 4);
    const format = font.readUInt16BE(sub);
    if (format === 4 && codepoint <= 0xffff) {
      const segX2 = font.readUInt16BE(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = font.readUInt16BE(ends + s * 2);
        const start = font.readUInt16BE(starts + s * 2);
        if (codepoint < start || codepoint > end) continue;
        const delta = font.readInt16BE(deltas + s * 2);
        const offset = font.readUInt16BE(ranges + s * 2);
        if (!offset) return (codepoint + delta) & 0xffff;
        const g = font.readUInt16BE(ranges + s * 2 + offset + (codepoint - start) * 2);
        return g ? (g + delta) & 0xffff : 0;
      }
    } else if (format === 12) {
      const groups = font.readUInt32BE(sub + 12);
      for (let k = 0; k < groups; k++) {
        const o = sub + 16 + k * 12;
        const first = font.readUInt32BE(o);
        if (codepoint >= first && codepoint <= font.readUInt32BE(o + 4))
          return font.readUInt32BE(o + 8) + codepoint - first;
      }
    }
  }
  return 0;
}

/** A glyph's contours: points in font units (y up), on or off the curve. */
function contours(g) {
  if (g >= numGlyphs) return [];
  const start = tables.glyf + loca(g);
  if (start === tables.glyf + loca(g + 1)) return [];
  const count = font.readInt16BE(start);
  let p = start + 10;
  if (count < 0) {
    // A composite: other glyphs, moved and scaled.
    const out = [];
    for (;;) {
      const flags = font.readUInt16BE(p);
      const part = font.readUInt16BE(p + 2);
      p += 4;
      let dx, dy;
      if (flags & 1) [dx, dy, p] = [font.readInt16BE(p), font.readInt16BE(p + 2), p + 4];
      else [dx, dy, p] = [font.readInt8(p), font.readInt8(p + 1), p + 2];
      let [a, b, c, d] = [1, 0, 0, 1];
      const f2 = (o) => font.readInt16BE(o) / 16384;
      if (flags & 8) [a, d, p] = [f2(p), f2(p), p + 2];
      else if (flags & 0x40) [a, d, p] = [f2(p), f2(p + 2), p + 4];
      else if (flags & 0x80) [a, b, c, d, p] = [f2(p), f2(p + 2), f2(p + 4), f2(p + 6), p + 8];
      for (const contour of contours(part))
        out.push(contour.map((pt) => ({ x: pt.x * a + pt.y * c + dx, y: pt.x * b + pt.y * d + dy, on: pt.on })));
      if (!(flags & 0x20)) break;
    }
    return out;
  }
  const ends = [];
  for (let i = 0; i < count; i++, p += 2) ends.push(font.readUInt16BE(p));
  const points = ends[count - 1] + 1;
  p += 2 + font.readUInt16BE(p);
  const flags = [];
  while (flags.length < points) {
    const flag = font[p++];
    flags.push(flag);
    if (flag & 8) for (let r = font[p++]; r > 0; r--) flags.push(flag);
  }
  const read = (short, same) => {
    const out = [];
    let v = 0;
    for (const flag of flags) {
      if (flag & short) v += flag & same ? font[p++] : -font[p++];
      else if (!(flag & same)) [v, p] = [v + font.readInt16BE(p), p + 2];
      out.push(v);
    }
    return out;
  };
  const xs = read(2, 16);
  const ys = read(4, 32);
  const out = [];
  let first = 0;
  for (const end of ends) {
    const contour = [];
    for (let i = first; i <= end; i++) contour.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) });
    out.push(contour);
    first = end + 1;
  }
  return out;
}

// ---- To a compact SVG path ---------------------------------------------------------

/** The line box's top, above the baseline: the ascent and half the line gap. */
const BASELINE = ascent + Math.round(lineGap / 2);
const HEIGHT = ascent + descent + lineGap;

function svgPath(g) {
  let d = "";
  let pen = { x: 0, y: 0 };
  const num = (v) => String(v);
  const pair = (x, y) => {
    const s = `${num(x)}${y < 0 ? "" : " "}${num(y)}`;
    return x < 0 || !d || /[a-zA-Z]$/.test(d) ? s : ` ${s}`;
  };
  // Absolute points rounded to whole font units (0.04pt at 20pt), so
  // relative steps never drift.
  const at = (pt) => ({ x: Math.round(pt.x), y: Math.round(BASELINE - pt.y) });
  const rel = (cmd, ...pts) => {
    d += cmd;
    for (const pt of pts) d += pair(pt.x - pen.x, pt.y - pen.y);
    pen = pts[pts.length - 1];
  };
  for (const contour of contours(g)) {
    if (!contour.length) continue;
    const n = contour.length;
    const firstOn = contour.findIndex((pt) => pt.on);
    const start =
      firstOn >= 0
        ? contour[firstOn]
        : { x: (contour[0].x + contour[n - 1].x) / 2, y: (contour[0].y + contour[n - 1].y) / 2, on: true };
    const from = firstOn >= 0 ? firstOn + 1 : 0;
    const begin = at(start);
    rel("m", begin);
    let control = null;
    // Both points relative to the pen.
    const quad = (c, end) => rel("q", c, end);
    for (let k = 0; k < n - (firstOn >= 0 ? 1 : 0); k++) {
      const pt = contour[(from + k) % n];
      if (pt.on) {
        if (control) quad(at(control), at(pt));
        else rel("l", at(pt));
        control = null;
      } else {
        if (control) quad(at(control), at({ x: (control.x + pt.x) / 2, y: (control.y + pt.y) / 2 }));
        control = pt;
      }
    }
    if (control) quad(at(control), begin);
    d += "z";
    pen = begin;
  }
  return d.replace(/^m/, "M");
}

const paths = {};
for (const name of NAMES) {
  const codepoint = glyphMap[name];
  if (codepoint == null) throw new Error(`No Ionicon is called "${name}"`);
  const g = glyphFor(codepoint);
  if (!g) throw new Error(`The font has no glyph for "${name}"`);
  // Drawn in an em-wide box (one glyph is a unit narrower: 0.04pt at 20pt).
  if (Math.abs(advance(g) - unitsPerEm) > 2) throw new Error(`"${name}" isn't ${unitsPerEm} units wide`);
  paths[name] = svgPath(g);
}

const out = `// Generated by scripts/ionicon-paths.mjs from the Ionicons font in
// @expo/vector-icons. Don't edit by hand: add a name there and run it again.

/**
 * The font's line box, in its units: as wide as the em (${unitsPerEm}), as tall as
 * ascent, descent and line gap together (${ascent} + ${descent} + ${lineGap}), with the
 * baseline ${BASELINE} down. An icon drawn in it sits where the font's glyph did.
 */
export const IONICON_BOX = {
  unitsPerEm: ${unitsPerEm},
  ascent: ${ascent},
  descent: ${descent},
  lineGap: ${lineGap},
  baseline: ${BASELINE},
  height: ${HEIGHT},
} as const;

/** Each icon's outline in IONICON_BOX (y down), filled with the nonzero rule. */
export const IONICON_PATHS: Readonly<Record<string, string>> = {
${NAMES.map((name) => `  ${JSON.stringify(name)}: ${JSON.stringify(paths[name])},`).join("\n")}
};
`;
writeFileSync(join(root, "src/kit/icons/ionicons.ts"), out);
console.log(`${NAMES.length} icons, ${Object.values(paths).reduce((n, d) => n + d.length, 0)} characters of path`);
