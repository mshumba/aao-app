import { createSavedWrites, type SavedService } from "../src/auth/savedWrites";
import { SERMON, expect, seedStorage, shown, test } from "./fixtures";

// Saves and unsaves of one sermon from different screens (the sermon page's
// Save, Home's, search's) go through one queue (src/auth/savedWrites.ts), so
// the service ends with the last tap however the requests would have
// raced. The queue is tested on its own with a stand-in service whose
// writes land when the test says; the last test goes through the app.

const A = "local:a@example.com";
const B = "local:b@example.com";
const X = "sermon-x";
const Y = "sermon-y";

/** An account service whose writes wait until the test lands or fails them. */
function standIn() {
  const server = new Map<string, Set<string>>();
  const screen = new Map<string, Set<string>>();
  const setOf = (map: Map<string, Set<string>>, userId: string) => {
    let set = map.get(userId);
    if (!set) map.set(userId, (set = new Set()));
    return set;
  };
  type Write = {
    userId: string;
    sermonId: string;
    saved: boolean;
    land: () => void;
    fail: () => void;
  };
  const sent: Write[] = [];
  /** Writes in the order the service applied them. */
  const applied: string[] = [];
  const service: SavedService = {
    write: (userId, sermonId, saved) =>
      new Promise((resolve, reject) => {
        sent.push({
          userId,
          sermonId,
          saved,
          land: () => {
            const set = setOf(server, userId);
            if (saved) set.add(sermonId);
            else set.delete(sermonId);
            applied.push(`${saved ? "save" : "unsave"} ${sermonId}`);
            resolve();
          },
          fail: () => reject(new Error("network")),
        });
      }),
    show: (userId, sermonId, saved) => {
      const set = setOf(screen, userId);
      if (saved) set.add(sermonId);
      else set.delete(sermonId);
    },
  };
  return {
    writes: createSavedWrites(service),
    sent,
    applied,
    /** What each write asked for, in the order they were sent. */
    asked: () => sent.map((w) => `${w.saved ? "save" : "unsave"} ${w.sermonId}`),
    onServer: (userId = A) => [...setOf(server, userId)],
    onScreen: (userId = A) => [...setOf(screen, userId)],
  };
}

/** Lets the queue react to a write that just landed or failed. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** How a tap's promise ended, without an unhandled rejection meanwhile. */
function outcome(promise: Promise<void>) {
  const result = { state: "pending" as "pending" | "resolved" | "rejected" };
  promise.then(
    () => (result.state = "resolved"),
    () => (result.state = "rejected"),
  );
  return result;
}

test.describe("saves and unsaves of one sermon", () => {
  test("an unsave made while a save is on its way is sent after it lands", async () => {
    // The reviewer's probe: save on the sermon page, unsave on Home before
    // the save has reached the service.
    const s = standIn();
    const save = outcome(s.writes.set(A, X, true, false));
    expect(s.onScreen()).toEqual([X]);
    const unsave = outcome(s.writes.set(A, X, false, true));
    expect(s.onScreen()).toEqual([]);
    // Only the save is on its way; the unsave can't overtake it.
    expect(s.asked()).toEqual([`save ${X}`]);

    s.sent[0].land();
    await settle();
    expect(save.state).toBe("resolved");
    expect(unsave.state).toBe("pending");
    expect(s.asked()).toEqual([`save ${X}`, `unsave ${X}`]);

    s.sent[1].land();
    await settle();
    expect(unsave.state).toBe("resolved");
    expect(s.applied).toEqual([`save ${X}`, `unsave ${X}`]);
    expect(s.onServer()).toEqual([]);
    expect(s.onScreen()).toEqual([]);
  });

  test("a burst sends only what it needs, latest last", async () => {
    // Save, unsave, save: the save on its way already has the latest.
    const s = standIn();
    const taps = [
      outcome(s.writes.set(A, X, true, false)),
      outcome(s.writes.set(A, X, false, true)),
      outcome(s.writes.set(A, X, true, false)),
    ];
    s.sent[0].land();
    await settle();
    expect(s.asked()).toEqual([`save ${X}`]);
    expect(taps.map((t) => t.state)).toEqual(["resolved", "resolved", "resolved"]);
    expect(s.onServer()).toEqual([X]);
    expect(s.onScreen()).toEqual([X]);

    // Save, unsave, save, unsave: one more write, the latest.
    const t = standIn();
    t.writes.set(A, X, true, false);
    t.writes.set(A, X, false, true);
    t.writes.set(A, X, true, false);
    const last = outcome(t.writes.set(A, X, false, true));
    t.sent[0].land();
    await settle();
    expect(t.asked()).toEqual([`save ${X}`, `unsave ${X}`]);
    t.sent[1].land();
    await settle();
    expect(last.state).toBe("resolved");
    expect(t.onServer()).toEqual([]);
    expect(t.onScreen()).toEqual([]);
  });

  test("a save the service refuses is taken back off the screen", async () => {
    const s = standIn();
    const save = outcome(s.writes.set(A, X, true, false));
    expect(s.onScreen()).toEqual([X]);
    s.sent[0].fail();
    await settle();
    expect(save.state).toBe("rejected");
    expect(s.onScreen()).toEqual([]);
    // Nothing is laid over the next read: the list is the service's.
    expect(await s.writes.read(A, async () => [Y])).toEqual([Y]);
  });

  test("a failed write before a later tap leaves the later tap in charge", async () => {
    // The save fails while an unsave waits: the unsave is still sent (the
    // failed save may have landed), and the screen keeps it.
    const s = standIn();
    const save = outcome(s.writes.set(A, X, true, false));
    const unsave = outcome(s.writes.set(A, X, false, true));
    s.sent[0].fail();
    await settle();
    expect(save.state).toBe("rejected");
    expect(s.onScreen()).toEqual([]);
    expect(s.asked()).toEqual([`save ${X}`, `unsave ${X}`]);
    s.sent[1].land();
    await settle();
    expect(unsave.state).toBe("resolved");
    expect(s.onServer()).toEqual([]);
    expect(s.onScreen()).toEqual([]);
  });

  test("when the latest write fails, the screen goes back to the last one that landed", async () => {
    const s = standIn();
    s.writes.set(A, X, true, false);
    const unsave = outcome(s.writes.set(A, X, false, true));
    s.sent[0].land();
    await settle();
    s.sent[1].fail();
    await settle();
    expect(unsave.state).toBe("rejected");
    // The save landed and the unsave didn't: saved, on both.
    expect(s.onServer()).toEqual([X]);
    expect(s.onScreen()).toEqual([X]);
  });

  test("a write still waiting when its account signs out isn't sent", async () => {
    // A saves (slow), then unsaves on another screen; A signs out and B signs
    // in before the save lands. The waiting unsave would go out under B.
    const s = standIn();
    s.writes.signedIn(A);
    outcome(s.writes.set(A, X, true, false));
    const unsave = outcome(s.writes.set(A, X, false, true));
    s.writes.signedIn(B);

    s.sent[0].land();
    await settle();
    expect(s.asked()).toEqual([`save ${X}`]);
    expect(unsave.state).toBe("rejected");
  });

  test("other sermons and other accounts don't wait", async () => {
    const s = standIn();
    s.writes.set(A, X, true, false);
    s.writes.set(A, Y, true, false);
    s.writes.set(B, X, true, false);
    expect(s.sent.map((w) => `${w.userId} ${w.sermonId}`)).toEqual([
      `${A} ${X}`,
      `${A} ${Y}`,
      `${B} ${X}`,
    ]);
  });
});

