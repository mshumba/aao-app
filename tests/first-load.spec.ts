import type { Page } from "@playwright/test";
import { expect, shown, test, type Viewer } from "./fixtures";

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
 * for at most 400 ms; running the script, reading the saved session and
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

  for (const missingPreferred of [false, true]) {
    test(missingPreferred
      ? "use size-matched secondary serif faces when preferred local fonts are absent"
      : "swap in without moving the words", async ({ page }) => {
      if (missingPreferred) {
        await page.addInitScript(() => {
          const NativeFontFace = FontFace;
          window.FontFace = class extends NativeFontFace {
            constructor(...args: ConstructorParameters<typeof FontFace>) {
              // Simulate a device without Georgia/Noto, while leaving the
              // actual Times/Liberation fallback and real files untouched.
              if (args[0].startsWith("Newsreader_") && typeof args[1] === "string" && args[1].includes('local("Georgia'))
                args[1] = 'local("__aao_missing_preferred_serif__")';
              super(...args);
            }
          };
        });
      }
      // Throttling alone cannot guarantee that fonts arrive after content.
      // Hold their responses until the actual first frame has been measured.
      let release!: () => void;
      const pending = new Promise<void>((resolve) => { release = resolve; });
      await page.route(/\.(ttf|otf|woff2?)(\?|$)/, async (route) => {
        await pending;
        await route.continue();
      });
      try {
        const t = await coldLoad(page);
        expect(t.fonts, "font responses are still held").toBe(0);
        expect(t.standIns, "all nine faces have a loaded stand-in").toBe(9);
        release();
        await page.waitForFunction(
          () => {
            const faces = (window as unknown as { appFaces: typeof appFaces }).appFaces();
            return faces.real === 9 && faces.standIns === 0;
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
      } finally {
        release();
      }
    });
  }

  test("real files can arrive before local lookups, and late stand-ins never replace them", async ({ page }) => {
    await page.addInitScript(`window.appFaces = ${appFaces}`);
    await page.addInitScript(() => {
      const NativeFontFace = FontFace;
      const locals = new WeakSet<FontFace>();
      const held: (() => Promise<void>)[] = [];
      window.FontFace = class extends NativeFontFace {
        constructor(...args: ConstructorParameters<typeof FontFace>) {
          super(...args);
          if (/^(Manrope|Newsreader)_/.test(args[0]) && typeof args[1] === "string" && args[1].startsWith("local("))
            locals.add(this);
        }
        load(): Promise<FontFace> {
          if (!locals.has(this)) return super.load();
          return new Promise((resolve, reject) => {
            held.push(() => super.load().then(resolve, reject));
          });
        }
      };
      (window as unknown as { releaseLocalFonts: () => Promise<void[]> }).releaseLocalFonts =
        () => Promise.all(held.map((release) => release()));
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Teaching that builds you up", exact: true })).toBeVisible();
    const faces = () => page.evaluate(() => (window as unknown as { appFaces: typeof appFaces }).appFaces());
    expect(await faces()).toEqual({ real: 9, standIns: 0 });
    await page.evaluate(() => (window as unknown as { releaseLocalFonts: () => Promise<void[]> }).releaseLocalFonts());
    expect(await faces()).toEqual({ real: 9, standIns: 0 });
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

// Home's hero as the pager slides (16 October 2026, "the cards at the top
// lag"): nothing on the pages is rebuilt while it moves, and Watch, the dots
// and what screen readers reach follow the page once the pager rests on it.
test.describe("a guest's hero pager", () => {
  test.use({ viewer: "guest" });

  test("slides without rebuilding its pages, and Watch follows the page it comes to rest on", async ({
    page,
  }) => {
    await page.goto("/");
    const pager = page.getByTestId("hero-pager");
    const watch = page.getByTestId("hero-watch");
    await expect(watch).toHaveAccessibleName("Watch sermon: Pray Without Ceasing");
    // Each page's words, and on every frame of the slide where the pager is
    // and what Watch says.
    await pager.evaluate((el) => {
      type Frame = { x: number; watch: string | null };
      const w = window as unknown as { __words: Element[]; __slide: Frame[] };
      w.__words = Array.from(el.querySelectorAll('[role="button"]'));
      w.__slide = [];
      const tick = () => {
        const label = document.querySelector('[data-testid="hero-watch"]')!.getAttribute("aria-label");
        w.__slide.push({ x: el.scrollLeft, watch: label });
        if (w.__slide.length < 90) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      el.scrollBy({ left: el.clientWidth, behavior: "smooth" });
    });
    await expect(watch).toHaveAccessibleName("Watch sermon: Apostolic Shift: Grand Finale");
    await expect(page.getByRole("slider", { name: "Newest sermons" })).toHaveAttribute("aria-valuetext", "2 of 4");
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __slide: unknown[] }).__slide.length))
      .toBe(90);
    const { slide, kept, width } = await pager.evaluate((el) => {
      const w = window as unknown as { __words: Element[]; __slide: { x: number; watch: string | null }[] };
      const now = Array.from(el.querySelectorAll('[role="button"]'));
      return {
        slide: w.__slide,
        kept: w.__words.length === now.length && w.__words.every((node, i) => node === now[i]),
        width: el.clientWidth,
      };
    });
    expect(slide.some((f) => f.x > 1 && f.x < width - 1), "frames mid-slide").toBe(true);
    // Watch changed only once the pager was on the second page.
    const changed = slide.findIndex((f) => f.watch !== slide[0].watch);
    expect(changed).toBeGreaterThan(0);
    expect(Math.abs(slide[changed].x - width)).toBeLessThanOrEqual(1);
    expect(kept, "the pages' words are the same nodes").toBe(true);
    // Only the page showing is reachable, by screen readers and the keyboard.
    await expect(shown(pager.getByRole("button"))).toHaveAccessibleName(/\. Apostolic Shift: Grand Finale$/);
    await expect(pager.locator('[role="button"][tabindex="0"]')).toHaveAccessibleName(
      /\. Apostolic Shift: Grand Finale$/,
    );
  });
});
