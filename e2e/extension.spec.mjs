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
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { simulateColor, simulatedWcagRatio, wcagRatio } from '@dichroma/core';
import { DEMO_PAGE_HTML } from './demo-page.mjs';

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

// Contrast-audit fixture (route /audit), one case per result group:
// #cvd-only passes WCAG in true colors (5.25:1) but drops to ≈3.1:1 under
// protanopia severity 1; #always-fail is ≈2:1 gray-on-white; #needs-review
// puts text over a gradient, which axe cannot resolve to a single bgColor.
const AUDIT_PAGE_HTML =
  '<!doctype html><html><body style="margin:0;background:#ffffff">' +
  '<p id="cvd-only" style="color:#ff0000;background-color:#000000">Red on black: fine for most, unreadable under protanopia</p>' +
  '<p id="always-fail" style="color:#b8b8b8;background-color:#ffffff">Light gray on white fails for everyone</p>' +
  '<p id="needs-review" style="background-image:linear-gradient(#ffffff,#eeeeee)">Text over a gradient needs human eyes</p>' +
  '<div style="height:3000px"></div></body></html>';

// Second audit fixture (route /audit2) for the panel-rebind scenario: a
// DIFFERENT group tally than /audit so the rebound results are unambiguous,
// and enough nodes (200) that axe takes a beat — the transient Running…
// state stays observable.
const AUDIT2_PAGE_HTML =
  '<!doctype html><html><body style="margin:0;background:#ffffff">' +
  Array.from(
    { length: 40 },
    (_, i) =>
      `<p style="color:#b8b8b8;background-color:#ffffff">Second tab gray on white ${i + 1}</p>`,
  ).join('') +
  Array.from(
    { length: 160 },
    (_, i) =>
      `<p style="color:#1c1c1c;background-color:#ffffff">Second tab passing text ${i + 1}</p>`,
  ).join('') +
  '</body></html>';

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
    res.end(
      req.url === '/audit'
        ? AUDIT_PAGE_HTML
        : req.url === '/audit2'
          ? AUDIT2_PAGE_HTML
          : req.url === '/demo'
            ? DEMO_PAGE_HTML // store-assets/make-screenshots.mjs fixture
            : PAGE_HTML,
    );
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

