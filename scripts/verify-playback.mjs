import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Optional live integration probe: contacts the actual public YouTube embed.
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
try {
  await page.goto('http://localhost:8081/sermon/nUW8NT2Pe88');
  await page.getByRole('button', { name: 'Play sermon', exact: true }).click();
  const iframe = page.locator('iframe');
  await expect(iframe).toBeVisible();
  const geometry = await iframe.boundingBox();
  if (!geometry || geometry.width < 200 || geometry.height < 200) throw new Error('Player is below the required 200×200 minimum.');
  const provider = page.frameLocator('iframe');
  await provider.getByRole('button', { name: /Play/ }).first().click();
  await expect(page.getByTestId('playback-status')).toHaveText('Playing', { timeout: 30000 });
  const progress = page.getByTestId('playback-progress');
  await expect.poll(async () => Number.parseInt(await progress.innerText())).toBeGreaterThan(1);
  const firstSeconds = Number.parseInt(await progress.innerText());
  await expect.poll(async () => Number.parseInt(await progress.innerText())).toBeGreaterThan(firstSeconds + 1);
  const secondSeconds = Number.parseInt(await progress.innerText());
  await page.screenshot({ path: 'artifacts/player-playing-393.png' });
  const embedUrl = await iframe.getAttribute('src');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(iframe).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play sermon', exact: true })).toBeVisible();
  await expect(iframe).toHaveCount(0);
  const result = { checkedAt: new Date().toISOString(), platform: 'Expo web in desktop Chrome, mobile viewport', videoId: 'nUW8NT2Pe88', embedUrl, playerViewport: geometry, providerState: 'PLAYING', firstSeconds, secondSeconds, unmountedOnMenu: true, noAutoplayOnReturn: true, nativePhonePlayback: 'not tested' };
  await writeFile('artifacts/playback-evidence.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