test.describe("saved list reads", () => {
  test("a read that began before a save landed keeps it; a later read is the service's", async () => {
    const s = standIn();
    s.writes.set(A, X, true, false);
    // Asked for before the save lands; answers without it.
    let answer!: (ids: string[]) => void;
    const early = s.writes.read(A, () => new Promise((resolve) => (answer = resolve)));
    s.sent[0].land();
    await settle();
    answer([Y]);
    expect(await early).toEqual([X, Y]);
    // Asked for after it landed: the list has (or, when changed elsewhere
    // since, doesn't have) it, and that's what shows.
    expect(await s.writes.read(A, async () => [Y])).toEqual([Y]);
  });

  test("a read while an unsave waits behind a save shows it unsaved", async () => {
    const s = standIn();
    s.writes.set(A, X, true, false);
    s.writes.set(A, X, false, true);
    expect(await s.writes.read(A, async () => [X, Y])).toEqual([Y]);
  });

  test("another account's taps never show in a read", async () => {
    const s = standIn();
    s.writes.set(A, X, true, false);
    expect(await s.writes.read(B, async () => [Y])).toEqual([Y]);
  });
});

// Through the app, with the stand-in account service's slowsave@example.com,
// whose saves take 2 s to land while its unsaves land at once: before the
// queue, Home's quick unsave landed first and the slow save after it, so the
// sermon came back saved after a reload.
test.describe("from two screens", () => {
  const SLOW = {
    id: "local:slowsave@example.com",
    email: "slowsave@example.com",
    provider: "email",
  };
  test.use({ viewer: "guest" });

  test("unsaving on Home just after saving on the sermon page keeps it unsaved", async ({
    page,
  }) => {
    await seedStorage(
      page,
      {
        "aao.local.session.v1": SLOW,
        [`aao.local.data.v1.${SLOW.id}`]: {
          profile: { displayName: null, interests: [], onboardedAt: "2026-10-01T00:00:00.000Z" },
          saved: [],
        },
      },
      "slowsave",
    );
    const stored = () =>
      page.evaluate(
        (key) => (JSON.parse(localStorage.getItem(key) ?? "null") as { saved: string[] }).saved,
        `aao.local.data.v1.${SLOW.id}`,
      );
    await page.goto("/");
    const heroSave = page.getByTestId("hero-save");
    await expect(heroSave).toHaveAccessibleName(/^Save /);
    // The account's saved list has arrived (it answers 250 ms after it's asked).
    await page.waitForTimeout(800);

    // The newest sermon, saved on its page.
    await shown(page.getByTestId("hero-pager").getByRole("button")).click();
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.pray}$`));
    const save = page.getByTestId("save-sermon");
    await save.click();
    const savedAt = Date.now();
    await expect(save).toContainText("Saved");

    // Back on Home before that save has landed, and unsaved there.
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(heroSave).toHaveAccessibleName(/^Remove .* from saved$/);
    await heroSave.click();
    await expect(heroSave).toHaveAccessibleName(/^Save /);
    expect(Date.now() - savedAt).toBeLessThan(2000);

    // Both writes have landed by now, the unsave last.
    await expect(page.getByTestId("toast")).toContainText("Removed from saved", { timeout: 5000 });
    await page.waitForTimeout(Math.max(0, savedAt + 2500 - Date.now()));
    expect(await stored()).toEqual([]);
    await expect(heroSave).toHaveAccessibleName(/^Save /);

    // And it stays unsaved when the list is read again.
    await page.reload();
    await expect(page.getByTestId("hero-save")).toHaveAccessibleName(/^Save /);
    await page.goto("/saved");
    await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
  });
});
