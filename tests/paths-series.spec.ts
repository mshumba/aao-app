import { LENGTH, SERMON, expect, fakeYouTube, shown, storedPathProgress, tab, test, ytLog } from "./fixtures";

// Teaching series (paths of kind "series"), from the local fixtures
// (src/learning/fixtures.ts): "Knowing the Holy Spirit", four teachings
// (Pray Without Ceasing first, 3 hr 35 min), and "Seeking the face of God",
// a single teaching (Apostolic Shift: Grand Finale).

const SPIRIT = "knowing-the-holy-spirit";
const FACE = "seeking-the-face-of-god";

test("the Paths tab lists teaching series in a section of their own", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Paths").click();
  // The masthead and "More paths" are guided paths only.
  await expect(page.getByTestId("paths-featured")).toHaveAccessibleName(/^Start here\. 7 messages\. Breaking free/);
  await expect(shown(page.getByText("1 path", { exact: true }))).toBeVisible();
  const heading = shown(page.getByRole("heading", { name: "Teaching series" }));
  await expect(heading).toBeVisible();
  await expect(shown(page.getByText("2 series", { exact: true }))).toBeVisible();
  const spirit = page.getByTestId(`path-card-${SPIRIT}`);
  await expect(spirit).toContainText("4 teachings");
  await expect(spirit).toHaveAccessibleName(/^Knowing the Holy Spirit\. 4 teachings\. The Apostle/);
  const face = page.getByTestId(`path-card-${FACE}`);
  await expect(face).toContainText("1 teaching");
  // In order: the guided paths' cards, then the series.
  const wait = await page.getByTestId("path-card-learning-to-wait-on-god").boundingBox();
  const section = await heading.boundingBox();
  const first = await spirit.boundingBox();
  expect(wait!.y).toBeLessThan(section!.y);
  expect(section!.y).toBeLessThan(first!.y);
  await spirit.click();
  await expect(page).toHaveURL(new RegExp(`/path/${SPIRIT}$`));
});

test("a teaching series' page counts teachings, and plays each one whole", async ({ page }) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.pray] });
  await page.goto(`/path/${SPIRIT}`);
  await expect(page.getByRole("heading", { level: 1, name: "Knowing the Holy Spirit" })).toBeVisible();
  const cover = page.getByTestId("path-cover");
  await expect(cover).toContainText("Teaching series · 4 teachings");
  await expect(shown(page.getByText("Why this series", { exact: true }))).toBeVisible();
  await expect(shown(page.getByTestId("path-day-1")).first()).toContainText("Teaching 1 · Start here");
  await expect(page.getByTestId("path-cta")).toHaveAccessibleName("Start Teaching 1, 3 hours 35 minutes");
  await page.getByTestId("path-cta").click();
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.pray}\\?path=${SPIRIT}&day=1$`));
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([0]);
  expect(Object.keys((await storedPathProgress(page))!.enrollments)).toEqual([SPIRIT]);
  await expect(page.getByTestId("part-of-path")).toHaveAccessibleName(
    "Part of your series. Teaching 1 of 4. Knowing the Holy Spirit. 0 of 4 done.",
  );
  await expect(page.getByRole("button", { name: "Mark Teaching 1 done", exact: true })).toBeVisible();
});

test("a series of one teaching opens that teaching", async ({ page }) => {
  await page.goto("/paths");
  await page.getByTestId(`path-card-${FACE}`).click();
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.finale}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Apostolic Shift: Grand Finale" })).toBeVisible();
  // A link to its page opens the teaching too.
  await page.goto(`/path/${FACE}`);
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.finale}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Apostolic Shift: Grand Finale" })).toBeVisible();
});

test("Home offers guided paths to start, not teaching series", async ({ page }) => {
  await page.goto("/");
  const rail = page.getByTestId("start-a-path");
  await expect(rail.getByTestId("path-tile")).toHaveCount(1);
  await expect(rail.getByText(/teaching/i)).toHaveCount(0);
});
