// Regenerates the extension icon PNGs from the SVG sources in this directory
// and installs them into apps/extension/public/icon/ (the WXT convention:
// public/icon/{16,32,48,128}.png auto-populates manifest.icons and
// action.default_icon).
//
//   node store-assets/icons/generate.mjs
//
// How: two passes with headless Chromium, both screenshotted over
// --default-background-color=00000000 so the rounded corners stay TRANSPARENT.
//   1. Each SVG source is rendered once at 512x512 (display:block, margin 0 —
//      inline svg would add line-box descent, overflow the window, and summon
//      scrollbars into the capture).
//   2. Each target size is produced by Chrome downscaling that 512px PNG via
//      an <img> at the exact pixel size. Rendering the svg directly at 16px
//      leaves stray 1-12/255 alpha residue in the corner pixels (conservative
//      path AA); downscaling from 512 gives mathematically clean corners
//      (alpha exactly 0) and better edge quality.
// 128/48 come from icon.svg (split disk + seam line); 16/32 from
// icon-small.svg (bigger disk, no seam — legible at toolbar size).
//
// Dev-only script: uses pngjs + the Playwright Chromium from the e2e package
// (no new dependencies). Override the browser with CHROME_BIN if needed.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ICON_DIR = path.join(ROOT, 'apps/extension/public/icon');

const e2eRequire = createRequire(pathToFileURL(path.join(ROOT, 'e2e/package.json')));
const { PNG } = e2eRequire('pngjs');
const CHROME =
  process.env.CHROME_BIN ?? e2eRequire('@playwright/test').chromium.executablePath();

const SOURCE_SIZE = 512;
// target size → which SVG source renders it
const SIZES = [
  { size: 128, svg: 'icon.svg' },
  { size: 48, svg: 'icon.svg' },
  { size: 32, svg: 'icon-small.svg' },
  { size: 16, svg: 'icon-small.svg' },
];

const work = mkdtempSync(path.join(tmpdir(), 'dichroma-icons-'));
mkdirSync(ICON_DIR, { recursive: true });

function capture(htmlPath, pngPath, size) {
  execFileSync(
    CHROME,
    [
      '--headless',
      '--no-sandbox',
      '--force-color-profile=srgb',
      `--screenshot=${pngPath}`,
      `--window-size=${size},${size}`,
      '--default-background-color=00000000',
      pathToFileURL(htmlPath).href,
    ],
    { stdio: 'pipe' }, // Chromium logs dbus/gpu noise on stderr; failures still throw
  );
}

try {
  // Pass 1: rasterize each SVG source once at 512px.
  for (const svg of new Set(SIZES.map((s) => s.svg))) {
    const svgMarkup = readFileSync(path.join(HERE, svg), 'utf8').replace(
      '<svg ',
      `<svg style="display:block" width="${SOURCE_SIZE}" height="${SOURCE_SIZE}" `,
    );
    const htmlPath = path.join(work, `${svg}.html`);
    writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0">${svgMarkup}</body></html>`);
    capture(htmlPath, path.join(work, `${svg}.png`), SOURCE_SIZE);
  }

  // Pass 2: downscale to each target size, verify, install.
  for (const { size, svg } of SIZES) {
    const htmlPath = path.join(work, `${size}.html`);
    const pngPath = path.join(work, `${size}.png`);
    writeFileSync(
      htmlPath,
      `<!doctype html><html><body style="margin:0"><img src="${svg}.png" style="display:block" width="${size}" height="${size}"></body></html>`,
    );
    capture(htmlPath, pngPath, size);

    // Verify before installing: exact dimensions, an alpha channel that is
    // actually used (all four corner pixels of the rounded rect must be fully
    // transparent), and an opaque center.
    const png = PNG.sync.read(readFileSync(pngPath));
    if (png.width !== size || png.height !== size) {
      throw new Error(`${size}.png is ${png.width}x${png.height}, expected ${size}x${size}`);
    }
    const alphaAt = (x, y) => png.data[(y * png.width + x) * 4 + 3];
    const n = size - 1;
    for (const [x, y] of [[0, 0], [n, 0], [0, n], [n, n]]) {
      const a = alphaAt(x, y);
      if (a !== 0) throw new Error(`${size}.png corner (${x},${y}) alpha is ${a}, expected 0`);
    }
    const center = alphaAt(size >> 1, size >> 1);
    if (center !== 255) throw new Error(`${size}.png center alpha is ${center}, expected 255`);

    const dest = path.join(ICON_DIR, `${size}.png`);
    copyFileSync(pngPath, dest);
    console.log(`${dest} ← ${svg} @ ${size}px (corner α=0 ×4, center α=255)`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
