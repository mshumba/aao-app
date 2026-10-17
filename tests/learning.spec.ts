import { expect, test } from "@playwright/test";
import { sampleRecords, sampleSermons } from "../src/data/sermons";
import { greeting, heroKicker, isNewThisWeek, partOfDay, seriesCaption } from "../src/home/copy";
import {
  fakeQuotes,
  fakeSearch,
  fixtureDays,
  fixtureMoments,
  fixtureNeeds,
  fixturePaths,
} from "../src/learning/fixtures";
import { messagesLabel, searchSermonMeta, trustLine } from "../src/learning/format";
import {
  activePath,
  applyOp,
  emptyProgress,
  enrollmentOf,
  fromRemote,
  nextDay,
  type ProgressOp,
  type ProgressState,
} from "../src/learning/progress";
import type { PathDay } from "../src/learning/types";

// The learning layer's plain-data rules, run without React or the network.

const HABIT = "breaking-free-from-habitual-sin";
const WAIT = "learning-to-wait-on-god";
const at = (day: number) => `2026-10-${String(day).padStart(2, "0")}T08:00:00.000Z`;

function run(ops: ProgressOp[], from: ProgressState = emptyProgress) {
  return ops.reduce(applyOp, from);
}

function daysBy() {
  const map = new Map<string, PathDay[]>();
  fixtureDays.forEach((d) => map.set(d.pathId, [...(map.get(d.pathId) ?? []), d]));
  return map;
}

const find = (id: string) => sampleSermons.find((s) => s.id === id);

test.describe("path progress", () => {
  test("starting twice keeps the first start; done days stay sorted and single", () => {
    const state = run([
      { kind: "start", pathId: HABIT, at: at(1) },
      { kind: "done", pathId: HABIT, day: 2, at: at(2) },
      { kind: "done", pathId: HABIT, day: 1, at: at(2) },
      { kind: "done", pathId: HABIT, day: 2, at: at(3) },
      { kind: "start", pathId: HABIT, at: at(4) },
    ]);
    expect(enrollmentOf(state, HABIT)).toEqual({
      pathId: HABIT,
      startedAt: at(1),
      finishedAt: null,
      done: [1, 2],
    });
    expect(enrollmentOf(state, WAIT)).toBeNull();
  });

  test("undoing a day, finishing, re-opening and leaving", () => {
    let state = run([
      { kind: "start", pathId: HABIT, at: at(1) },
      { kind: "done", pathId: HABIT, day: 1, at: at(1) },
      { kind: "done", pathId: HABIT, day: 2, at: at(2) },
      { kind: "undone", pathId: HABIT, day: 1 },
    ]);
    expect(state.done[HABIT]).toEqual([2]);
    state = run([{ kind: "finish", pathId: HABIT, at: at(5) }], state);
    expect(state.enrollments[HABIT].finishedAt).toBe(at(5));
    // Starting a finished path again re-opens it, keeping when it began.
    state = run([{ kind: "start", pathId: HABIT, at: at(6) }], state);
    expect(state.enrollments[HABIT]).toEqual({ startedAt: at(1), finishedAt: null });
    state = run([{ kind: "leave", pathId: HABIT }], state);
    expect(enrollmentOf(state, HABIT)).toBeNull();
    expect(state.done[HABIT]).toBeUndefined();
  });

  test("a day marked done before the path's start is recorded still enrols", () => {
    const state = run([{ kind: "done", pathId: WAIT, day: 1, at: at(3) }]);
    expect(enrollmentOf(state, WAIT)).toMatchObject({ startedAt: at(3), done: [1] });
  });

  test("the server's rows with this device's unsent changes on top", () => {
    const pending: ProgressOp[] = [
      { kind: "done", pathId: HABIT, day: 3, at: at(9) },
      { kind: "undone", pathId: HABIT, day: 1 },
    ];
    const state = fromRemote(
      {
        enrollments: [{ path_id: HABIT, started_at: at(1), finished_at: null }],
        done: [
          { path_id: HABIT, day: 2, done_at: at(2) },
          { path_id: HABIT, day: 1, done_at: at(1) },
          { path_id: HABIT, day: 2, done_at: at(3) },
        ],
      },
      pending,
    );
    expect(state.done[HABIT]).toEqual([2, 3]);
    expect(state.pending).toEqual(pending);
  });

  test("today is the first day not done, and none once all are", () => {
    expect(nextDay(7, [])).toBe(1);
    expect(nextDay(7, [1, 2])).toBe(3);
    expect(nextDay(7, [1, 3])).toBe(2);
    expect(nextDay(3, [1, 2, 3])).toBeNull();
  });

  test("the active path is the latest started that isn't finished", () => {
    const state = run([
      { kind: "start", pathId: HABIT, at: at(1) },
      { kind: "done", pathId: HABIT, day: 1, at: at(1) },
      { kind: "done", pathId: HABIT, day: 2, at: at(2) },
      { kind: "start", pathId: WAIT, at: at(3) },
    ]);
    const days = daysBy();
    let active = activePath(state, fixturePaths, days, find)!;
    expect(active.path.id).toBe(WAIT);
    expect(active.day).toBe(1);
    // Finish the newer one: the older one is active again, on Day 3.
    const finished = run([{ kind: "finish", pathId: WAIT, at: at(4) }], state);
    active = activePath(finished, fixturePaths, days, find)!;
    expect(active).toMatchObject({ day: 3, done: [1, 2], total: 7, startedAt: at(1) });
    expect(active.today?.youtubeId).toBe("yUDzMcZsVk8");
    expect(active.today?.sermon?.id).toBe("yUDzMcZsVk8");
    // A path that's gone (taken down for review) is skipped.
    expect(activePath(finished, fixturePaths.filter((p) => p.id !== HABIT), days, find)).toBeNull();
  });
});

