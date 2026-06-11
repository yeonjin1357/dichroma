// Generates the five Chrome Web Store screenshots (exactly 1280x800 PNG)
// into store-assets/screenshots/. Re-runnable on demand; NOT part of any test
// suite. See store-assets/README.md.
//
//   node store-assets/make-screenshots.mjs
//
// Pipeline (reuses the e2e infrastructure — no new dependencies):
//   1. `wxt build --mode e2e` (host_permissions let Playwright script pages
//      without a user-gesture activeTab grant — the SIMULATION/AUDIT OUTPUT is
//      pixel-identical to the production build, which never ships that key).
//   2. A node:http server serves the shared demo page (e2e/demo-page.mjs —
//      the same fixture the e2e server exposes at /demo).
//   3. A persistent Chromium context loads the extension and captures the raw
//      pieces at deviceScaleFactor 2 (composites downscale 2:1 → crisp).
//      Shot 5 re-launches the context with --lang=ko; the Korean panel needs
//      a Hangul font, staged hermetically from the Windows font mount into a
//      temp XDG_DATA_HOME (override the source with KO_FONT=/path/to.ttf).
//   4. Each final image is an HTML template composed at 1280x800 and
//      screenshotted with deviceScaleFactor 1, then dimension-asserted.
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = path.resolve(HERE, '..');
const E2E_DIR = path.join(ROOT, 'apps/extension/.output/chrome-mv3-e2e');
const OUT_DIR = path.join(HERE, 'screenshots');

const e2eRequire = createRequire(pathToFileURL(path.join(ROOT, 'e2e/package.json')));
const { chromium } = e2eRequire('@playwright/test');
const { PNG } = e2eRequire('pngjs');
// @dichroma/core is ESM-only (exports: import) — require() can't load it.
const { simulateColor } = await import(
  pathToFileURL(path.join(ROOT, 'packages/core/dist/index.js')).href
);
const { DEMO_PAGE_HTML } = await import(
  pathToFileURL(path.join(ROOT, 'e2e/demo-page.mjs')).href
);

const KO_FONT = process.env.KO_FONT ?? '/mnt/c/Windows/Fonts/NotoSansKR-VF.ttf';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function poll(fn, what, timeout = 20_000, every = 200) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, every));
  }
}

