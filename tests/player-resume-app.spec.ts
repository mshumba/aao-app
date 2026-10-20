import type { Page } from "@playwright/test";
import {
  LENGTH,
  MEMBER,
  SERMON,
  expect,
  fakeYouTube,
  playhead,
  pressControl,
  seedStorage,
  seedWatchProgress,
  sendToBackground,
  showControls,
  shown,
  test,
  ytLog,
} from "./fixtures";

// A saved place that arrives after Watch, in the app: the on-device account
// service sends slow@example.com's progress 6 s after it's asked for (when
// the app starts), so the sermon starts from the beginning before it does.
// The fake player's clock runs at 5 seconds per real second.
const SLOW = { id: "local:slow@example.com", email: "slow@example.com", provider: "email" };
const SERMON_ID = "H9sRbSUt0YE";

test.describe("a saved place that arrives after Watch", () => {
  test.use({ viewer: "guest" });

  test.beforeEach(async ({ page }) => {
    await seedStorage(page, { "aao.local.session.v1": SLOW }, "slow_session");
    await seedWatchProgress(
      page,
      [
        {
          sermonId: SERMON_ID,
          positionSeconds: 250,
          durationSeconds: 600,
          finished: false,
          updatedAt: "2026-10-16T10:00:00.000Z",
        },
      ],
      SLOW.id,
    );
    await fakeYouTube(page);
  });

  /** Watch before the account's progress has arrived, and pause just after it starts. */
  async function watchThenPause(page: Page, before: () => Promise<void> = async () => {}) {
    await page.goto(`/sermon/${SERMON_ID}`);
    await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    // Started from the beginning: the saved place hadn't arrived.
    expect((await ytLog(page)).starts).toEqual([0]);
    await before();
    await pressControl(page, page.getByTestId("now-playing-toggle"));
    await expect(page.getByTestId("playback-status")).toHaveText("Paused");
  }

  test("a saved place that arrives after Watch still resumes the sermon there", async ({ page }) => {
    await watchThenPause(page);
    await expect
      .poll(async () => (await ytLog(page)).commands, { timeout: 10_000 })
      .toContain("seek:250");
    await expect(page.getByTestId("resume-note")).toHaveText(/Resuming at 4:10/);
  });

  test("seeking back to the start before the saved place arrives keeps the viewer there", async ({
    page,
  }) => {
    const slider = page.getByRole("slider", { name: "Playback position", includeHidden: true });
    await watchThenPause(page, async () => {
      await showControls(page);
      await slider.focus();
      await page.keyboard.press("Home");
      await expect.poll(async () => (await ytLog(page)).commands).toContain("seek:0");
    });
    // The account's answer lands meanwhile.
    await page.waitForTimeout(6500);
    expect((await ytLog(page)).commands).not.toContain("seek:250");
    await expect(page.getByTestId("resume-note")).toHaveCount(0);
    expect(Number(await slider.getAttribute("aria-valuenow"))).toBeLessThan(15);
  });
});

// YouTube can load and never start: its own gate in the player ("Sign in to
// confirm you're not a bot", on a shared or VPN address), or a start the
// browser refused. The player then reports 0:00, which isn't the viewer's
// place, so docking and leaving the app (both of which save) must keep the
// saved one.
test.describe("a sermon YouTube loads but never starts", () => {
  test.use({ viewer: "member" });

  const SAVED_AT = 5871; // 1:37:51

  async function savedPlace(page: Page) {
    return page.evaluate(
      ({ key, id }) =>
        (JSON.parse(localStorage.getItem(key) ?? "{}").progress ?? []).find(
          (item: { sermonId: string }) => item.sermonId === id,
        )?.positionSeconds as number | undefined,
      { key: `aao.local.data.v1.${MEMBER.id}`, id: SERMON.pray },
    );
  }

  test("keeps the saved place when docked and when the app goes to the background", async ({
    page,
  }) => {
    await seedWatchProgress(page, [
      {
        sermonId: SERMON.pray,
        positionSeconds: SAVED_AT,
        durationSeconds: LENGTH[SERMON.pray],
        finished: false,
        updatedAt: "2026-10-19T10:00:00.000Z",
      },
    ]);
    await fakeYouTube(page, { duration: LENGTH[SERMON.pray], gate: true });
    await page.goto("/");
    const hero = shown(page.getByTestId("hero-watch"));
    const resume = /^Resume sermon: .+, from 1 hour 37 minutes 51 seconds$/;
    await expect(hero).toHaveAccessibleName(resume);
    await hero.click();
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.pray}$`));
    // Ready, then unstarted at 0:00, and the start goes nowhere.
    await expect(page.getByTestId("playback-status")).toHaveText("Tap Play to start");
    const yt = await ytLog(page);
    expect(yt.starts).toEqual([SAVED_AT]);
    expect(yt.commands).toContain("play-gated");
    // The scrubber keeps the viewer's place, not the player's 0:00.
    expect(await playhead(page)).toBe(SAVED_AT);

    // Docked, then the app goes to the background (which pauses: the
    // player reports paused at 0:00 too).
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByTestId("player-dock")).toBeVisible();
    await sendToBackground(page);
    await expect.poll(async () => (await ytLog(page)).commands).toContain("pause");
    // Saves never wait on anything, so one would have landed by now.
    await page.waitForTimeout(1000);
    expect(await savedPlace(page)).toBe(SAVED_AT);
    await expect(hero).toHaveAccessibleName(resume);

    // Opened again, Home still offers to resume there.
    await page.reload();
    await expect(shown(page.getByTestId("hero-watch"))).toHaveAccessibleName(resume);
    expect(await savedPlace(page)).toBe(SAVED_AT);
  });
});
