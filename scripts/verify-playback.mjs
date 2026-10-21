import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Optional live integration probe: contacts the actual public YouTube embed.
// Checks that Watch starts the sermon, the provider's player is never covered,
// playback continues in the docked player while browsing, and closing stops it.
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const unobscured = (box) =>
  page.evaluate(({ x, y, width, height }) =>
    [[0.5, 0.5], [0.08, 0.92], [0.92, 0.92], [0.92, 0.08]].every(([fx, fy]) =>
      document.elementFromPoint(x + width * fx, y + height * fy)?.tagName === 'IFRAME'), box);
try {
  await page.goto('http://localhost:8081/sermon/nUW8NT2Pe88');
  await page.getByRole('button', { name: 'Watch sermon', exact: true }).click();
  const iframe = page.locator('iframe');
  await expect(iframe).toBeVisible();
  // The viewer's tap starts the sermon; no second press on the provider.
  await expect(page.getByTestId('playback-status')).toHaveText('Playing', { timeout: 30000 });
  await expect(page.getByTestId('player-cover')).toHaveCount(0);
  const full = await iframe.boundingBox();
  if (!full || full.width < 200 || full.height < 200) throw new Error('Player is below the required 200×200 minimum.');
  if (!(await unobscured(full))) throw new Error('Something overlaps the YouTube player.');
  // Read elapsed time from YouTube's own video element.
  const frame = page.frames().find((f) => f.url().includes('youtube.com/embed'));
  if (!frame) throw new Error('YouTube frame not found.');
  const currentTime = () => frame.evaluate(() => document.querySelector('video')?.currentTime ?? 0);
  await expect.poll(currentTime, { timeout: 20000 }).toBeGreaterThan(1);
  const firstSeconds = Math.floor(await currentTime());
  await page.screenshot({ path: 'artifacts/player-playing-393.png' });
  const embedUrl = await iframe.getAttribute('src');

  // Leave the sermon: the same player docks and keeps playing.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByTestId('player-dock')).toBeVisible();
  await page.getByRole('tab', { name: 'Topics' }).click();
  const docked = await iframe.boundingBox();
  if (!docked || docked.height < 200) throw new Error('Docked player is below 200px tall.');
  if (!(await unobscured(docked))) throw new Error('Something overlaps the docked player.');
  const sameFrame = page.frames().find((f) => f.url().includes('youtube.com/embed')) === frame;
  const dockStart = await currentTime();
  await expect.poll(currentTime, { timeout: 20000 }).toBeGreaterThan(dockStart + 1.5);
  const secondSeconds = Math.floor(await currentTime());
  await page.screenshot({ path: 'artifacts/player-docked-393.png' });

  // Closing the dock stops playback and removes the player.
  await page.getByRole('button', { name: 'Close player', exact: true }).click();
  await expect(iframe).toHaveCount(0);
  const result = { checkedAt: new Date().toISOString(), platform: 'Expo web in desktop Chrome, mobile viewport', videoId: 'nUW8NT2Pe88', embedUrl, fullPlayer: full, dockedPlayer: docked, controlsUnobscured: true, providerState: 'PLAYING', startedFromWatchTap: true, firstSeconds, secondSeconds, keptPlayingWhileDocked: true, sameProviderFrameAfterDocking: sameFrame, removedOnClose: true, nativePhonePlayback: 'not tested' };
  await writeFile('artifacts/playback-evidence.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
