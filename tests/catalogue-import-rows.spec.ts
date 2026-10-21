/// <reference types="node" />
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { buildCatalogueRow, catalogueSeries, type CatalogueVideo } from "../scripts/catalogue-rows";

// Public-shaped synthetic metadata; no channel manifest, credentials or network.
const TITLE = "GIFT OF PROPHECY 19 || MID-WEEK SERVICE || DR. AROME OSAYI || RCN MINNESOTA || 10TH DECEMBER 2025";
const published = "2025-12-11T03:00:00Z";
const id = (n: number) => `vid${String(n).padStart(8, "0")}`;

test("shared rows retain the manifest importer's parsed metadata and optional-field normalization", () => {
  const video = {
    title: `  ${TITLE}  `, published_at: published, duration_seconds: 3723.6,
    description: "  Public description\n ", thumbnail_url: "https://i.ytimg.com/vi/vid00000001/hqdefault.jpg",
    tags: ["teaching", 42, "", null],
  };
  const before = structuredClone(video);
  expect(buildCatalogueRow(id(1), video as CatalogueVideo)).toEqual({
    youtube_id: id(1), title: TITLE, headline: "Gift of Prophecy 19", event: "Mid-Week Service",
    series_key: "gift-of-prophecy", series: "Gift of Prophecy", part: 19, session: null,
    speaker: null, venue: "RCN Minnesota", preached_on: "2025-12-10", published_at: published,
    duration_seconds: 3724, description: "Public description", thumbnail_url: video.thumbnail_url,
    tags: ["teaching", ""],
  });
  expect(video).toEqual(before);
});

test("shared rows keep editorial headlines ahead of parsed wording", () => {
  const row = buildCatalogueRow("nUW8NT2Pe88", { title: `  ${TITLE}  `, published_at: published });
  expect(row).toMatchObject({ title: TITLE, headline: "Pray Without Ceasing", series_key: "gift-of-prophecy" });
});

test("missing or blank optional fields stay nullable without strengthening manifest validation", () => {
  const minimal = { title: "  A quiet teaching  ", published_at: "2026-10-16T12:00:00+02:00" };
  expect(buildCatalogueRow(id(1), minimal)).toMatchObject({
    title: "A quiet teaching", published_at: minimal.published_at,
    duration_seconds: null, description: null, thumbnail_url: null, tags: [],
  });
  expect(buildCatalogueRow(id(2), { ...minimal, description: " \n ", thumbnail_url: "", tags: null, duration_seconds: 0 }))
    .toMatchObject({ description: null, thumbnail_url: null, tags: [], duration_seconds: 0 });
  // The API importer applies its stricter date/length checks before this helper.
  expect(buildCatalogueRow(id(3), { ...minimal, published_at: "legacy-date" })?.published_at).toBe("legacy-date");
});

test("shared rows skip the same missing ID, title and upload date cases as the manual importer", () => {
  const valid = { title: TITLE, published_at: published };
  for (const invalid of ["", "short-id", "x".repeat(12), "!".repeat(11)])
    expect(buildCatalogueRow(invalid, valid)).toBeNull();
  for (const video of [{}, { published_at: published }, { title: " \n", published_at: published }, { title: TITLE }, { title: TITLE, published_at: "" }])
    expect(buildCatalogueRow(id(1), video)).toBeNull();
});

test("series use the most common wording, then the newest wording only to break a tie", () => {
  const row = (n: number, wording: string, date: string) => buildCatalogueRow(id(n), {
    title: `${wording} 2026 | DAY ${n}`, published_at: date,
  })!;
  const common = "40 DAYS PRAYER AND FASTING";
  const alternate = "40 DAYS FASTING & PRAYER";
  const rows = Object.freeze([
    row(1, common, "2026-02-01T12:00:00Z"),
    row(2, common, "2026-02-02T12:00:00Z"),
    row(3, alternate, "2026-02-03T12:00:00Z"),
    buildCatalogueRow(id(9), { title: "A quiet teaching", published_at: published })!,
  ]);
  expect(catalogueSeries(rows)).toEqual([{ key: "40-days-fasting-and-prayer-2026", name: "40 Days Prayer and Fasting 2026" }]);
  const tied = Object.freeze([...rows, row(4, alternate, "2026-02-04T12:00:00Z")]);
  expect(catalogueSeries(tied)).toEqual([{ key: "40-days-fasting-and-prayer-2026", name: "40 Days Fasting & Prayer 2026" }]);
  expect(catalogueSeries([...tied].reverse())).toEqual(catalogueSeries(tied));
  expect(catalogueSeries([])).toEqual([]);
});

test("manual CLI dry run preserves its pre-extraction coverage report without credentials or requests", () => {
  const directory = mkdtempSync(join(tmpdir(), "aao-catalogue-rows-"));
  try {
    const manifest = join(directory, "synthetic-manifest.json");
    writeFileSync(manifest, JSON.stringify({ videos: {
      [id(1)]: { title: `  ${TITLE}  `, published_at: published, duration_seconds: 3723.6, description: "  Public description  ", tags: ["teaching", 42] },
      [id(2)]: { title: "Gift Of Prophecy 8: The Power Of A True Gathering - Dr. Arome Osayi", published_at: "2025-10-09T12:00:00Z", description: "  " },
      [id(3)]: { title: "  THE MARRIAGE COVENANT - DR. AROME OSAYI  ", published_at: "2026-08-12T16:00:00Z" },
      [id(4)]: { title: "REV. ANTHONY AUDU || CHARACTERS AROUND THE ALTAR 2 || 6TH FEB. 2024", published_at: "2024-02-06T21:00:00Z" },
      [id(5)]: { title: "A quiet teaching", published_at: "2026-10-16T12:00:00Z" },
      "short-id": { title: "Invalid ID", published_at: published },
      [id(6)]: { title: "  ", published_at: published },
      [id(7)]: { title: "Missing publication date" },
    } }));
    const blockRequests = `data:text/javascript,${encodeURIComponent("globalThis.fetch = () => { process.stderr.write('Unexpected network request'); process.exit(97); };")}`;
    const child = spawnSync(process.execPath, [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--import", blockRequests,
      resolve(__dirname, "../scripts/import-catalogue.mts"), manifest, "--dry-run",
    ], { cwd: directory, env: { NODE_ENV: "test" }, encoding: "utf8", timeout: 10_000 });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(child.stderr).toBe("");
    // Captured with this synthetic manifest before extracting the shared helper.
    expect(child.stdout).toBe([
      "Videos in manifest: 8 (3 skipped without an ID, title or upload date)",
      "Preaching date read from title: 2 (40.0%)",
      "Event: 1 (20.0%)",
      "In a series: 3 (60.0%) across 2 series",
      "Part or day number: 3 (60.0%)",
      "Guest or additional speaker named: 1 (20.0%)",
      "Venue: 1 (20.0%)",
      "Headline is the whole title (nothing to shorten): 1 (20.0%)",
      "",
    ].join("\n"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
