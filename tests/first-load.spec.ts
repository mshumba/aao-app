import type { Page } from "@playwright/test";
import { expect, test, type Viewer } from "./fixtures";

// A first visit on a slow phone connection. Lighthouse's mobile throttling:
// 1.6 Mbps down, 750 Kbps up, 150 ms round trip. Every test runs in a fresh
// browser context with the cache off, so nothing is warm.
const KBPS = 1024 / 8;
const SLOW = {
  offline: false,
  latency: 150,
  downloadThroughput: 1600 * KBPS,
  uploadThroughput: 750 * KBPS,
};

/**
 * How long, after the app's script has arrived, the first page may take to
 * show. The script is the same size whatever start-up does (2.5 MB gzipped
 * from the development server, 1.1 MB from a production export), so the
 * bound starts when it finishes downloading. Fonts may hold the first frame
 * for at most 600 ms; running the script, reading the saved session and
 * library and drawing the first screen took 200 to 550 ms more on a laptop
 * (0.8 s after the script in a production export, 1.1 s from the development
 * server), and the rest is room for a slower machine. While the first frame
 * waited for every font file it was 3.1 s (production) and 6.2 s
 * (development), so this fails if fonts block again.
 */
const AFTER_SCRIPT_MS = 1_800;

type Timing = {
  /** When the first page's h1 was on screen and uncovered. */
  content: number;
  /** When the app's script finished downloading. */
  script: number;
  /** When the last font file finished downloading (0 if none had yet). */
  fonts: number;
  /** The heading's text box at first content. */
  box: { width: number; height: number };
  /** How many of the app's faces were size-matched stand-ins then. */
  standIns: number;
};

/** The app's own faces in the page: real files, or sized stand-ins. */
function appFaces() {
  const faces = { real: 0, standIns: 0 };
  document.fonts.forEach((face) => {
    if (!/^"?(Manrope|Newsreader)_/.test(face.family) || face.status !== "loaded") return;
    // size-adjust isn't in TypeScript's DOM types; only stand-ins set it.
    const size = (face as FontFace & { sizeAdjust?: string }).sizeAdjust ?? "100%";
    if (size === "100%") faces.real++;
    else faces.standIns++;
  });
  return faces;
}

async function coldLoad(page: Page): Promise<Timing> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", SLOW);
  await page.addInitScript(`window.appFaces = ${appFaces}`);
  await page.goto("/", { waitUntil: "commit" });
  const handle = await page.waitForFunction(
    () => {
      // The first page's main heading, drawn and not under the start-up
      // cover (which sits above everything until the app is ready).
      const heading = [...document.querySelectorAll("h1")].find((h) => {
        const r = h.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return false;
        const hit = document.elementFromPoint(r.left + 8, r.top + r.height / 2);
        return !!hit && h.contains(hit);
      });
      if (!heading) return null;
      heading.dataset.firstContent = "";
      const range = document.createRange();
      range.selectNodeContents(heading);
      const text = range.getBoundingClientRect();
      const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const script = entries.find((e) => /\/entry[.-]/.test(e.name));
      const fonts = entries.filter((e) => /\.(ttf|otf|woff2?)(\?|$)/.test(e.name));
      return {
        content: performance.now(),
        script: script?.responseEnd ?? 0,
        fonts: fonts.length ? Math.max(...fonts.map((e) => e.responseEnd)) : 0,
        box: { width: text.width, height: text.height },
        standIns: (window as unknown as { appFaces: typeof appFaces }).appFaces().standIns,
      };
    },
    undefined,
    { polling: "raf", timeout: 120_000 },
  );
  return (await handle.jsonValue()) as Timing;
}

function report(name: string, t: Timing) {
  const line =
    `${name}: first content ${Math.round(t.content)} ms, ` +
    `script done ${Math.round(t.script)} ms, ` +
    `after script ${Math.round(t.content - t.script)} ms, ` +
    `last font ${t.fonts ? `${Math.round(t.fonts)} ms` : "still loading"}`;
  console.log(line);
  test.info().annotations.push({ type: "timing", description: line });
}

