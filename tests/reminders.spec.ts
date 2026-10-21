import type { Page } from "@playwright/test";
import type { ReminderStandIn } from "../src/reminders/device.web";
import {
  HABIT,
  LENGTH,
  MEMBER,
  SERMON,
  WAIT,
  expect,
  fakeYouTube,
  seedPathProgress,
  seedStorage,
  sendToBackground,
  shown,
  test,
} from "./fixtures";

// The daily path reminder (src/reminders): opt-in, offered on a guided
// path's day, set in Account › Daily reminder. The web itself has none, and
// says so. The rest of these tests stand in for a phone
// (window.__aaoReminders, read by src/reminders/device.web.ts in the
// on-device test mode): what it allows, what its question answers, and
// what's waiting on it. Which reminders, when, is tested in Node
// (tests/reminders-plan.spec.ts).

const REMINDERS_KEY = "aao.reminders.v1";

/**
 * A phone that allows notifications (`permission`), or asks and gets
 * `answer`. Like a phone, it keeps what's waiting across reloads.
 */
async function standInPhone(
  page: Page,
  { permission = "undetermined", answer = "granted" }: Partial<Pick<ReminderStandIn, "permission" | "answer">> = {},
) {
  await page.addInitScript(
    ({ permission, answer }) => {
      const kept = sessionStorage.getItem("__aao_phone");
      const state: ReminderStandIn = kept
        ? { ...JSON.parse(kept), open: null }
        : { permission, answer, asked: 0, scheduled: [], cleared: 0, settings: 0, open: null };
      // Saved as it changes, so the next page load finds it.
      (window as unknown as { __aaoReminders: ReminderStandIn }).__aaoReminders = new Proxy(state, {
        set(target, key, value) {
          (target as Record<string | symbol, unknown>)[key] = value;
          const { open, ...rest } = target;
          sessionStorage.setItem("__aao_phone", JSON.stringify(rest));
          return true;
        },
      });
    },
    { permission, answer },
  );
}

/** What the stand-in phone has: how often it asked, what's waiting, Settings opened. */
function phone(page: Page) {
  return page.evaluate(() => {
    const { open, ...rest } = (window as unknown as { __aaoReminders: ReminderStandIn }).__aaoReminders;
    return { ...rest, tappable: !!open };
  });
}