test.describe("honest words", () => {
  test("only a published path says the ministry set its order", () => {
    expect(trustLine("published")?.text).toBe("Order set by the ministry");
    // A draft carries no label at all (the owner's call), and never the claim.
    expect(trustLine("draft")).toBeNull();
    expect(messagesLabel(1)).toBe("1 message");
    expect(messagesLabel(7)).toBe("7 messages");
  });

  test("a search sermon reads by when it was preached, else published, each part unbroken", () => {
    expect(
      searchSermonMeta({ preachedOn: "2026-09-27", publishedAt: "2026-09-28T10:00:00Z", durationSeconds: 12914 }),
    ).toBe("27\u00a0Sep\u00a02026 · 3\u00a0hr\u00a035\u00a0min");
    expect(
      searchSermonMeta({ preachedOn: null, publishedAt: "2026-09-28T10:00:00Z", durationSeconds: null }),
    ).toBe("28\u00a0Sep\u00a02026");
  });

  test("Home only calls a sermon new within a week of upload", () => {
    const pray = sampleSermons.find((s) => s.id === "nUW8NT2Pe88")!;
    expect(isNewThisWeek(pray, Date.parse("2026-09-29T00:00:00Z"))).toBe(true);
    expect(isNewThisWeek(pray, Date.parse("2026-10-14T00:00:00Z"))).toBe(false);
    expect(heroKicker(pray, new Date("2026-09-29T08:00:00"))).toBe("New this week · 3 hr 35 min");
    expect(heroKicker(pray, new Date("2026-10-14T08:00:00"))).toBe("Latest · 27 Sep · 3 hr 35 min");
    expect(heroKicker(pray, new Date("2027-01-04T08:00:00"))).toBe("Latest · 27 Sep 2026 · 3 hr 35 min");
  });

  test("the greeting uses the first name only, by the time of day", () => {
    expect(greeting("Mufaro Shumba", new Date("2026-10-14T08:00:00"))).toBe("Good morning, Mufaro");
    expect(greeting("  ", new Date("2026-10-14T13:00:00"))).toBe("Good afternoon");
    expect(greeting(null, new Date("2026-10-14T19:00:00"))).toBe("Good evening");
    expect(partOfDay(new Date("2026-10-14T16:59:00"))).toBe("afternoon");
  });

  test("a series caption counts its messages and gives its days", () => {
    const now = new Date("2026-10-14T08:00:00");
    expect(seriesCaption([{ day: "2026-09-22" }, { day: "2026-09-23" }, { day: "2026-09-23" }], now)).toBe(
      "3 messages · 22–23 Sep",
    );
    expect(seriesCaption([{ day: "2026-09-30" }, { day: "2026-10-02" }], now)).toBe(
      "2 messages · 30 Sep – 2 Oct",
    );
    expect(seriesCaption([{ day: "2026-09-30" }], now)).toBe("1 message · 30 Sep");
  });
});

test.describe("local test data", () => {
  test("every path day and moment sits inside its sermon", () => {
    const length = new Map(sampleRecords.map((r) => [r.youtube_id, r.duration_seconds ?? 0]));
    for (const d of fixtureDays) {
      const total = length.get(d.youtubeId)!;
      expect(total, `${d.pathId} day ${d.day}`).toBeGreaterThan(0);
      expect(d.focusStart).toBeLessThan(d.focusEnd);
      expect(d.focusEnd).toBeLessThanOrEqual(total);
      expect(d.keyAt).toBeGreaterThanOrEqual(d.focusStart);
      expect(d.keyAt).toBeLessThan(d.focusEnd);
    }
    for (const m of fixtureMoments) expect(m.end).toBeLessThanOrEqual(length.get(m.youtubeId)!);
    // Each path's days run 1..n with no gaps, as its day count says.
    for (const path of fixturePaths) {
      const days = fixtureDays.filter((d) => d.pathId === path.id).map((d) => d.day);
      expect(days).toEqual(Array.from({ length: path.dayCount }, (_, i) => i + 1));
      for (const need of path.needs) expect(fixtureNeeds.map((n) => n.id)).toContain(need);
    }
  });

  test("the fake search answers a need with its path, and one quote arrives late", async () => {
    const result = await fakeSearch("I keep falling into the same sin");
    expect(result.understood.theme).toBe("breaking a habit of sin");
    expect(result.path).toMatchObject({ id: HABIT, days: 7 });
    expect(result.moments).toHaveLength(6);
    const late = result.moments.filter((m) => m.quote == null);
    expect(late).toHaveLength(1);
    // The excerpt is raw transcript, lowercase and unpunctuated: never a quote.
    expect(late[0].excerpt).toBe(late[0].excerpt.toLowerCase());
    const quotes = await fakeQuotes(late.map((m) => m.id));
    expect(quotes[late[0].id]?.quote).toMatch(/^[A-Z].*\.$/);
    // Unknown ids come back as nothing, not as text.
    expect(await fakeQuotes(["no-such-moment"])).toEqual({ "no-such-moment": null });
    await expect(fakeSearch("   ")).rejects.toMatchObject({ code: "bad_query" });
  });
});
