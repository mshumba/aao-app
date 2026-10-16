import type { Page } from "@playwright/test";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import { encodeSnapshot, type Changes, type SermonRecord, type Snapshot } from "../src/catalogue/records";
import { NEWEST, createRemote } from "../src/catalogue/remote";
import { FULL_SYNC_EVERY, loadCatalogue, type CatalogueSource, type Remote, type Store } from "../src/catalogue/sync";
import { sampleRecords, sampleSnapshot } from "../src/data/sermons";
import { IONICON_PATHS } from "../src/kit/icons/ionicons";
import { expect, test } from "./fixtures";

// A first visit on a slow phone connection (15 October 2026): Home's hero
// shows from the newest sermons while the rest of the library arrives, its
// words don't wait for the artwork (a small copy comes first), and icons are
// drawn on the web without the 210 KB icon font, so none is ever an empty box.

// Lighthouse's mobile throttling: 1.6 Mbps down, 750 Kbps up, 150 ms.
const KBPS = 1024 / 8;
const SLOW = { offline: false, latency: 150, downloadThroughput: 1600 * KBPS, uploadThroughput: 750 * KBPS };
/**
 * How long after the app's script Home may take to be usable: first-load's
 * 1.8 s for the first page's heading, plus the hero's arrival (Watch rises
 * 300 ms after the page, over 360 ms). 1.4 to 1.5 s from the development
 * server on a laptop. Before, Watch's icon waited for the icon font (5 to 9 s
 * more in a production export on this link) and the words for the artwork.
 */
const HOME_AFTER_SCRIPT_MS = 2_500;

// ---- The library: the newest sermons first ---------------------------------------

const NOW = Date.parse("2026-10-15T12:00:00Z");

function record(n: number): SermonRecord & { updated_at: string } {
  const day = new Date(Date.parse("2026-10-14T10:00:00Z") - n * 86_400_000).toISOString();
  return {
    ...sampleRecords[0],
    youtube_id: `v${String(n).padStart(10, "0")}`,
    title: `MESSAGE ${n}`,
    headline: `Message ${n}`,
    published_at: day,
    thumbnail_url: `https://i.ytimg.com/vi/v${String(n).padStart(10, "0")}/hqdefault.jpg`,
    updated_at: `2026-10-0${1 + (n % 9)}T00:00:00+00:00`,
  };
}

function memoryStore(initial: string | null = null) {
  const store = {
    raw: initial,
    writes: 0,
    read: async () => store.raw,
    write: async (raw: string) => {
      store.raw = raw;
      store.writes++;
    },
  };
  return store satisfies Store;
}

const strip = ({ updated_at: _u, ...rest }: SermonRecord & { updated_at?: string }) => rest as SermonRecord;
const library: Changes = {
  sermons: [0, 1, 2].map((n) => strip(record(n))),
  series: [{ key: "lioness-conference-2026", name: "Lioness Conference 2026" }],
  syncedAt: "2026-10-09T00:00:00+00:00",
};

/** A Supabase stand-in whose whole fetch hands over the newest two first, then `rest`. */
function remoteInTwoSteps(rest: "arrives" | "fails") {
  const seen = { callback: [] as boolean[] };
  const remote: Remote = {
    fetchAll: async (onNewest) => {
      seen.callback.push(!!onNewest);
      onNewest?.({ ...library, sermons: library.sermons.slice(0, 2), syncedAt: null });
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (rest === "fails") throw new Error("offline");
      return library;
    },
    fetchChanges: async () => ({ sermons: [], series: [], syncedAt: null }),
  };
  return { remote, seen };
}

async function load(remote: Remote, store: Store) {
  const reports: [CatalogueSource, number, string | null][] = [];
  const result = await loadCatalogue({
    remote,
    store,
    sample: sampleSnapshot,
    now: () => NOW,
    report: (snapshot, source) => reports.push([source, snapshot.sermons.length, snapshot.syncedAt]),
  });
  return { ...result, reports };
}

test("a first visit shows the newest sermons at once, then the whole library, and keeps only the whole", async () => {
  const store = memoryStore();
  const { remote } = remoteInTwoSteps("arrives");
  const result = await load(remote, store);
  expect(result.online).toBe(true);
  expect(result.reports).toEqual([
    ["newest", 2, null],
    ["remote", 3, library.syncedAt],
  ]);
  // Saved once, whole: the newest alone never reaches the device's copy.
  expect(store.writes).toBe(1);
  expect(JSON.parse(store.raw!).rows).toHaveLength(3);
});

