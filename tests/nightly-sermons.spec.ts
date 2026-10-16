import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { durationSeconds, importNewSermons, LIMITS, readConfig, type Config } from "../scripts/nightly-sermons-core";

// Public-shaped synthetic metadata only. Every request is handled in memory.
const CHANNEL = `UC${"a".repeat(22)}`;
const config: Config = {
  youtubeKey: "mock-youtube-key", channelId: CHANNEL,
  supabaseUrl: "https://example.supabase.co", supabaseKey: "sb_secret_mock_only",
};
const id = (n: number) => `vid${String(n).padStart(8, "0")}`;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const TITLE = "GIFT OF PROPHECY 19 || MID-WEEK SERVICE || DR. AROME OSAYI || RCN MINNESOTA || 10TH DECEMBER 2025";
function video(videoId: string) {
  return {
    id: videoId,
    snippet: {
      title: TITLE, channelId: CHANNEL, publishedAt: "2025-12-10T18:00:00Z", liveBroadcastContent: "none",
      description: "Public description", tags: ["teaching"], thumbnails: { high: { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` } },
    },
    status: { privacyStatus: "public", embeddable: true, uploadStatus: "processed" },
    contentDetails: { duration: "PT1H2M3S" },
  };
}

type Row = Record<string, unknown>;
type Call = { url: URL; method: string; headers: Headers; body: Row[] | undefined };
function service(pages: string[][], source = pages.flat().map(video)) {
  const sermons = new Map<string, Row>(), series = new Map<string, Row>();
  const videos = new Map(source.map((v) => [v.id, v]));
  const calls: Call[] = [];
  let intercept: ((call: Call) => Response | undefined) | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    const call: Call = { url: new URL(String(input)), method: init?.method ?? "GET", headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const intercepted = intercept?.(call);
    if (intercepted) return intercepted;
    const resource = call.url.pathname.split("/").pop();
    if (call.url.hostname === "www.googleapis.com") {
      expect(call.url.searchParams.get("key")).toBe(config.youtubeKey);
      if (resource === "channels") return json({ items: [{ id: CHANNEL, contentDetails: { relatedPlaylists: { uploads: "UUuploads" } } }] });
      if (resource === "playlistItems") {
        const page = Number(call.url.searchParams.get("pageToken") ?? 0);
        return json({ items: (pages[page] ?? []).map((videoId) => ({ contentDetails: { videoId } })),
          ...(page + 1 < pages.length ? { nextPageToken: String(page + 1) } : {}) });
      }
      if (resource === "videos") return json({ items: call.url.searchParams.get("id")!.split(",").flatMap((v) => videos.has(v) ? [videos.get(v)] : []) });
    }
    expect(call.url.hostname).toBe("example.supabase.co");
    expect(call.headers.get("apikey")).toBe(config.supabaseKey);
    expect(call.headers.has("authorization")).toBe(false); // sb_secret_ is not a JWT
    if (call.method === "GET" && resource === "sermons") {
      expect(call.url.searchParams.get("select")).toBe("youtube_id");
      const wanted = call.url.searchParams.get("youtube_id")!.slice(4, -1).split(",");
      return json(wanted.filter((v) => sermons.has(v)).map((youtube_id) => ({ youtube_id })));
    }
    expect(call.method).toBe("POST");
    expect(call.headers.get("prefer")).toBe("resolution=ignore-duplicates,return=representation");
    const key = resource === "series" ? "key" : "youtube_id";
    const target = resource === "series" ? series : sermons;
    expect(call.url.searchParams.get("on_conflict")).toBe(key);
    const inserted: Row[] = [];
    for (const row of call.body!) {
      const value = String(row[key]);
      if (!target.has(value)) { target.set(value, row); inserted.push({ [key]: value }); }
    }
    return json(inserted, 201);
  };
  return { sermons, series, calls, videos, fetcher, intercept: (hook: typeof intercept) => { intercept = hook; } };
}
const run = (fake: ReturnType<typeof service>) => importNewSermons(config, { fetch: fake.fetcher, sleep: async () => {} });

test("configuration fails before I/O; module import does not run the CLI", () => {
  expect(() => readConfig({})).toThrow("Missing configuration");
  const env = { YOUTUBE_API_KEY: "test", YOUTUBE_CHANNEL_ID: CHANNEL, SUPABASE_URL: config.supabaseUrl, SUPABASE_SECRET_KEY: config.supabaseKey };
  expect(readConfig(env)).toEqual({ ...config, youtubeKey: "test" });
  expect(() => readConfig({ ...env, YOUTUBE_CHANNEL_ID: "@ApostleAromeOsayi" })).toThrow("UC channel ID");
  expect(() => readConfig({ ...env, SUPABASE_URL: "https://untrusted.example" })).toThrow("canonical");
  expect(() => readConfig({ ...env, SUPABASE_SECRET_KEY: "sb_publishable_mock" })).toThrow("service_role");
  const child = spawnSync(process.execPath, [resolve("scripts/nightly-sermons.mts")], { env: { NODE_ENV: "test" }, encoding: "utf8" });
  expect(child.status).toBe(1);
  expect(child.stderr).toContain("Missing configuration");
  expect(child.stdout).toBe("");
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(resolve("scripts/nightly-sermons.mts")).href)})`], { env: { NODE_ENV: "test" }, encoding: "utf8" });
  expect(imported.status).toBe(0);
  expect(imported.stdout).toBe("");
  expect(imported.stderr).not.toContain("Missing configuration");
});

test("ISO durations reject malformed or not-yet-ready videos", () => {
  expect(durationSeconds("PT1H2M3S")).toBe(3723);
  expect(durationSeconds("P1DT2H")).toBe(93600);
  expect(durationSeconds("PT10.5S")).toBe(11);
  for (const input of [null, 42, "", "P", "PT", "P1DT", "PT0S", "-PT5S", "P1M", "PT999999999999H"])
    expect(durationSeconds(input), String(input)).toBeNull();
});

test("paginates uploads, deduplicates IDs, parses metadata, and safely reruns", async () => {
  const fake = service([[id(1), id(2)], [id(2), id(3)]]);
  const first = await run(fake);
  expect(first).toMatchObject({ playlistPages: 2, discovered: 3, eligible: 3, insertedSermonsConfirmed: 3, insertedSeriesConfirmed: 1 });
  expect(fake.sermons.get(id(1))).toMatchObject({ title: TITLE, duration_seconds: 3723, part: 19, preached_on: "2025-12-10", series_key: "gift-of-prophecy" });
  expect(fake.series.get("gift-of-prophecy")?.name).toBe("Gift of Prophecy");
  const detailsBefore = fake.calls.filter((c) => c.url.pathname.endsWith("/videos")).length;
  const second = await run(fake);
  expect(second).toMatchObject({ existing: 3, eligible: 0, insertedSermonsConfirmed: 0, insertedSeriesConfirmed: 0 });
  expect(fake.calls.filter((c) => c.url.pathname.endsWith("/videos"))).toHaveLength(detailsBefore);
  expect(fake.calls.some((c) => ["PATCH", "DELETE", "PUT"].includes(c.method))).toBe(false);
});

test("existing editorial rows and series names win, including concurrent inserts", async () => {
  const fake = service([[id(1), id(2), id(3)]]);
  const editorial = { youtube_id: id(1), headline: "Hand-written", title: "Keep me", thumbnail_url: "keep", updated_at: "unchanged" };
  fake.sermons.set(id(1), editorial);
  fake.series.set("gift-of-prophecy", { key: "gift-of-prophecy", name: "Ministry's wording" });
  fake.intercept((call) => {
    if (call.method === "POST" && call.url.pathname.endsWith("/sermons"))
      fake.sermons.set(id(2), { youtube_id: id(2), headline: "Concurrent editorial row" });
  });
  const result = await run(fake);
  expect(result.insertedSermonsConfirmed).toBe(1);
  expect(result.insertedSeriesConfirmed).toBe(0);
  expect(fake.sermons.get(id(1))).toEqual(editorial);
  expect(fake.sermons.get(id(2))?.headline).toBe("Concurrent editorial row");
  expect(fake.series.get("gift-of-prophecy")?.name).toBe("Ministry's wording");
});

test("public channel/status checks skip live, scheduled, unavailable and malformed entries", async () => {
  const entries = Array.from({ length: 13 }, (_, i) => video(id(i + 1)));
  entries[1].snippet.liveBroadcastContent = "live";
  entries[2].snippet.liveBroadcastContent = "upcoming";
  entries[3].status.privacyStatus = "private";
  entries[4].status.privacyStatus = "unlisted";
  entries[5].status.embeddable = false;
  entries[6].status.uploadStatus = "uploaded";
  entries[7].snippet.channelId = `UC${"b".repeat(22)}`;
  entries[8].snippet.title = "";
  entries[9].snippet.publishedAt = "bad date";
  entries[10].contentDetails.duration = "PT0S";
  entries[11].snippet.title = "x".repeat(301);
  const fake = service([[...entries.map((v) => v.id), "bad-id", id(99)]], entries);
  const result = await run(fake);
  expect(result).toMatchObject({ discovered: 14, eligible: 2, skipped: 12, unavailable: 1 });
  expect([...fake.sermons.keys()].sort()).toEqual([id(1), id(13)]);
  entries[1].snippet.liveBroadcastContent = "none"; // replay is now eligible on the next full scan
  expect((await run(fake)).insertedSermonsConfirmed).toBe(1);
});

test("uses editorial headline overrides for a new known public sample", async () => {
  const knownId = "nUW8NT2Pe88";
  const fake = service([[knownId]], [video(knownId)]);
  await run(fake);
  expect(fake.sermons.get(knownId)?.headline).toBe("Pray Without Ceasing");
});

test("50-ID details and insert batches handle a larger new catalogue", async () => {
  const ids = Array.from({ length: 51 }, (_, i) => id(i));
  const fake = service([ids.slice(0, 50), ids.slice(50)]);
  expect((await run(fake)).insertedSermonsConfirmed).toBe(51);
  expect(fake.calls.filter((c) => c.url.pathname.endsWith("/videos")).map((c) => c.url.searchParams.get("id")!.split(",").length)).toEqual([50, 1]);
  expect(fake.calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/sermons")).map((c) => c.body!.length)).toEqual([50, 1]);
});

test("transient status retries are bounded and nonretryable errors are sanitized", async () => {
  const fake = service([[id(1)]]);
  let attempts = 0;
  fake.intercept((call) => {
    if (call.url.pathname.endsWith("/channels") && ++attempts < 3) return json({ error: "temporary" }, 503);
  });
  expect((await run(fake)).insertedSermonsConfirmed).toBe(1);
  expect(attempts).toBe(3);
  const denied = service([[id(1)]]);
  denied.intercept(() => json({ error: config.youtubeKey }, 403));
  await expect(run(denied)).rejects.toThrow("YouTube channels: HTTP 403");
  expect(denied.calls).toHaveLength(1);
  expect(denied.sermons.size).toBe(0);
  const exhausted = service([[id(1)]]);
  exhausted.intercept(() => json({}, 429));
  await expect(run(exhausted)).rejects.toThrow("HTTP 429");
  expect(exhausted.calls).toHaveLength(LIMITS.attempts);
});

test("network failure never leaks fetch error URLs or secrets", async () => {
  let calls = 0;
  const fail: typeof fetch = async () => { calls++; throw new Error(`Failed URL?key=${config.youtubeKey}`); };
  await expect(importNewSermons(config, { fetch: fail, sleep: async () => {} })).rejects.toThrow("YouTube channels: network request failed after 3 attempts");
  expect(calls).toBe(3);
});

test("legacy service-role JWT uses both apikey and Bearer; secret keys use apikey alone", async () => {
  const jwt = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
  const fake = service([[id(1)]]);
  let headers: Headers | undefined;
  fake.intercept((call) => {
    if (call.url.hostname === "example.supabase.co") {
      headers = call.headers;
      return json([{ youtube_id: id(1) }]);
    }
  });
  const result = await importNewSermons({ ...config, supabaseKey: jwt }, { fetch: fake.fetcher });
  expect(result.existing).toBe(1);
  expect(headers?.get("apikey")).toBe(jwt);
  expect(headers?.get("authorization")).toBe(`Bearer ${jwt}`);
  // The main mock asserts apikey-only headers for sb_secret_ on every database call.
});

test("an abort after headers cancels a stalled JSON body", async () => {
  const controller = new AbortController();
  const fetcher: typeof fetch = async (_url, init) => new Response(new ReadableStream({
    start(stream) {
      stream.enqueue(new TextEncoder().encode('{"items":'));
      init!.signal!.addEventListener("abort", () => stream.error(new Error("body aborted")));
      setTimeout(() => controller.abort(), 5);
    },
  }));
  await expect(importNewSermons(config, { fetch: fetcher, signal: controller.signal })).rejects.toThrow("cancelled");
});

test("a committed insert with a lost response retries without overwriting it", async () => {
  const fake = service([[id(1)]]);
  let lost = false;
  fake.intercept((call) => {
    if (call.method === "POST" && call.url.pathname.endsWith("/sermons") && !lost) {
      lost = true;
      for (const row of call.body!) fake.sermons.set(String(row.youtube_id), { ...row, headline: "Committed row" });
      throw new Error("Response lost after commit");
    }
  });
  const result = await run(fake);
  expect(result.insertedSermonsConfirmed).toBe(0); // retry sees a duplicate, not another insert
  expect(fake.sermons.size).toBe(1);
  expect(fake.sermons.get(id(1))?.headline).toBe("Committed row");
});

test("cancellation stops before requests", async () => {
  const fake = service([[id(1)]]);
  const controller = new AbortController(); controller.abort();
  await expect(importNewSermons(config, { fetch: fake.fetcher, signal: controller.signal })).rejects.toThrow("cancelled");
  expect(fake.calls).toHaveLength(0);
});

test("malformed JSON and invalid response envelopes fail before writes", async () => {
  for (const response of [() => new Response("not JSON"), () => json({ wrong: [] })]) {
    const fake = service([[id(1)]]);
    fake.intercept((call) => call.url.pathname.endsWith("/videos") ? response() : undefined);
    await expect(run(fake)).rejects.toThrow(/JSON response|invalid items/);
    expect(fake.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  }
});

test("later discovery failure prevents even the first batch being written", async () => {
  const ids = Array.from({ length: 51 }, (_, i) => id(i));
  const fake = service([ids.slice(0, 50), ids.slice(50)]);
  fake.intercept((call) => call.url.pathname.endsWith("/videos") && call.url.searchParams.get("id") === id(50) ? json({}, 403) : undefined);
  await expect(run(fake)).rejects.toThrow("HTTP 403");
  expect(fake.calls.filter((c) => c.method === "POST")).toHaveLength(0);
});

test("repeated page token and hard page bound stop before any database writes", async () => {
  for (const repeated of [true, false]) {
    const fake = service([]);
    let page = 0;
    fake.intercept((call) => call.url.pathname.endsWith("/playlistItems") ? json({ items: [{ contentDetails: { videoId: id(1) } }], nextPageToken: repeated ? "same" : String(++page) }) : undefined);
    await expect(run(fake)).rejects.toThrow(repeated ? "repeated page token" : "exceeded 100 pages");
    expect(fake.calls.filter((c) => c.url.hostname === "example.supabase.co")).toHaveLength(0);
  }
});

test("partial insert failure can be rerun without changing already committed rows", async () => {
  const ids = Array.from({ length: 51 }, (_, i) => id(i));
  const fake = service([ids.slice(0, 50), ids.slice(50)]);
  fake.intercept((call) => call.method === "POST" && call.url.pathname.endsWith("/sermons") && call.body?.length === 1 ? json({}, 400) : undefined);
  await expect(run(fake)).rejects.toThrow("Supabase sermons: HTTP 400");
  expect(fake.sermons.size).toBe(50);
  const before = new Map(fake.sermons);
  fake.intercept(undefined);
  expect((await run(fake)).insertedSermonsConfirmed).toBe(1);
  for (const [key, row] of before) expect(fake.sermons.get(key)).toEqual(row);
  expect(fake.sermons.size).toBe(51);
});