/** Average RGB of a 4x4 CSS-px clip centered on (x, y). */
async function avgPixel(page, x, y) {
  const buf = await page.screenshot({ clip: { x: x - 2, y: y - 2, width: 4, height: 4 } });
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

const near = (got, want, tol) => got.every((c, i) => Math.abs(c - want[i]) <= tol);

/** Wait until the audit overlay host carries data-count (boxes rendered). */
function waitForOverlay(page) {
  return page.waitForFunction(
    () => {
      const host = [...document.documentElement.children].find((el) =>
        el.hasAttribute('data-dichroma-overlay'),
      );
      return host !== undefined && Number(host.getAttribute('data-count')) >= 3;
    },
    undefined,
    { timeout: 30_000 },
  );
}

// ---------------------------------------------------------------------------
// 1. build + server
// ---------------------------------------------------------------------------

console.log('building extension (--mode e2e)…');
execSync('pnpm --filter extension exec wxt build --mode e2e', { cwd: ROOT, stdio: 'pipe' });
if (!existsSync(path.join(E2E_DIR, 'manifest.json'))) {
  throw new Error(`e2e build missing at ${E2E_DIR}`);
}

const server = createServer((_req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(DEMO_PAGE_HTML);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const demoUrl = `http://127.0.0.1:${server.address().port}/demo`;

const work = mkdtempSync(path.join(tmpdir(), 'dichroma-shots-'));
mkdirSync(OUT_DIR, { recursive: true });

// Hermetic Hangul font for the --lang=ko context: a temp XDG_DATA_HOME with
// one staged font (fontconfig scans $XDG_DATA_HOME/fonts) leaves the user's
// font setup and the en captures untouched.
const koFontHome = path.join(work, 'ko-font-home');
mkdirSync(path.join(koFontHome, 'fonts'), { recursive: true });
if (!existsSync(KO_FONT)) {
  throw new Error(
    `Hangul font not found at ${KO_FONT} — set KO_FONT=/path/to/a/Korean-capable.ttf`,
  );
}
copyFileSync(KO_FONT, path.join(koFontHome, 'fonts', path.basename(KO_FONT)));

/** Persistent context with the e2e extension; dsf 2 for crisp downscales. */
async function launch({ lang } = {}) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', // new headless supports extensions
    headless: true,
    deviceScaleFactor: 2,
    viewport: { width: 900, height: 800 },
    args: [
      `--disable-extensions-except=${E2E_DIR}`,
      `--load-extension=${E2E_DIR}`,
      '--force-color-profile=srgb',
      '--hide-scrollbars',
      ...(lang ? [`--lang=${lang}`] : []),
    ],
    ...(lang === 'ko' ? { env: { ...process.env, XDG_DATA_HOME: koFontHome } } : {}),
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(sw.url()).host;
  const resolveTabId = (url) =>
    sw.evaluate(async (u) => {
      const tabs = await chrome.tabs.query({});
      const ids = tabs.filter((t) => t.url?.startsWith(u)).map((t) => t.id);
      return ids.length > 0 ? Math.max(...ids) : undefined;
    }, url);
  const badgeText = (tabId) =>
    sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  return { context, sw, extensionId, resolveTabId, badgeText };
}

const cap = (name, buf) => {
  writeFileSync(path.join(work, name), buf);
  console.log(`captured ${name}`);
};

// ---------------------------------------------------------------------------
// 2. English captures
// ---------------------------------------------------------------------------

/** Shot-4 geometry measured during capture: { bannerRect, rowBox }. */
let shot4Meta;

const en = await launch();
{
  const page = await en.context.newPage();
  await page.setViewportSize({ width: 604, height: 716 });
  await page.goto(demoUrl, { waitUntil: 'networkidle' });
  const tabId = await en.resolveTabId(demoUrl);
  if (!tabId) throw new Error('demo tab not found');

  // Probe pixel: the logo-mark's green half — its deutan simulation differs
  // sharply, so it proves the filter is painted (badge alone only proves the
  // background finished insertCSS).
  const mark = await page.locator('.logo-mark').boundingBox();
  const probe = [mark.x + 5, mark.y + 5];
  const GREEN = [34, 197, 94]; // .logo-mark gradient top-left (#22c55e)
  const GREEN_DEUTAN = simulateColor(GREEN, 'deutan', 1);

  // -- shot 1a: original ------------------------------------------------------
  await poll(async () => near(await avgPixel(page, ...probe), GREEN, 8), 'original paint');
  cap('shot1-original.png', await page.screenshot());

  // -- shot 1b: deuteranopia via the real popup UI ----------------------------
  const popup = await en.context.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.goto(`chrome-extension://${en.extensionId}/popup.html?tab=${tabId}`);
  await popup.getByRole('radio', { name: 'Deuteranopia' }).check();
  await poll(async () => (await en.badgeText(tabId)) === 'D', "badge 'D'");
  await poll(
    async () => near(await avgPixel(page, ...probe), GREEN_DEUTAN, 8),
    'deutan filter paint',
  );
  cap('shot1-deutan.png', await page.screenshot());

  // -- shot 2: the popup at its natural 360px width, deutan selected ----------
  // Content height, not scrollHeight (which is >= the viewport height).
  const popupHeight = await popup.evaluate(() =>
    Math.ceil(document.body.getBoundingClientRect().height),
  );
  await popup.setViewportSize({ width: 360, height: Math.min(740, popupHeight) });
  cap('shot2-popup.png', await popup.screenshot());

  // Revert the filter so the audit shots show true colors.
  await popup.getByRole('radio', { name: 'None' }).check();
  await poll(async () => (await en.badgeText(tabId)) === '', 'badge cleared');
  await poll(async () => near(await avgPixel(page, ...probe), GREEN, 8), 'revert paint');
  await popup.close();

  // -- shot 3: audited page (overlay boxes) + side panel ----------------------
  await page.setViewportSize({ width: 900, height: 800 });
  const panel = await en.context.newPage();
  await panel.setViewportSize({ width: 380, height: 800 });
  await panel.goto(`chrome-extension://${en.extensionId}/sidepanel.html?tab=${tabId}`);
  await panel.locator('header.controls > button').click(); // Run audit
  await waitForOverlay(page);
  await panel.locator('section.group').first().waitFor({ state: 'visible' });
  await panel.waitForTimeout(400); // chips/summary settle
  cap('shot3-page.png', await page.screenshot());
  cap('shot3-panel.png', await panel.screenshot());

  // -- shot 4: in-page preview card + the matching panel row ------------------
  // The incident banner (#dc2626 on #fffbeb) is the deutan cvd-only entry.
  const row = panel.locator('section.cvd-only .row[data-fg="#dc2626"]').first();
  await row.waitFor({ state: 'visible' });
  cap('shot4-row.png', await row.screenshot());
  const rowBox = await row.boundingBox();
  await row.click();
  await page.waitForFunction(
    () => {
      const host = [...document.documentElement.children].find((el) =>
        el.hasAttribute('data-dichroma-overlay'),
      );
      return host?.getAttribute('data-preview') === '1';
    },
    undefined,
    { timeout: 10_000 },
  );
  // Freeze the moment before the card's 4s auto-dismiss: full screenshot +
  // the banner's viewport rect (the card anchors below its left edge).
  const bannerRect = await page.evaluate(() => {
    const r = document.getElementById('incident').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  cap('shot4-page.png', await page.screenshot());
  shot4Meta = { bannerRect, rowBox };

  await panel.close();
  await page.close();
}
await en.context.close();

// ---------------------------------------------------------------------------
// 3. Korean captures (shot 5 = shot 3 with --lang=ko)
// ---------------------------------------------------------------------------

const ko = await launch({ lang: 'ko' });
{
  const page = await ko.context.newPage();
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto(demoUrl, { waitUntil: 'networkidle' });
  const tabId = await ko.resolveTabId(demoUrl);
  if (!tabId) throw new Error('demo tab not found (ko)');

  const panel = await ko.context.newPage();
  await panel.setViewportSize({ width: 380, height: 800 });
  await panel.goto(`chrome-extension://${ko.extensionId}/sidepanel.html?tab=${tabId}`);
  // Fail fast if the locale did not take (the whole point of this shot).
  const title = await panel.locator('h1').textContent();
  if (title !== '대비 검사') {
    throw new Error(`--lang=ko did not localize the panel (h1: '${title}')`);
  }
  await panel.locator('header.controls > button').click();
  await waitForOverlay(page);
  await panel.locator('section.group').first().waitFor({ state: 'visible' });
  await panel.waitForTimeout(400);
  cap('shot5-page.png', await page.screenshot());
  cap('shot5-panel.png', await panel.screenshot());
  await panel.close();
  await page.close();
}
await ko.context.close();

// ---------------------------------------------------------------------------
// 4. composites — each template is screenshotted at exactly 1280x800
// ---------------------------------------------------------------------------

// Brand-dark backdrop shared by the framed shots (01/02/04); 03/05 are
// full-bleed application pixels.
const FRAME_CSS = `
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1280px; height: 800px; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background:
      radial-gradient(640px 420px at 18% 8%, rgba(255, 68, 68, .12), transparent 70%),
      radial-gradient(640px 420px at 85% 92%, rgba(156, 156, 54, .14), transparent 70%),
      linear-gradient(135deg, #1c2230, #11141c);
    font: 600 13px/1 ui-sans-serif, system-ui, sans-serif;
  }
  figure { display: flex; flex-direction: column; gap: 10px; align-items: center; }
  figcaption { color: #b7bfcf; letter-spacing: .08em; text-transform: uppercase; }
  img { display: block; border-radius: 10px; box-shadow: 0 14px 44px rgba(0, 0, 0, .55); }
`;

const TEMPLATES = {
  '01-simulation-before-after.png': `<!doctype html><html><head><style>${FRAME_CSS}
    body { gap: 24px; }
  </style></head><body>
    <figure><figcaption>Original</figcaption><img src="shot1-original.png" width="604" height="716"></figure>
    <figure><figcaption>Deuteranopia</figcaption><img src="shot1-deutan.png" width="604" height="716"></figure>
  </body></html>`,

  '02-popup.png': `<!doctype html><html><head><style>${FRAME_CSS}</style></head><body>
    <img src="shot2-popup.png" width="360">
  </body></html>`,

  '03-audit-panel.png': `<!doctype html><html><head><style>
    * { margin: 0; } body { width: 1280px; height: 800px; overflow: hidden; position: relative; }
    img { display: block; float: left; }
    .divider { position: absolute; left: 900px; top: 0; bottom: 0; width: 1px; background: rgba(23, 27, 38, .35); }
  </style></head><body>
    <img src="shot3-page.png" width="900" height="800"><img src="shot3-panel.png" width="380" height="800">
    <div class="divider"></div>
  </body></html>`,

  // built later — needs the measured rects
  '04-preview-card.png': null,

  '05-korean-ui.png': `<!doctype html><html><head><style>
    * { margin: 0; } body { width: 1280px; height: 800px; overflow: hidden; position: relative; }
    img { display: block; float: left; }
    .divider { position: absolute; left: 900px; top: 0; bottom: 0; width: 1px; background: rgba(23, 27, 38, .35); }
  </style></head><body>
    <img src="shot5-page.png" width="900" height="800"><img src="shot5-panel.png" width="380" height="800">
    <div class="divider"></div>
  </body></html>`,
};

// Shot 4: crop the page capture around the flagged banner + the preview card
// below it (template-side crop: a fixed-size window over the negatively
// offset full screenshot), shown at 2x (1:1 with the dsf-2 raw pixels); the
// panel row at 1.5x.
{
  const { bannerRect, rowBox } = shot4Meta;
  const crop = {
    x: Math.max(0, Math.round(bannerRect.x) - 16),
    y: Math.max(0, Math.round(bannerRect.y) - 16),
    width: 600,
    height: 200,
  };
  crop.width = Math.min(crop.width, 900 - crop.x);
  crop.height = Math.min(crop.height, 800 - crop.y);
  const rowW = Math.round(rowBox.width * 1.5);
  const rowH = Math.round(rowBox.height * 1.5);
  TEMPLATES['04-preview-card.png'] = `<!doctype html><html><head><style>${FRAME_CSS}
    body { flex-direction: column; gap: 22px; }
    .crop { width: ${crop.width * 2}px; height: ${crop.height * 2}px; overflow: hidden;
            border-radius: 10px; box-shadow: 0 14px 44px rgba(0, 0, 0, .55); position: relative; }
    .crop img { border-radius: 0; box-shadow: none; position: absolute;
                left: ${-crop.x * 2}px; top: ${-crop.y * 2}px; }
  </style></head><body>
    <figure>
      <figcaption>Click a result — the live preview card appears on the page</figcaption>
      <div class="crop"><img src="shot4-page.png" width="1800" height="1600"></div>
    </figure>
    <figure>
      <figcaption>The matching audit entry: original vs simulated colors</figcaption>
      <img src="shot4-row.png" width="${rowW}" height="${rowH}">
    </figure>
  </body></html>`;
}

const compose = await chromium.launch({ channel: 'chromium', headless: true });
for (const [out, html] of Object.entries(TEMPLATES)) {
  const tpl = path.join(work, `${out}.html`);
  writeFileSync(tpl, html);
  const page = await compose.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(tpl).href, { waitUntil: 'networkidle' });
  const buf = await page.screenshot();
  await page.close();
  const png = PNG.sync.read(buf);
  if (png.width !== 1280 || png.height !== 800) {
    throw new Error(`${out} is ${png.width}x${png.height}, expected 1280x800`);
  }
  writeFileSync(path.join(OUT_DIR, out), buf);
  console.log(`${path.join('store-assets/screenshots', out)} (1280x800)`);
}
await compose.close();

server.close();
rmSync(work, { recursive: true, force: true });
console.log('done.');
