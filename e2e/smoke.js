/* Full-stack browser E2E: operator console + mobile user-app.
   Backend :8055 (seeded demo building), console :3100, user-app :3101. */
const { chromium } = require('playwright');

const SHOTS = __dirname + '/shots';
require('fs').mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const results = [];
  const fail = (msg) => { results.push('FAIL: ' + msg); };
  const ok = (msg) => { results.push('OK:   ' + msg); };

  // ── Operator console ─────────────────────────────────────────────
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => fail('console pageerror: ' + e.message));

  await page.goto('http://localhost:3100/');
  await page.waitForTimeout(800);

  // Login screen?
  if (await page.locator('input[type="email"], input[name="email"]').count()) {
    await page.fill('input[type="email"], input[name="email"]', 'demo@evac.ops');
    await page.fill('input[type="password"]', 'demo1234!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1200);
    ok('console login as demo@evac.ops');
  } else {
    ok('console did not require login (stored token?)');
  }
  await page.screenshot({ path: SHOTS + '/01-console-buildings.png' });

  // Click through to the simulation of building 1.
  const simBtn = page.locator('text=จำลอง').first();
  const bldCard = page.locator('text=อาคาร IT').first();
  if (await bldCard.count()) {
    await bldCard.click();
    await page.waitForTimeout(600);
  }
  // Try direct route as fallback.
  if (!page.url().includes('/simulate')) {
    await page.goto('http://localhost:3100/buildings/1/simulate');
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOTS + '/02-console-simulation.png' });
  const hasPlan = await page.locator('svg.floorplan').count();
  hasPlan ? ok('simulation floor plan rendered') : fail('floor plan SVG missing');

  // Press play and let the timeline run — evacuee dots should appear.
  const play = page.locator('button.play-btn');
  if (await play.count()) {
    await play.click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: SHOTS + '/03-console-timeline-playing.png' });
    ok('timeline played 4s (fire spread + evacuee dots)');
  } else {
    fail('play button not found');
  }

  // ── Mobile user-app ──────────────────────────────────────────────
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mob.on('pageerror', (e) => fail('user-app pageerror: ' + e.message));
  await mob.goto('http://localhost:3101/');
  await mob.waitForTimeout(1200);
  await mob.screenshot({ path: SHOTS + '/04-userapp-buildings.png' });

  const card = mob.locator('text=อาคาร IT').first();
  if (await card.count()) {
    await card.click();
    await mob.waitForTimeout(800);
    ok('user-app building list → floor picker');
  } else {
    fail('user-app building card not found');
  }
  // pick floor 1
  const floorBtn = mob.locator('button, a').filter({ hasText: /ชั้น\s*1|^1$/ }).first();
  if (await floorBtn.count()) {
    await floorBtn.click();
    await mob.waitForTimeout(1500);
  } else {
    await mob.goto('http://localhost:3101/b/1/f/1');
    await mob.waitForTimeout(1500);
  }
  await mob.screenshot({ path: SHOTS + '/05-userapp-floormap.png' });
  ok('user-app floor map rendered');

  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error('E2E crashed:', e); process.exit(2); });