test("if the rest can't load, the newest stay (never the sample) and nothing is saved", async () => {
  const store = memoryStore();
  const { remote } = remoteInTwoSteps("fails");
  const result = await load(remote, store);
  expect(result.online).toBe(false);
  expect(result.reports).toEqual([["newest", 2, null]]);
  expect(store.raw).toBeNull();
});

test("a saved copy is never swapped for the newest alone, even on the weekly whole fetch", async () => {
  const saved: Snapshot = { ...library, fullAt: NOW - FULL_SYNC_EVERY - 1 };
  const store = memoryStore(encodeSnapshot(saved));
  const { remote, seen } = remoteInTwoSteps("arrives");
  const result = await load(remote, store);
  expect(seen.callback).toEqual([false]);
  expect(result.reports.map(([source]) => source)).toEqual(["cache", "remote"]);
});

/** The REST API over `rows`, recording each request as it starts and ends. */
function fakeSupabase(rows: ReturnType<typeof record>[]) {
  const log: string[] = [];
  const series = [{ key: "lioness-conference-2026", name: "Lioness Conference 2026", updated_at: "2026-10-01T00:00:00+00:00" }];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop();
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset"));
    const order = url.searchParams.get("order");
    const tag = `${table} ${offset}+${limit}`;
    log.push(`start ${tag}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    let all: object[] = series;
    if (table === "sermons") {
      expect(order).toBe("published_at.desc,youtube_id");
      all = [...rows].sort((a, b) => b.published_at.localeCompare(a.published_at) || a.youtube_id.localeCompare(b.youtube_id));
    }
    const page = all.slice(offset, offset + limit);
    const counted = (init?.headers as Record<string, string>)?.Prefer === "count=exact";
    log.push(`end ${tag}`);
    return new Response(JSON.stringify(page), {
      headers: counted ? { "content-range": `${offset}-${offset + page.length - 1}/${all.length}` } : {},
    });
  };
  return { fetch, log };
}

test("the whole fetch asks for the newest sermons alone first, then the rest together", async () => {
  const rows = Array.from({ length: 2450 }, (_, n) => record(n));
  const supabase = fakeSupabase(rows);
  const realFetch = globalThis.fetch;
  globalThis.fetch = supabase.fetch as typeof fetch;
  try {
    const remote = createRemote({ url: "https://example.supabase.co", key: "public" });
    let newest: Changes | null = null;
    const all = await remote.fetchAll((first) => {
      newest = first;
      supabase.log.push("newest reported");
    });
    // The newest come in order, with every series, before the rest.
    expect(newest!.sermons).toHaveLength(NEWEST);
    expect(newest!.sermons[0].youtube_id).toBe(rows[0].youtube_id);
    expect(newest!.sermons[NEWEST - 1].youtube_id).toBe(rows[NEWEST - 1].youtube_id);
    expect(newest!.series).toEqual([{ key: "lioness-conference-2026", name: "Lioness Conference 2026" }]);
    expect(all.sermons).toHaveLength(2450);
    expect(new Set(all.sermons.map((s) => s.youtube_id)).size).toBe(2450);
    expect(all.syncedAt).toBe("2026-10-09T00:00:00+00:00");
    expect(all.sermons[0]).not.toHaveProperty("updated_at");

    const log = supabase.log.filter((line) => line.includes("sermons") || line === "newest reported");
    // One request for the newest; then, once it's in, the other three at once.
    expect(log.slice(0, 2)).toEqual([`start sermons 0+${NEWEST}`, `end sermons 0+${NEWEST}`]);
    const rest = [`sermons ${NEWEST}+1000`, `sermons ${NEWEST + 1000}+1000`, `sermons ${NEWEST + 2000}+1000`];
    expect(log.slice(2, 5).sort()).toEqual(rest.map((r) => `start ${r}`).sort());
    expect(log.indexOf("newest reported")).toBeLessThan(log.indexOf(`end ${rest[0]}`));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a library small enough for one request comes whole, with nothing reported early", async () => {
  const supabase = fakeSupabase(Array.from({ length: 150 }, (_, n) => record(n)));
  const realFetch = globalThis.fetch;
  globalThis.fetch = supabase.fetch as typeof fetch;
  try {
    let early = false;
    const all = await createRemote({ url: "https://example.supabase.co", key: "public" }).fetchAll(() => (early = true));
    expect(all.sermons).toHaveLength(150);
    expect(early).toBe(false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---- Icons: drawn, never an empty box ----------------------------------------------

// Node's file system, typed here: the app's tsconfig leaves Node's types out.
type Fs = {
  readFileSync(path: string, encoding: "utf8"): string;
  readdirSync(path: string): string[];
  statSync(path: string): { isDirectory(): boolean };
};
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule(
  "node:fs",
) as Fs;

/** Every Ionicon name in the app's source (`src`), where an icon is named. */
function iconNamesInSource(src: string) {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const path = `${dir}/${name}`;
      if (fs.statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !path.endsWith("kit/icons/ionicons.ts")) files.push(path);
    }
  };
  walk(src);
  const names = new Map<string, string>();
  for (const file of files)
    for (const [i, line] of fs.readFileSync(file, "utf8").split("\n").entries()) {
      if (!/[Ii]con|name=|IconName/.test(line)) continue;
      for (const match of line.matchAll(/"([a-z][a-z0-9-]*)"/g))
        if (match[1] in glyphs && !names.has(match[1])) names.set(match[1], `${file.slice(src.length + 1)}:${i + 1}`);
    }
  return names;
}

// Words that happen to be Ionicon names where no icon is meant (a role, a
// size, a route, a query parameter), and icons the web never draws.
const NOT_WEB_ICONS = new Set([
  "body", "card", "cloud", "home", "list", "radio", "save", "scale", "send", "share", "today", "watch", "alert",
  // The tab bar's fallback on native builds without SVG; Android's share icon.
  "ellipse", "ellipse-outline", "share-social-outline",
]);

test("every icon the app names is drawn on the web from its outline", () => {
  const src = `${test.info().project.testDir}/../src`;
  const missing = [...iconNamesInSource(src)].filter(([name]) => !NOT_WEB_ICONS.has(name) && !IONICON_PATHS[name]);
  // Add the name to scripts/ionicon-paths.mjs and run it.
  expect(missing.map(([name, where]) => `${name} (${where})`)).toEqual([]);
});

type FirstHome = {
  script: number;
  usable: number;
  iconWithoutFont: number;
  fontGlyphs: number;
  iconFont: number;
};

/** A cold visit to Home on the slow link: when the hero's title and Watch, with its icon drawn, first show. */
async function coldHome(page: Page): Promise<FirstHome> {
  await page.addInitScript(() => {
    const w = window as unknown as { __first: Partial<FirstHome> & { iconWithoutFont: number } };
    w.__first = { iconWithoutFont: 0 };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return false;
      const hit = document.elementFromPoint(r.left + Math.min(8, r.width / 2), r.top + r.height / 2);
      if (!hit || !(el.contains(hit) || hit.contains(el))) return false;
      for (let a: Element | null = el; a; a = a.parentElement)
        if (Number(getComputedStyle(a).opacity) < 0.5) return false;
      return true;
    };
    const fontGlyphs = () =>
      [...document.querySelectorAll("div, span")].filter(
        (e) => e.childElementCount === 0 && e.textContent && /ionicons/i.test(getComputedStyle(e).fontFamily),
      );
    const tick = () => {
      const f = w.__first;
      // A glyph on screen with the icon font not in yet would be a box.
      if (fontGlyphs().some(visible) && !document.fonts.check("16px ionicons")) f.iconWithoutFont++;
      const watch = document.querySelector('[data-testid="hero-watch"]');
      const pager = document.querySelector('[data-testid="hero-pager"]');
      const title = pager && [...pager.querySelectorAll('[role="button"]')].find((b) => (b.textContent ?? "").length > 2);
      if (!f.usable && watch && title && visible(watch) && visible(title) && watch.querySelector("svg[data-icon] path"))
        f.usable = performance.now();
      if (performance.now() < 60_000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", SLOW);
  await page.goto("/", { waitUntil: "commit" });
  await page.waitForFunction(() => (window as unknown as { __first: FirstHome }).__first.usable, undefined, {
    timeout: 120_000,
    polling: 100,
  });
  // A moment more, for anything that would load an icon font late.
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const script = entries.find((e) => /\/entry[.-]/.test(e.name));
    const first = (window as unknown as { __first: FirstHome }).__first;
    return {
      ...first,
      script: script?.responseEnd ?? 0,
      fontGlyphs: [...document.querySelectorAll("div, span")].filter((e) =>
        /ionicons/i.test(getComputedStyle(e).fontFamily),
      ).length,
      iconFont: entries.filter((e) => /Ionicons/i.test(e.name)).length,
    };
  });
}

for (const viewer of ["guest", "member"] as const) {
  test.describe(`a ${viewer}'s cold visit on a slow connection`, () => {
    test.use({ viewer });
    test.setTimeout(180_000);

    test("shows the hero's title and Watch with its icon soon after the script, and never an empty box", async ({
      page,
    }) => {
      const t = await coldHome(page);
      const line = `${viewer}: usable Home ${Math.round(t.usable)} ms, script done ${Math.round(t.script)} ms, after script ${Math.round(t.usable - t.script)} ms`;
      console.log(line);
      test.info().annotations.push({ type: "timing", description: line });
      expect(t.script).toBeGreaterThan(0);
      // Nothing on Home's first screen waits for a font or the artwork.
      expect(t.usable - t.script).toBeLessThan(HOME_AFTER_SCRIPT_MS);
      expect(t.iconWithoutFont).toBe(0);
      expect(t.fontGlyphs).toBe(0);
      expect(t.iconFont).toBe(0);
    });
  });
}

