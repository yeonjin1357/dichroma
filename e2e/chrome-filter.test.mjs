// Browser e2e: @dichroma/core's buildSvgFilter vs simulateColor in real Chrome.
// Permanent encoding of the M0 verification harness: renders 12 swatches under
// each filter (inline-SVG and data-URL CSS variants), screenshots with headless
// Chrome, and compares every swatch center pixel to the pure-function
// reference. PASS threshold: max per-channel |delta| <= 3.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { buildSvgFilter, simulateColor } from '@dichroma/core';

const FALLBACK_CHROME = '/home/yeonjin/.cache/ms-playwright/chromium-1224/chrome-linux64/chrome';
// CHROME_BIN semantics: set-but-invalid is a hard error (a CI typo must not
// silently skip the suite); empty string is treated as unset; skip only when
// neither CHROME_BIN nor the fallback path exists.
const envChrome = process.env.CHROME_BIN || null;
if (envChrome && !existsSync(envChrome)) {
  console.error(`ERROR: CHROME_BIN points to "${envChrome}" but no such file exists.`);
  process.exit(1);
}
const chrome = envChrome ?? (existsSync(FALLBACK_CHROME) ? FALLBACK_CHROME : null);
if (!chrome) {
  console.log('SKIP: no Chrome binary found (set CHROME_BIN or install playwright chromium).');
  process.exit(0);
}

const COMBOS = [
  ['tritan', 1.0],
  ['deutan', 1.0],
  ['protan', 0.5],
  ['achromatopsia', 1.0],
];

const SWATCHES = [
  [255, 255, 255], [0, 0, 255], [255, 255, 0], [255, 0, 0],
  [0, 128, 0], [255, 0, 255], [0, 255, 255], [255, 165, 0],
  [128, 128, 128], [128, 0, 128], [255, 192, 203], [0, 128, 128],
];

const swatchDivs = SWATCHES.map(([r, g, b]) => `<div class="s" style="background:rgb(${r},${g},${b})"></div>`).join('');
const grid = `<div style="display:grid;grid-template-columns:repeat(4,120px)">${swatchDivs}</div>`;
const baseCss = 'body{margin:0} .s{width:120px;height:120px}';

const tmp = mkdtempSync(join(tmpdir(), 'dichroma-e2e-'));
let runId = 0;

function screenshotSwatches(html) {
  const id = runId++;
  const htmlPath = join(tmp, `page-${id}.html`);
  const pngPath = join(tmp, `page-${id}.png`);
  writeFileSync(htmlPath, html);
  // NOTE: no --user-data-dir. The pinned Playwright Chromium (149.0.7827.3)
  // hangs forever in headless --screenshot mode when given a custom profile
  // dir (GPU CreateCommandBuffer failure, frame never produced), regardless
  // of --disable-gpu/--in-process-gpu. All page/screenshot artifacts live in
  // the mkdtemp dir, which is removed on exit.
  execFileSync(chrome, [
    '--headless', '--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars',
    '--window-size=520,400', `--screenshot=${pngPath}`,
    `file://${htmlPath}`,
  ], { stdio: 'pipe', timeout: 60_000 });
  const png = PNG.sync.read(readFileSync(pngPath));
  return SWATCHES.map((_, i) => {
    const x = (i % 4) * 120 + 60;
    const y = Math.floor(i / 4) * 120 + 60;
    const o = (png.width * y + x) * 4;
    return [png.data[o], png.data[o + 1], png.data[o + 2]];
  });
}

let failed = false;
try {
  // Sanity: an unfiltered page must render the swatches verbatim
  // (catches sampling / color-profile bugs in the harness itself).
  const plain = screenshotSwatches(
    `<!doctype html><html><head><style>${baseCss}</style></head><body>${grid}</body></html>`,
  );
  const sane = SWATCHES.every((s, i) => s.every((c, k) => Math.abs(c - plain[i][k]) <= 1));
  console.log(`sanity (unfiltered swatches exact): ${sane ? 'PASS' : 'FAIL'}`);
  if (!sane) failed = true;

  for (const [type, severity] of COMBOS) {
    const filter = buildSvgFilter(type, severity);
    const expected = SWATCHES.map((s) => simulateColor(s, type, severity));
    const variants = {
      cssInline:
        `<!doctype html><html><head><style>${baseCss} html{filter:${filter.cssInline}}</style></head>` +
        `<body><svg width="0" height="0" style="position:absolute">${filter.markup}</svg>${grid}</body></html>`,
      cssDataUrl:
        `<!doctype html><html><head><style>${baseCss} html{filter:${filter.cssDataUrl}}</style></head>` +
        `<body>${grid}</body></html>`,
    };
    for (const [variant, html] of Object.entries(variants)) {
      const got = screenshotSwatches(html);
      let maxDelta = 0;
      for (let i = 0; i < SWATCHES.length; i++) {
        for (let k = 0; k < 3; k++) {
          maxDelta = Math.max(maxDelta, Math.abs(got[i][k] - expected[i][k]));
        }
      }
      const ok = maxDelta <= 3;
      if (!ok) failed = true;
      console.log(
        `${type}/${severity} ${variant}: max |delta| = ${maxDelta} ${ok ? 'PASS' : 'FAIL'} (threshold 3)`,
      );
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failed) {
  console.error('VERDICT: FAIL');
  process.exit(1);
}
console.log('VERDICT: PASS');