test('production manifest ships without host_permissions', async () => {
  expect(prodManifest.host_permissions).toBeUndefined();
  expect(prodManifest.permissions.sort()).toEqual([
    'activeTab',
    'scripting',
    'sidePanel',
    'storage',
  ]);
  expect(prodManifest.optional_host_permissions).toEqual(['<all_urls>']);
  expect(prodManifest.side_panel).toEqual({ default_path: 'sidepanel.html' });
  // The vendor copy hook must work from a clean output: axe shipped
  // unmodified with its MPL-2.0 LICENSE alongside.
  expect(existsSync(path.join(PROD_DIR, 'vendor/axe.min.js'))).toBe(true);
  expect(existsSync(path.join(PROD_DIR, 'vendor/LICENSE'))).toBe(true);

  // i18n plumbing: en is the default locale, public/_locales lands at the
  // output root, and Chrome actually resolves messages from it — the loaded
  // build's SW must return a non-empty extDescription.
  expect(prodManifest.default_locale).toBe('en');
  expect(prodManifest.description).toBe('__MSG_extDescription__');
  expect(existsSync(path.join(PROD_DIR, '_locales/en/messages.json'))).toBe(true);
  expect(existsSync(path.join(PROD_DIR, '_locales/ko/messages.json'))).toBe(true);
  const extDescription = await sw.evaluate(() => chrome.i18n.getMessage('extDescription'));
  console.log(`SW i18n.getMessage('extDescription'): '${extDescription}'`);
  expect(extDescription.length).toBeGreaterThan(0);
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

test('contrast audit: one axe run, simulated-space classification, overlay, focus', async () => {
  const page = await context.newPage();
  await page.goto(`${baseUrl}audit`);
  const tabId = await resolveTabId(`${baseUrl}audit`);
  expect(tabId).toBeTruthy();

  // Open the side panel as a regular page through its ?tab= test hook.
  const extensionId = new URL(sw.url()).host;
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);

  // Defaults: severity 1, type Deuteranopia — the P summary chip (not the
  // select) switches the classification to Protanopia after the run.
  await expect(panel.getByLabel('Severity')).toHaveValue('1');

  // Run: panel → background runAudit → executeScript injects
  // vendor/axe.min.js + contrast-audit.js (the e2e build's host_permissions
  // stand in for the activeTab grant a real popup click would provide).
  await panel.getByRole('button', { name: 'Run audit' }).click();

  // Human-centered heading under the default Deuteranopia: red-on-black is
  // NOT a deutan failure, so cvd-only counts 0 here.
  await expect(
    panel.getByRole('heading', { name: 'Readable now — but fails for Deuteranopia users (0)' }),
  ).toBeVisible({ timeout: 15_000 });

  // Four-type summary bar: would-be cvd-only tallies per type at the current
  // severity (protan=1, deutan=0 on this fixture); accessible names carry the
  // FULL localized type name + count, the visible text the badge letter.
  const pChip = panel.getByRole('button', { name: 'Protanopia: 1' });
  await expect(pChip).toHaveText('P 1');
  await expect(panel.getByRole('button', { name: 'Deuteranopia: 0' })).toHaveText('D 0');
  console.log('summary bar: protan=1 deutan=0');

  // Clicking the P chip switches the type select and reclassifies locally
  // (no axe re-run); the active chip is marked via aria-pressed.
  await pChip.click();
  await expect(panel.getByLabel('Type')).toHaveValue('protan');
  await expect(pChip).toHaveAttribute('aria-pressed', 'true');

  // Group counts under Protanopia: exactly one entry per group.
  await expect(
    panel.getByRole('heading', { name: 'Readable now — but fails for Protanopia users (1)' }),
  ).toBeVisible();
  await expect(
    panel.getByRole('heading', { name: 'Already failing WCAG for everyone (1)' }),
  ).toBeVisible();
  await expect(panel.locator('details.needs-review summary')).toContainText('Needs review (1)');
  console.log('audit groups: cvd-only=1 failing=1 needs-review=1');

  // cvd-only rows lead with the human sentence; the snippet follows.
  const cvdRow = panel.locator('section.cvd-only .row');
  await expect(cvdRow.locator('.row-headline')).toHaveText('Hard to read for Protanopia');
  console.log('cvd-only row headline: Hard to read for Protanopia');

  // axe 4.12.x field-presence guard: the pinned version must keep exposing
  // resolved fgColor/bgColor in the check data (rows mirror them 1:1).
  await expect(cvdRow).toHaveAttribute('data-fg', '#ff0000');
  await expect(cvdRow).toHaveAttribute('data-bg', '#000000');
  const failRow = panel.locator('section.failing .row');
  await expect(failRow).toHaveAttribute('data-fg', '#b8b8b8');
  await expect(failRow).toHaveAttribute('data-bg', '#ffffff');

  // Preview chips: original + simulated snippet text, with the row's
  // data-sim-* derived from simulateColor (never hardcoded hex).
  const toHex = (rgb) =>
    `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  const simFg = toHex(simulateColor([255, 0, 0], 'protan', 1));
  const simBg = toHex(simulateColor([0, 0, 0], 'protan', 1));
  await expect(cvdRow).toHaveAttribute('data-sim-fg', simFg);
  await expect(cvdRow).toHaveAttribute('data-sim-bg', simBg);
  await expect(cvdRow.locator('.chip')).toHaveCount(2);
  await expect(cvdRow.locator('.chip-original')).toContainText('Red on black');
  await expect(cvdRow.locator('.chip-simulated')).toContainText('Red on black');
  const simChipLabel = await cvdRow.locator('.chip-simulated').getAttribute('aria-label');
  console.log(`simulated chip aria-label: '${simChipLabel}'`);
  expect(simChipLabel).toContain(`${simFg} on ${simBg}`);

  // Ratio line derived from @dichroma/core, not hardcoded: original →
  // simulated (needs expected), e.g. '5.3:1 → 3.1:1 (needs 4.5:1)'.
  const fmt = (r) => `${Math.round(r * 10) / 10}:1`;
  const orig = wcagRatio([255, 0, 0], [0, 0, 0]);
  const sim = simulatedWcagRatio([255, 0, 0], [0, 0, 0], 'protan', 1);
  const ratioLine = `${fmt(orig)} → ${fmt(sim)} (needs 4.5:1)`;
  await expect(cvdRow).toContainText(ratioLine);
  console.log(`cvd-only ratio line asserted: '${ratioLine}'`);

  // Needs-review is collapsed by default (inconclusive, not failing): the
  // native disclosure hides the rows until the summary is activated.
  const needsReview = panel.locator('details.needs-review');
  await expect(needsReview).toHaveJSProperty('open', false);
  await expect(needsReview.locator('.row')).toBeHidden();
  await needsReview.locator('summary').click();
  await expect(needsReview).toHaveJSProperty('open', true);
  // Expanded rows surface the human-readable axe reason.
  await expect(needsReview.locator('.row')).toBeVisible();
  await expect(needsReview.locator('.row')).toContainText('gradient background');
  console.log('needs-review collapsed by default; expanding revealed the gradient row');

  // The page now carries the overlay host (closed shadow root, so assert the
  // host's popover attribute and its data-count box tally instead).
  const overlayHost = () =>
    page.evaluate(() => {
      const host = [...document.documentElement.children].find((el) =>
        el.hasAttribute('data-dichroma-overlay'),
      );
      return host
        ? { popover: host.getAttribute('popover'), count: host.getAttribute('data-count') }
        : null;
    });
  await expect.poll(overlayHost, { timeout: 10_000 }).toEqual({ popover: 'manual', count: '3' });
  console.log(`overlay host: ${JSON.stringify(await overlayHost())}`);

  // Row click focuses the flagged element in the page (scrollIntoView).
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(2000);
  await cvdRow.click();
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 })
    .toBeLessThan(1000);
  const inViewport = await page.evaluate(() => {
    const r = document.getElementById('cvd-only').getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  });
  expect(inViewport).toBe(true);
  console.log(`focusEntry scrolled the page; #cvd-only in viewport: ${inViewport}`);

  // The row click also opens the in-page preview card (closed shadow root,
  // so the audit script reflects liveness as data-preview on the host) …
  const previewAttr = () =>
    page.evaluate(() => {
      const host = [...document.documentElement.children].find((el) =>
        el.hasAttribute('data-dichroma-overlay'),
      );
      return host?.getAttribute('data-preview') ?? null;
    });
  await expect.poll(previewAttr, { timeout: 3000 }).toBe('1');
  console.log('preview card live: data-preview=1');
  // … and it auto-dismisses (4s timer) within ~5s of appearing.
  await expect.poll(previewAttr, { timeout: 6000 }).toBe(null);
  console.log('preview card auto-dismissed');

  // ---- storage-backed lifecycle (M3.2) -------------------------------------

  // Heuristic disclosure: the footnote is always present in the panel DOM.
  await expect(panel.locator('.heuristic-note')).toContainText(
    'estimates from CVD color models',
  );
  console.log('heuristic footnote present in the panel');

  // Navigation kills the page-side script — the only auditStale emitter — so
  // the BACKGROUND must flag the stored result (auditInvalidated) and the
  // panel must show the staleness banner while keeping the results visible.
  await page.reload();
  await expect(panel.locator('.banner')).toContainText('results may be stale', {
    timeout: 10_000,
  });
  await expect(
    panel.getByRole('heading', { name: 'Readable now — but fails for Protanopia users (1)' }),
  ).toBeVisible();
  console.log('staleness banner shown after reload; results kept');

  // A popup-triggered audit on ANOTHER tab must rebind the still-open panel:
  // auditStarted switches it to Running…, then that tab's results render.
  // The runAudit is sent from the panel page's own context because an
  // extension context never receives its own runtime message — the SW
  // cannot self-message the way the popup does, and the rebinding events
  // (auditStarted/auditResult) are broadcast by OTHER contexts anyway.
  const page2 = await context.newPage();
  await page2.goto(`${baseUrl}audit2`);
  const tab2Id = await resolveTabId(`${baseUrl}audit2`);
  expect(tab2Id).toBeTruthy();
  await panel.evaluate((id) => {
    void chrome.runtime.sendMessage({ kind: 'runAudit', tabId: id });
  }, tab2Id);
  await expect(panel.getByRole('button', { name: 'Running…' })).toBeVisible({
    timeout: 10_000,
  });
  console.log('panel rebound: Running… shown for the second tab');
  await expect(
    panel.getByRole('heading', { name: 'Already failing WCAG for everyone (40)' }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    panel.getByRole('heading', { name: 'Readable now — but fails for Protanopia users (0)' }),
  ).toBeVisible();
  await expect(panel.locator('section.failing .row').first()).toContainText(
    'Second tab gray on white 1',
  );
  console.log('panel rebound to the second tab and rendered its results');

  await page2.close();
  await panel.close();
  await page.close();
});

test('closing the panel tears down the page overlay; reopen renders stored results, Re-run restores boxes', async () => {
  const page = await context.newPage();
  // The page script runs in the isolated world, but an uncaught exception in
  // a runtime.onMessage listener would still surface here — collected to
  // assert the post-teardown focusEntry/updateOverlay paths never throw.
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));
  await page.goto(`${baseUrl}audit`);
  const tabId = await resolveTabId(`${baseUrl}audit`);
  expect(tabId).toBeTruthy();

  const extensionId = new URL(sw.url()).host;
  let panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);
  await panel.getByRole('button', { name: 'Run audit' }).click();

  const overlayHost = () =>
    page.evaluate(() => {
      const host = [...document.documentElement.children].find((el) =>
        el.hasAttribute('data-dichroma-overlay'),
      );
      return host ? { count: host.getAttribute('data-count') } : null;
    });
  // Default type stays Deuteranopia: red-on-black is fine for deutan, so the
  // boxes are failing(1) + needs-review(1) = 2 (cvd-only joins under protan).
  await expect.poll(overlayHost, { timeout: 15_000 }).toEqual({ count: '2' });
  console.log('close-teardown: overlay up with data-count=2');

  // Close the panel page. page.close() destroys the document exactly like a
  // real side-panel close: the long-lived port disconnects, and the
  // BACKGROUND sends teardownAudit to the announced tab — the sidePanel API
  // itself fires no close event the panel could act on.
  await panel.close();
  await expect.poll(overlayHost, { timeout: 10_000 }).toBeNull();
  console.log('close-teardown: overlay host removed after panel close');

  // Reopen: the M3.2 pull path renders the STORED results…
  panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);
  await expect(
    panel.getByRole('heading', { name: 'Already failing WCAG for everyone (1)' }),
  ).toBeVisible({ timeout: 10_000 });
  // …and no staleness banner: the page never navigated.
  await expect(panel.locator('.banner')).toHaveCount(0);
  console.log('close-teardown: reopened panel rendered stored results');

  // The reopen DID re-send updateOverlay (same classify effect as a live
  // result), but teardown emptied the page-side element map, so it no-ops by
  // design: the overlay host stays absent until a Re-run rebuilds the map.
  // focusEntry on the torn-down page must be equally inert — row click
  // neither scrolls nor throws.
  await page.evaluate(() => window.scrollTo(0, 0));
  await panel.locator('section.failing .row').click();
  await panel.waitForTimeout(1000); // let any in-flight page command land
  expect(await overlayHost()).toBeNull();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(pageErrors).toEqual([]);
  console.log('close-teardown: post-teardown updateOverlay/focusEntry no-oped without errors');

  // Re-run is the documented recovery path: boxes come back.
  await panel.getByRole('button', { name: 'Re-run audit' }).click();
  await expect.poll(overlayHost, { timeout: 15_000 }).toEqual({ count: '2' });
  expect(pageErrors).toEqual([]);
  console.log('close-teardown: Re-run restored the overlay (data-count=2)');

  await panel.close();
  await page.close();
});

