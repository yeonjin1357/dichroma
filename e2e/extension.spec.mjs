// Extension e2e: load the built extension in Chromium, drive the popup, and
// verify the live-page CVD simulation end to end.
//
// WHY --mode e2e EXISTS: Playwright scripts pages without user gestures, so
// the activeTab grant the extension normally relies on never happens. The
// `wxt build --mode e2e` build (output: .output/chrome-mv3-e2e) adds
// host_permissions: ['<all_urls>'] so insertCSS/executeScript work under
// automation. Production builds must NEVER ship that key — both directions
// are asserted below.
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { simulateColor } from '@dichroma/core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROD_DIR = path.join(ROOT, 'apps/extension/.output/chrome-mv3');
const E2E_DIR = path.join(ROOT, 'apps/extension/.output/chrome-mv3-e2e');

// Red body + blue position:fixed header + tall scroller: the center pixel
// proves the filter math, the header y proves the filter did not create a
// containing block that breaks position:fixed (why we filter html, not body).
// The corner button performs an SPA-style same-document navigation
// (history.pushState) for the Bug B regression scenario.
const PAGE_HTML =
  '<!doctype html><html><body style="margin:0;background:rgb(255,0,0)">' +
  '<header style="position:fixed;top:0;left:0;right:0;height:50px;background:rgb(0,0,255)"></header>' +
  '<button id="spa-nav" style="position:fixed;bottom:10px;left:10px" ' +
  "onclick=\"history.pushState({}, '', '/spa-route')\">SPA nav</button>" +
  '<div style="height:3000px"></div></body></html>';

