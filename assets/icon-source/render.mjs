import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

/**
 * Draws the app icon, the Android adaptive icon, the splash mark and the
 * favicon from one definition, so they stay in step. From the project root:
 *
 *   npm run icons
 *
 * The mark is "AO" in Newsreader SemiBold (the app's serif) with an italic O,
 * ivory on the app's navy accent (src/theme.ts). Chromium sets the type
 * exactly as the app's fonts do; this script then writes the PNGs itself, so
 * icon.png has no alpha channel (App Store Connect rejects an icon that has
 * one).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, "..");
const fonts = path.resolve(here, "../../node_modules/@expo-google-fonts/newsreader");

// Keep in step with c.accent and c.bg in src/theme.ts, and with the splash
// and adaptive icon background colours in app.json.
const navy = "#1f3a5f";
const ivory = "#f7f4ee";

const outputs = [
  // iOS masks the corners itself; the image must be square and opaque.
  { file: "icon.png", size: 1024, background: true, mark: 0.62, color: ivory, alpha: false },
  // Android shows the middle two thirds of 108dp, and only promises the
  // central 66dp circle, so the mark is smaller here. The navy behind it is
  // android.adaptiveIcon.backgroundColor.
  { file: "adaptive-icon.png", size: 1024, mark: 0.42, color: ivory, alpha: true },
  // Android 13+ themed icons recolour this one.
  { file: "adaptive-icon-monochrome.png", size: 1024, mark: 0.42, color: "#ffffff", alpha: true },
  // Shown at 200pt wide on the ivory splash colour (app.json), so it's navy.
  { file: "splash-icon.png", size: 1024, mark: 0.6, color: navy, alpha: true },
  { file: "favicon.png", size: 48, background: true, rounded: true, mark: 0.74, color: ivory, alpha: true },
];

// Runs in the page: returns the output's RGBA pixels as base64.
function draw({ size, background, rounded, mark, color, navy, fontsLoaded }) {
  const S = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (rounded) {
    ctx.beginPath();
    ctx.roundRect(0, 0, S, S, S * 0.2);
    ctx.clip();
  }
  if (background) {
    // The navy accent, lifted a little behind the mark so it isn't flat.
    const lift = ctx.createRadialGradient(S / 2, S * 0.42, 0, S / 2, S * 0.42, S * 0.78);
    lift.addColorStop(0, "#29486f");
    lift.addColorStop(1, navy);
    ctx.fillStyle = lift;
    ctx.fillRect(0, 0, S, S);
  }
  if (!fontsLoaded) throw new Error("Fonts not loaded");

  // Roman A, italic O, set tight enough that the A's serif meets the O.
  const glyphs = [
    ["A", "Newsreader"],
    ["O", "Newsreader Italic"],
  ];
  const kern = -0.09;
  const base = 1000;
  let x = 0;
  const parts = glyphs.map(([ch, family]) => {
    ctx.font = `${base}px "${family}"`;
    const m = ctx.measureText(ch);
    const part = { ch, family, x, m };
    x += m.width + kern * base;
    return part;
  });
  const left = Math.min(...parts.map((p) => p.x - p.m.actualBoundingBoxLeft));
  const right = Math.max(...parts.map((p) => p.x + p.m.actualBoundingBoxRight));
  const ascent = Math.max(...parts.map((p) => p.m.actualBoundingBoxAscent));
  const descent = Math.max(...parts.map((p) => p.m.actualBoundingBoxDescent));
  const scale = (mark * S) / (right - left);
  const originX = (S - mark * S) / 2 - left * scale;
  // Centred on the ink, then nudged up 1% so it looks centred.
  const baseline = (S + (ascent + descent) * scale) / 2 - descent * scale - S * 0.01;
  ctx.fillStyle = color;
  for (const p of parts) {
    ctx.font = `${base * scale}px "${p.family}"`;
    ctx.fillText(p.ch, originX + p.x * scale, baseline);
  }

  // Halve repeatedly for small outputs; one big jump would alias.
  let source = canvas;
  while (source.width > size) {
    const next = document.createElement("canvas");
    next.width = next.height = Math.max(size, Math.round(source.width / 2));
    const nctx = next.getContext("2d");
    nctx.imageSmoothingQuality = "high";
    nctx.drawImage(source, 0, 0, next.width, next.height);
    source = next;
  }
  const { data } = source.getContext("2d").getImageData(0, 0, size, size);
  let binary = "";
  for (let i = 0; i < data.length; i += 0x8000)
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A minimal PNG encoder: 8-bit RGB or RGBA, "Sub" filter, zlib. */
function encodePng(size, rgba, alpha) {
  const channels = alpha ? 4 : 3;
  const stride = size * channels + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 1;
    for (let x = 0; x < size; x++) {
      for (let k = 0; k < channels; k++) {
        const value = rgba[(y * size + x) * 4 + k];
        const before = x ? rgba[(y * size + x - 1) * 4 + k] : 0;
        raw[y * stride + 1 + x * channels + k] = (value - before) & 0xff;
      }
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const [roman, italic] = await Promise.all([
  readFile(path.join(fonts, "600SemiBold/Newsreader_600SemiBold.ttf")),
  readFile(path.join(fonts, "600SemiBold_Italic/Newsreader_600SemiBold_Italic.ttf")),
]);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const fontsLoaded = await page.evaluate(
    async ([a, b]) => {
      const load = async (family, b64) => {
        const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        const face = new FontFace(family, bytes.buffer);
        document.fonts.add(await face.load());
      };
      await load("Newsreader", a);
      await load("Newsreader Italic", b);
      return true;
    },
    [roman.toString("base64"), italic.toString("base64")],
  );
  for (const output of outputs) {
    const pixels = Buffer.from(
      await page.evaluate(draw, { ...output, navy, fontsLoaded }),
      "base64",
    );
    await writeFile(
      path.join(assets, output.file),
      encodePng(output.size, pixels, output.alpha),
    );
    console.log(`assets/${output.file} ${output.size}×${output.size}`);
  }
} finally {
  await browser.close();
}