// ---- The hero's artwork --------------------------------------------------------------

/** Any image will do for the artwork. */
const PICTURE = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="#345"/></svg>';

test.describe("the hero's artwork", () => {
  test.use({ viewer: "guest" });

  test("the words don't wait for it; a small copy comes first and the sharp one fades in over it", async ({ page }) => {
    // When the hero's first page appears, and when its title and Watch are
    // drawn (more than half faded in).
    await page.addInitScript(() => {
      const w = window as unknown as { __hero: { pager?: number; words?: number } };
      w.__hero = {};
      const shown = (el: Element | null | undefined) => {
        if (!el || !el.getBoundingClientRect().width) return false;
        for (let a: Element | null = el; a; a = a.parentElement)
          if (Number(getComputedStyle(a).opacity) < 0.5) return false;
        return true;
      };
      const tick = () => {
        const pager = document.querySelector('[data-testid="hero-pager"]');
        if (pager && !w.__hero.pager) w.__hero.pager = performance.now();
        const title = pager?.querySelector('[role="button"]');
        if (!w.__hero.words && shown(title) && shown(document.querySelector('[data-testid="hero-watch"]')))
          w.__hero.words = performance.now();
        if (!w.__hero.words) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // The sharp copy takes 4 s; the small one is quick.
    const requested: string[] = [];
    await page.route(/^https:\/\/i\.ytimg\.com\//, async (route) => {
      const url = route.request().url();
      requested.push(url.replace("https://i.ytimg.com/", ""));
      if (/maxresdefault|sddefault/.test(url)) await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.fulfill({ status: 200, contentType: "image/svg+xml", body: PICTURE }).catch(() => {});
    });
    await page.goto("/");
    const hero = () => page.evaluate(() => (window as unknown as { __hero: { pager?: number; words?: number } }).__hero);
    await expect.poll(async () => (await hero()).words, { timeout: 15_000 }).toBeGreaterThan(0);
    const { pager, words } = await hero();
    // Only the words' own arrival (up to 0.66 s), never the artwork's 4 s.
    expect(words! - pager!).toBeLessThan(1_000);
    const sharpIn = () =>
      page.evaluate(() => {
        const img = document.querySelector<HTMLImageElement>('[data-testid="hero-art"] img');
        return !!img && img.complete && img.naturalWidth > 0;
      });
    expect(await sharpIn()).toBe(false);
    const opacity = () =>
      page.getByTestId("hero-art-preview").evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(await opacity()).toBe(1);
    // The small copy: YouTube's 320×180, for the newest sermon.
    const newest = sampleRecords.reduce((a, b) => (a.published_at > b.published_at ? a : b)).youtube_id;
    expect(requested).toContain(`vi/${newest}/mqdefault.jpg`);
    // Then the sharp one, which takes over.
    await expect.poll(sharpIn, { timeout: 15_000 }).toBe(true);
    await expect.poll(opacity).toBe(0);
    expect(requested.some((u) => /^vi(_webp)?\//.test(u) && u.includes(`${newest}/maxresdefault`))).toBe(true);
  });
});