/** @type {import('@playwright/test').BrowserContext} */ let context;
/** @type {import('@playwright/test').Worker} */ let sw;
let server;
let baseUrl;
let prodManifest;
let e2eManifest;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // Build production first, then e2e mode; each goes to its own outDir.
  execSync('pnpm --filter extension exec wxt build', { cwd: ROOT, stdio: 'pipe' });
  prodManifest = JSON.parse(readFileSync(path.join(PROD_DIR, 'manifest.json'), 'utf8'));
  execSync('pnpm --filter extension exec wxt build --mode e2e', { cwd: ROOT, stdio: 'pipe' });
  e2eManifest = JSON.parse(readFileSync(path.join(E2E_DIR, 'manifest.json'), 'utf8'));

  server = createServer((req, res) => {
    if (req.url === '/redirect') {
      // One user navigation that bounces through a 302: Chrome fires several
      // status:'loading' tab events for it (the Bug A duplicate trigger).
      res.statusCode = 302;
      res.setHeader('location', '/');
      res.end();
      return;
    }
    res.setHeader('content-type', 'text/html');
    res.end(PAGE_HTML);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/`;

  context = await chromium.launchPersistentContext('', {
    channel: 'chromium', // new headless supports extensions
    headless: true,
    args: [
      `--disable-extensions-except=${E2E_DIR}`,
      `--load-extension=${E2E_DIR}`,
      '--force-color-profile=srgb',
    ],
  });
  sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
});

test.afterAll(async () => {
  await context?.close();
  server?.close();
});

/** Average RGB of a 10x10 clip at the viewport center. */
async function centerPixel(page) {
  const vp = page.viewportSize();
  const buf = await page.screenshot({
    clip: { x: vp.width / 2 - 5, y: vp.height / 2 - 5, width: 10, height: 10 },
  });
  const png = PNG.sync.read(buf);
  const n = png.width * png.height;
  const sum = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    sum[0] += png.data[i * 4];
    sum[1] += png.data[i * 4 + 1];
    sum[2] += png.data[i * 4 + 2];
  }
  return sum.map((s) => Math.round(s / n));
}

function badgeText(tabId) {
  return sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
}

/**
 * Tab id of the most recently opened tab whose URL starts with `url`
 * (tests run serially in one shared context, so earlier tests' pages may
 * still be around; tab ids increase monotonically).
 */
async function resolveTabId(url) {
  return sw.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    const ids = tabs.filter((t) => t.url?.startsWith(u)).map((t) => t.id);
    return ids.length > 0 ? Math.max(...ids) : undefined;
  }, url);
}

/** Open popup.html as a page, targeting `tabId` through the ?tab= test hook. */
async function openPopup(tabId) {
  const extensionId = new URL(sw.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
  return popup;
}

test('production manifest ships without host_permissions', () => {
  expect(prodManifest.host_permissions).toBeUndefined();
  expect(prodManifest.permissions.sort()).toEqual(['activeTab', 'scripting', 'storage']);
  expect(prodManifest.optional_host_permissions).toEqual(['<all_urls>']);
});

test('e2e-mode manifest carries host_permissions <all_urls>', () => {
  expect(e2eManifest.host_permissions).toEqual(['<all_urls>']);
});

test('popup applies deuteranopia to a live page and reverts cleanly', async () => {
  const pageA = await context.newPage();
  await pageA.goto(baseUrl);
  await pageA.evaluate(() => window.scrollTo(0, 500));

  // Resolve tab A's tabId inside the extension SW. The e2e build's host
  // permissions expose tab.url; the production extension never needs this
  // (and has no 'tabs' permission).
  const tabId = await sw.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url?.startsWith(url))?.id;
  }, baseUrl);
  expect(tabId).toBeTruthy();

  // Drive the popup through its ?tab= test hook (opening popup.html as a
  // regular tab would make the popup itself the active tab).
  const extensionId = new URL(sw.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);

  await popup.getByRole('radio', { name: 'Deuteranopia' }).check();
  await expect.poll(() => badgeText(tabId), { timeout: 10_000 }).toBe('D');

  // ① center pixel matches the pure-function reference within ±3/255
  const expected = simulateColor([255, 0, 0], 'deutan', 1);
  const center = await centerPixel(pageA);
  const deltas = center.map((c, k) => Math.abs(c - expected[k]));
  console.log(`deutan center: got [${center}] expected [${expected}] deltas [${deltas}]`);
  for (const d of deltas) expect(d).toBeLessThanOrEqual(3);

  // ② position:fixed header still pinned to the viewport top
  const headerBox = await pageA.locator('header').boundingBox();
  console.log(`fixed header y: ${headerBox.y}`);
  expect(headerBox.y).toBe(0);

  // ③ badge already asserted as 'D' by the poll above
  expect(await badgeText(tabId)).toBe('D');

  // None reverts the page exactly and clears the badge
  await popup.getByRole('radio', { name: 'None' }).check();
  await expect.poll(() => badgeText(tabId), { timeout: 10_000 }).toBe('');
  const reverted = await centerPixel(pageA);
  const revertDeltas = reverted.map((c, k) => Math.abs(c - [255, 0, 0][k]));
  console.log(`reverted center: got [${reverted}] deltas [${revertDeltas}]`);
  for (const d of revertDeltas) expect(d).toBeLessThanOrEqual(1);
});

test('Bug A: persist keeps the filter across reloads + a 302 redirect, and None removes it', async () => {
  // The e2e build ships host_permissions <all_urls>, so the controller's
  // permissions.contains check passes without a popup permission prompt.
  await sw.evaluate(() => chrome.storage.local.set({ prefs: { persist: true } }));

  const page = await context.newPage();
  await page.goto(baseUrl);
  const tabId = await resolveTabId(baseUrl);
  expect(tabId).toBeTruthy();

  const popup = await openPopup(tabId);
  await popup.getByRole('radio', { name: 'Deuteranopia' }).check();
  await expect.poll(() => badgeText(tabId), { timeout: 10_000 }).toBe('D');

  const expected = simulateColor([255, 0, 0], 'deutan', 1);
  const isSimulated = async () => {
    const center = await centerPixel(page);
    return center.every((c, k) => Math.abs(c - expected[k]) <= 3);
  };
  await expect.poll(isSimulated, { timeout: 10_000 }).toBe(true);

  // Each reload fires several status:'loading' events; the persist re-apply
  // must keep exactly one live insertion (the pre-fix build stacked the same
  // css repeatedly, which None could then never fully remove).
  await page.reload();
  await expect.poll(isSimulated, { timeout: 10_000 }).toBe(true);
  console.log('Bug A: filter still applied after reload #1');
  await page.reload();
  await expect.poll(isSimulated, { timeout: 10_000 }).toBe(true);
  console.log('Bug A: filter still applied after reload #2');

  // A server 302 bounce is one navigation with extra loading events.
  await page.goto(`${baseUrl}redirect`);
  await expect(page).toHaveURL(baseUrl);
  await expect.poll(isSimulated, { timeout: 10_000 }).toBe(true);
  console.log('Bug A: filter still applied after 302 redirect');

  // None must remove the filter completely — the original bug left it stuck.
  await popup.getByRole('radio', { name: 'None' }).check();
  await expect.poll(() => badgeText(tabId), { timeout: 10_000 }).toBe('');
  const reverted = await centerPixel(page);
  const revertDeltas = reverted.map((c, k) => Math.abs(c - [255, 0, 0][k]));
  console.log(`Bug A reverted center: got [${reverted}] deltas [${revertDeltas}]`);
  for (const d of revertDeltas) expect(d).toBeLessThanOrEqual(1);

  await popup.close();
  await page.close();
  await sw.evaluate(() => chrome.storage.local.set({ prefs: { persist: false } }));
});

test('Bug B: SPA pushState keeps the filter, getState adopts it, and None removes it', async () => {
  await sw.evaluate(() => chrome.storage.local.set({ prefs: { persist: false } }));

  const page = await context.newPage();
  await page.goto(baseUrl);
  const tabId = await resolveTabId(baseUrl);
  expect(tabId).toBeTruthy();

  let popup = await openPopup(tabId);
  await popup.getByRole('radio', { name: 'Deuteranopia' }).check();
  await expect.poll(() => badgeText(tabId), { timeout: 10_000 }).toBe('D');
  await popup.close();

  // Same-document navigation: the document — and the inserted css — survive,
  // but the resulting tab events were treated as document-destroying and
  // deleted the state, orphaning the filter (popup showed None, stuck on).
  await page.click('#spa-nav');
  await expect(page).toHaveURL(`${baseUrl}spa-route`);

  const expected = simulateColor([255, 0, 0], 'deutan', 1);
  const center = await centerPixel(page);
  const deltas = center.map((c, k) => Math.abs(c - expected[k]));
  console.log(`Bug B after pushState: got [${center}] expected [${expected}] deltas [${deltas}]`);
  for (const d of deltas) expect(d).toBeLessThanOrEqual(3);

  // Reopening the popup re-runs getState, which must reconcile with the live
  // page and adopt the orphaned filter as real state.
  popup = await openPopup(tabId);
  const res = await popup.evaluate(
    (id) => chrome.runtime.sendMessage({ kind: 'getState', tabId: id }),
    tabId,
  );
  console.log(`Bug B getState after pushState: ${JSON.stringify(res?.state?.settings)}`);
  expect(res.ok).toBe(true);
  expect(res.state?.settings).toEqual({ type: 'deutan', severity: 1 });
  // ...and the popup must show reality, not None
  await expect(popup.getByRole('radio', { name: 'Deuteranopia' })).toBeChecked();

  // None now removes the adopted filter and clears the badge.
  await popup.getByRole('radio', { name: 'None' }).check();
  await expect.poll(() => badgeText(tabId), { timeout: 10_000 }).toBe('');
  const reverted = await centerPixel(page);
  const revertDeltas = reverted.map((c, k) => Math.abs(c - [255, 0, 0][k]));
  console.log(`Bug B reverted center: got [${reverted}] deltas [${revertDeltas}]`);
  for (const d of revertDeltas) expect(d).toBeLessThanOrEqual(1);

  await popup.close();
  await page.close();
});