/** The first reminder waiting on the phone's: its title, and when it comes on the phone's clock. */
async function nextReminder(page: Page) {
  return page.evaluate(() => {
    const first = (window as unknown as { __aaoReminders: ReminderStandIn }).__aaoReminders.scheduled[0];
    if (!first) return null;
    const at = new Date(first.at);
    const today = new Date();
    const days = Math.round(
      (new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() -
        new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
        86_400_000,
    );
    return { title: first.title, days, hour: at.getHours(), minute: at.getMinutes() };
  });
}

/** Reminders already turned on for the member, at `hour`:00. */
async function remindersOn(page: Page, hour = 20) {
  await seedStorage(
    page,
    {
      [REMINDERS_KEY]: {
        owner: MEMBER.id,
        enabled: true,
        time: { hour, minute: 0 },
        asked: true,
        armedAt: "2026-10-01T09:00:00.000Z",
      },
    },
    "reminders",
  );
}

/** Back from another app, or from Settings. */
async function bringBack(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const offer = (page: Page) => shown(page.getByTestId("reminder-offer"));

async function startWaitingOnGod(page: Page) {
  await fakeYouTube(page, { duration: LENGTH[SERMON.pray] });
  await page.goto(`/path/${WAIT}`);
  await page.getByTestId("path-cta").click();
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.pray}\\?path=${WAIT}&day=1$`));
  await expect(page.getByTestId("part-of-path")).toBeVisible();
}

async function openReminderSettings(page: Page) {
  await page.goto("/account");
  await shown(page.getByTestId("reminder-row")).click();
  await expect(page.getByRole("heading", { level: 1, name: "Daily reminder" })).toBeVisible();
}

test.describe("on the web", () => {
  test("a path's day offers nothing, and Account says reminders are in the phone apps", async ({ page }) => {
    await startWaitingOnGod(page);
    await expect(offer(page)).toHaveCount(0);

    await page.goto("/account");
    await expect(shown(page.getByTestId("reminder-row"))).toHaveAccessibleName(
      "Daily reminder, In the iPhone and Android apps",
    );
    await shown(page.getByTestId("reminder-row")).click();
    await expect(page.getByRole("heading", { level: 1, name: "Daily reminder" })).toBeVisible();
    await expect(page.getByTestId("reminders-web")).toContainText(
      "Daily reminders come through the AAO app on iPhone and Android. Turn them on there, in Account.",
    );
    await expect(page.getByRole("switch")).toHaveCount(0);
  });
});

test.describe("on a phone, first launch", () => {
  test.use({ viewer: "new" });

  test("the welcome asks nothing about notifications", async ({ page }) => {
    await standInPhone(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await page.waitForTimeout(500);
    const now = await phone(page);
    expect(now.asked).toBe(0);
    expect(now.scheduled).toEqual([]);
    await expect(offer(page)).toHaveCount(0);
  });
});

test.describe("on a phone", () => {
  test("starting a guided path offers a daily reminder at a time they choose", async ({ page }) => {
    await standInPhone(page);
    await startWaitingOnGod(page);
    await expect(offer(page)).toContainText("Remind me each day?");
    await expect(offer(page)).toContainText("One gentle note a day when your next day is ready, and nothing else.");
    // Offering asks the phone nothing yet.
    expect((await phone(page)).asked).toBe(0);

    // Another time: 7:30am.
    await offer(page).getByTestId("reminder-offer-time").click();
    const sheet = page.getByRole("dialog", { name: "Reminder time" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("radio", { name: "7am", exact: true }).click();
    await sheet.getByRole("radio", { name: ":30", exact: true }).click();
    await expect(sheet.getByTestId("reminder-time-chosen")).toHaveText("7:30am");
    await sheet.getByRole("button", { name: "Remind me at 7:30am" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(offer(page).getByTestId("reminder-offer-time")).toHaveAccessibleName("7:30am");

    await offer(page).getByRole("button", { name: "Remind me", exact: true }).click();
    await expect(page.getByTestId("toast")).toHaveText("Daily reminder on · 7:30am");
    await expect(offer(page)).toHaveCount(0);
    // The phone asked once, and the first reminder is tomorrow: the path
    // started today.
    await expect.poll(async () => (await phone(page)).scheduled.length).toBe(4);
    expect((await phone(page)).asked).toBe(1);
    expect(await nextReminder(page)).toEqual({
      title: "Day 1 of Learning to wait on God is ready",
      days: 1,
      hour: 7,
      minute: 30,
    });

    // Not offered again, and Account has it.
    await page.reload();
    await expect(page.getByTestId("part-of-path")).toBeVisible();
    await expect(offer(page)).toHaveCount(0);
    await page.goto("/account");
    await expect(shown(page.getByTestId("reminder-row"))).toHaveAccessibleName("Daily reminder, On · 7:30am");
    await shown(page.getByTestId("reminder-row")).click();
    await expect(page.getByRole("switch", { name: "Remind me each day" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Next: Day 1 of Learning to wait on God, tomorrow at 7:30am.")).toBeVisible();
  });

  test("a teaching series offers nothing", async ({ page }) => {
    await standInPhone(page);
    await seedPathProgress(page, { "knowing-the-holy-spirit": [] });
    await fakeYouTube(page);
    await page.goto("/path/knowing-the-holy-spirit");
    await page.getByTestId("path-cta").click();
    await expect(page.getByTestId("part-of-path")).toContainText("Part of your series");
    await expect(offer(page)).toHaveCount(0);
  });

  test("Not now: the offer goes for good, and Account can still turn them on", async ({ page }) => {
    await standInPhone(page, { permission: "granted" });
    await startWaitingOnGod(page);
    await offer(page).getByRole("button", { name: "Not now" }).click();
    await expect(offer(page)).toHaveCount(0);
    await expect(page.getByTestId("toast")).toHaveText("You can turn on reminders in Account");
    expect((await phone(page)).scheduled).toEqual([]);

    // Another day of the path doesn't ask again.
    await page.goto(`/sermon/${SERMON.finale}?path=${WAIT}&day=2`);
    await expect(page.getByTestId("part-of-path")).toBeVisible();
    await expect(offer(page)).toHaveCount(0);

    await openReminderSettings(page);
    const toggle = page.getByRole("switch", { name: "Remind me each day" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("reminder-time")).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("reminder-time")).toBeVisible();
    await expect.poll(async () => (await phone(page)).scheduled.length).toBe(4);
    // Already allowed: nothing to ask.
    expect((await phone(page)).asked).toBe(0);
    await expect(page.getByText(/^Next: Day 1 of Learning to wait on God, tomorrow at /)).toBeVisible();

    // A new time, from Account.
    await page.getByTestId("reminder-time").click();
    const sheet = page.getByRole("dialog", { name: "Reminder time" });
    await sheet.getByRole("radio", { name: "9pm", exact: true }).click();
    await sheet.getByRole("radio", { name: ":15", exact: true }).click();
    await sheet.getByRole("button", { name: "Remind me at 9:15pm" }).click();
    await expect(page.getByTestId("reminder-time")).toHaveAccessibleName("Time, 9:15pm");
    await expect.poll(async () => (await nextReminder(page))?.hour).toBe(21);
    expect((await nextReminder(page))?.minute).toBe(15);

    // Off: nothing waits.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect.poll(async () => (await phone(page)).scheduled).toEqual([]);
  });

  test("when the phone says no, the way to Settings, and reminders start once allowed", async ({ page }) => {
    await standInPhone(page, { answer: "denied" });
    await startWaitingOnGod(page);
    await offer(page).getByRole("button", { name: "Remind me", exact: true }).click();
    await expect(offer(page)).toContainText("Notifications are off for AAO");
    await expect(offer(page)).toContainText(
      "Your reminder is set. Allow notifications for AAO in Settings and it will start.",
    );
    await offer(page).getByRole("button", { name: "Open Settings" }).click();
    expect((await phone(page)).settings).toBe(1);
    expect((await phone(page)).scheduled).toEqual([]);

    await openReminderSettings(page);
    await expect(page.getByRole("switch", { name: "Remind me each day" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("reminders-denied")).toContainText("Notifications are off for AAO");

    // Allowed in Settings, then back to the app.
    await sendToBackground(page);
    await page.evaluate(() => {
      (window as unknown as { __aaoReminders: ReminderStandIn }).__aaoReminders.permission = "granted";
    });
    await bringBack(page);
    await expect(page.getByTestId("reminders-denied")).toHaveCount(0);
    await expect.poll(async () => (await phone(page)).scheduled.length).toBe(4);
    expect((await nextReminder(page))?.title).toBe("Day 1 of Learning to wait on God is ready");
  });

  test("set, but not yet allowed where the phone can still ask: Account asks", async ({ page }) => {
    // As Android after a first "no": it may ask once more.
    await standInPhone(page, { permission: "undetermined", answer: "granted" });
    await remindersOn(page);
    await seedPathProgress(page, { [WAIT]: [1, 2] });
    await page.goto("/account/reminders");
    const card = page.getByTestId("reminders-denied");
    await expect(card).toContainText("Your reminder is set. Allow notifications for AAO and it will start.");
    expect((await phone(page)).scheduled).toEqual([]);
    await card.getByRole("button", { name: "Allow notifications" }).click();
    await expect(card).toHaveCount(0);
    expect((await phone(page)).asked).toBe(1);
    await expect.poll(async () => (await phone(page)).scheduled.length).toBe(4);
  });

  test("the reminder follows the path: the next day once one is done, none once it's finished", async ({
    page,
  }) => {
    await standInPhone(page, { permission: "granted" });
    await remindersOn(page, 20);
    await seedPathProgress(page, { [WAIT]: [1, 2] });
    await page.goto(`/path/${WAIT}`);
    // Day 3 was due before this phone was watching: tonight, if 8pm is still to come.
    await expect.poll(async () => (await nextReminder(page))?.title).toBe(
      "Day 3 of Learning to wait on God is ready",
    );
    expect((await phone(page)).scheduled[0].body).toBe("Strength renewed for the faint");

    await page.getByRole("button", { name: "Mark Day 3 done" }).click();
    await expect.poll(async () => (await nextReminder(page))?.title).toBe(
      "Day 4 of Learning to wait on God is ready",
    );
    // Day 3 done today, so Day 4's comes tomorrow; Day 3's are taken away.
    expect((await nextReminder(page))?.days).toBe(1);
    expect((await phone(page)).cleared).toBeGreaterThan(0);

    // Finished: none.
    await page.goto(`/sermon/${SERMON.pray}?path=${WAIT}&day=5`);
    await page.evaluate(
      ({ key }) => {
        const progress = JSON.parse(localStorage.getItem(key)!);
        progress.done["learning-to-wait-on-god"] = [1, 2, 3, 4];
        localStorage.setItem(key, JSON.stringify(progress));
      },
      { key: `aao.learning.progress.v1.${MEMBER.id}` },
    );
    await page.reload();
    await expect.poll(async () => (await nextReminder(page))?.title).toBe(
      "Day 5 of Learning to wait on God is ready",
    );
    await page.getByTestId("part-of-path-mark-done").click();
    await expect.poll(async () => (await phone(page)).scheduled).toEqual([]);
    await openReminderSettings(page);
    await expect(
      page.getByText("You’re not on a guided path just now. Start one and we’ll remind you each day."),
    ).toBeVisible();
  });

  test("the guided path, even with a teaching series started since", async ({ page }) => {
    await standInPhone(page, { permission: "granted" });
    await remindersOn(page);
    await seedStorage(
      page,
      {
        [`aao.learning.progress.v1.${MEMBER.id}`]: {
          enrollments: {
            [HABIT]: { startedAt: "2026-10-10T08:00:00.000Z", finishedAt: null },
            "knowing-the-holy-spirit": { startedAt: "2026-10-12T08:00:00.000Z", finishedAt: null },
          },
          done: { [HABIT]: [1], "knowing-the-holy-spirit": [] },
          pending: [],
        },
      },
      "both",
    );
    await page.goto("/");
    await expect.poll(async () => (await nextReminder(page))?.title).toBe(
      "Day 2 of Breaking free from habitual sin is ready",
    );
  });

  test("signing out stops them, and the next viewer starts with them off", async ({ page }) => {
    await standInPhone(page, { permission: "granted" });
    await remindersOn(page);
    await seedPathProgress(page, { [WAIT]: [1, 2] });
    await page.goto("/account");
    await expect.poll(async () => (await phone(page)).scheduled.length).toBe(4);
    await expect(shown(page.getByTestId("reminder-row"))).toHaveAccessibleName("Daily reminder, On · 8pm");

    await shown(page.getByTestId("sign-out")).click();
    await expect(page.getByTestId("toast")).toHaveText("Signed out");
    await expect.poll(async () => (await phone(page)).scheduled).toEqual([]);
    expect((await phone(page)).cleared).toBeGreaterThan(0);
    await expect(shown(page.getByTestId("reminder-row"))).toHaveAccessibleName("Daily reminder, Off");
    await expect
      .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), REMINDERS_KEY))
      .toMatchObject({ owner: "guest", enabled: false, asked: false });
  });

  test("deleting the account stops them too", async ({ page }) => {
    await standInPhone(page, { permission: "granted" });
    await remindersOn(page);
    await seedPathProgress(page, { [WAIT]: [1, 2] });
    await page.goto("/account/delete");
    await expect.poll(async () => (await phone(page)).scheduled.length).toBe(4);
    await page.getByTestId("confirm-delete").click();
    await expect(page.getByTestId("toast")).toContainText("deleted");
    await expect.poll(async () => (await phone(page)).scheduled).toEqual([]);
    await expect
      .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), REMINDERS_KEY))
      .toMatchObject({ owner: "guest", enabled: false });
  });

  test("tapping a reminder opens its day", async ({ page }) => {
    await standInPhone(page, { permission: "granted" });
    await remindersOn(page);
    await seedPathProgress(page, { [WAIT]: [1, 2] });
    await page.goto("/");
    await expect.poll(async () => (await phone(page)).tappable).toBe(true);
    await page.evaluate(
      ({ pathId, youtubeId }) =>
        (window as unknown as { __aaoReminders: ReminderStandIn }).__aaoReminders.open?.({
          kind: "path-reminder",
          pathId,
          day: 3,
          youtubeId,
        }),
      { pathId: WAIT, youtubeId: SERMON.dayOne },
    );
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayOne}\\?path=${WAIT}&day=3$`));
    await expect(page.getByTestId("part-of-path")).toHaveAccessibleName(
      "Part of your path. Day 3 of 5. Learning to wait on God. 2 of 5 done.",
    );
  });
});