test("panel 'Preview on page' applies the full-page simulation and reverts", async () => {
  const page = await context.newPage();
  await page.goto(baseUrl); // red body — the center pixel proves the filter
  const tabId = await resolveTabId(baseUrl);
  expect(tabId).toBeTruthy();

  const extensionId = new URL(sw.url()).host;
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);

  // No simulation is active on the tab, so the switch initializes OFF.
  const toggle = panel.getByRole('switch', { name: 'Preview on page' });
  await expect(toggle).not.toBeChecked();

  const isSimulated = (expected) => async () => {
    const center = await centerPixel(page);
    return center.every((c, k) => Math.abs(c - expected[k]) <= 3);
  };

  // ON → the panel sends the EXISTING apply message; the background inserts
  // the css and sets the badge exactly like the popup path (panel defaults:
  // deutan severity 1).
  await toggle.check();
  await expect.poll(() => badgeText(tabId), { timeout: 10_000 }).toBe('D');
  const expectedD = simulateColor([255, 0, 0], 'deutan', 1);
  await expect.poll(isSimulated(expectedD), { timeout: 10_000 }).toBe(true);
  console.log(`preview ON: center matches deutan simulation [${expectedD}]`);

  // While ON, changing the panel type re-sends apply (debounced).
  await panel.getByLabel('Type').selectOption('protan');
  await expect.poll(() => badgeText(tabId), { timeout: 10_000 }).toBe('P');
  const expectedP = simulateColor([255, 0, 0], 'protan', 1);
  await expect.poll(isSimulated(expectedP), { timeout: 10_000 }).toBe(true);
  console.log(`preview re-applied on type change: center matches protan [${expectedP}]`);

  // OFF → clear: the page reverts exactly and the badge empties.
  await toggle.uncheck();
  await expect.poll(() => badgeText(tabId), { timeout: 10_000 }).toBe('');
  const reverted = await centerPixel(page);
  const revertDeltas = reverted.map((c, k) => Math.abs(c - [255, 0, 0][k]));
  console.log(`preview OFF reverted center: got [${reverted}] deltas [${revertDeltas}]`);
  for (const d of revertDeltas) expect(d).toBeLessThanOrEqual(1);

  await panel.close();
  await page.close();
});
