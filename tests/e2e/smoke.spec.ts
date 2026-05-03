import { expect, test } from '@playwright/test';

test('loads the game and supports a move plus restart', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();

  await page.waitForFunction(() => window.__klotski?.getSnapshot().level === 1);

  const before = await page.evaluate(() => window.__klotski?.getSnapshot());
  expect(before?.legalMoves).toBeGreaterThan(0);

  const moved = await page.evaluate(() => window.__klotski?.moveFirstLegal());
  expect(moved).toBe(true);

  await page.waitForFunction(() => window.__klotski?.getSnapshot().moves === 1);
  await page.evaluate(() => window.__klotski?.restart());
  await page.waitForFunction(() => window.__klotski?.getSnapshot().moves === 0);

  const nonBlank = await page.locator('canvas').evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext('2d');
    if (!context) {
      return false;
    }
    const { data } = context.getImageData(0, 0, 24, 24);
    return data.some((value, index) => index % 4 !== 3 && value > 0);
  });

  expect(nonBlank).toBe(true);
});