for (const viewer of ["new", "member"] as Viewer[]) {
  test.describe(`a ${viewer === "new" ? "first" : "returning member's"} cold visit`, () => {
    test.use({ viewer });
    test.setTimeout(180_000);

    test("shows the first page soon after the script arrives, without waiting for fonts", async ({
      page,
    }) => {
      const t = await coldLoad(page);
      report(viewer, t);
      expect(t.script, "the app's script was found").toBeGreaterThan(0);
      expect(t.content - t.script).toBeLessThan(AFTER_SCRIPT_MS);
    });
  });
}

test.describe("fonts arriving after the first page", () => {
  test.use({ viewer: "new" });
  test.setTimeout(180_000);

  test("swap in without moving the words", async ({ page }) => {
    const t = await coldLoad(page);
    // The first page was drawn with the stand-ins, not the real files.
    expect(t.standIns).toBeGreaterThan(0);
    // Once every font is in, the heading keeps its lines and nearly its
    // width: the stand-in faces are sized to match.
    await page.waitForFunction(
      () => {
        const faces = (window as unknown as { appFaces: typeof appFaces }).appFaces();
        return faces.real >= 9 && faces.standIns === 0;
      },
      undefined,
      { timeout: 120_000 },
    );
    // Let the swapped faces lay out.
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>("h1[data-first-content]")!;
      const range = document.createRange();
      range.selectNodeContents(heading);
      const r = range.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    console.log(
      `heading text box: ${Math.round(t.box.width)}×${Math.round(t.box.height)} with stand-in faces, ` +
        `${Math.round(after.width)}×${Math.round(after.height)} with the real ones`,
    );
    expect(after.height).toBe(t.box.height);
    expect(Math.abs(after.width - t.box.width) / after.width).toBeLessThan(0.06);
  });
});

// Home's hero, from its first frame on screen: the greeting, the title and
// Watch already at full strength (nothing rises in on a delay), and the
// band's height never changes after (the title finds its size under the
// start-up cover).
for (const viewer of ["guest", "member"] as Viewer[]) {
  test.describe(`a ${viewer}'s Home`, () => {
    test.use({ viewer });

    test("shows its hero whole in the first frame, and its height never changes after", async ({ page }) => {
      await page.addInitScript(() => {
        type Frame = { at: number; height: number; faint: string[] };
        const w = window as unknown as { __hero: Frame[] };
        w.__hero = [];
        const covered = (el: Element) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return true;
          const hit = document.elementFromPoint(r.left + Math.min(8, r.width / 2), r.top + r.height / 2);
          return !hit || !(el.contains(hit) || hit.contains(el));
        };
        const faint = (el: Element) => {
          for (let a: Element | null = el; a; a = a.parentElement)
            if (Number(getComputedStyle(a).opacity) < 1) return true;
          return false;
        };
        const tick = () => {
          const pager = document.querySelector('[data-testid="hero-pager"]');
          const field = document.querySelector('[data-testid="home-search"]');
          if (pager && field && !covered(field)) {
            const parts = {
              greeting: document.querySelector("h1"),
              title: pager.querySelector('[role="button"]'),
              watch: document.querySelector('[data-testid="hero-watch"]'),
            };
            w.__hero.push({
              at: performance.now(),
              height: pager.parentElement!.getBoundingClientRect().height,
              faint: Object.entries(parts)
                .filter(([, el]) => !el || faint(el))
                .map(([name]) => name),
            });
          }
          if (w.__hero.length < 60) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.goto("/");
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __hero: unknown[] }).__hero.length), {
          timeout: 20_000,
        })
        .toBeGreaterThanOrEqual(60);
      const frames = await page.evaluate(
        () => (window as unknown as { __hero: { at: number; height: number; faint: string[] }[] }).__hero,
      );
      expect(frames[0].faint, "faint in Home's first frame").toEqual([]);
      expect(new Set(frames.map((f) => f.height)).size, "the hero's heights").toBe(1);
    });
  });
}
