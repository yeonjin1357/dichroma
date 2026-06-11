// Regenerates the figures for docs/validation-{ko,en}.md:
//
//   node docs/img/make-figures.mjs
//
//   linear-vs-srgb.png   — swatch grid: original colors, Viénot protan applied
//                          correctly (matrix in linear RGB, via @dichroma/core),
//                          and the common mistake (same matrix multiplied
//                          straight onto gamma-encoded sRGB bytes). The wrong
//                          row is actually computed here, not mocked.
//   validation-chain.png — the four-step verification-chain diagram.
//
// It also copies the two store screenshots the articles reuse
// (01-simulation-before-after.png, 03-audit-panel.png) from
// store-assets/screenshots/ so docs/img/ is self-contained.
//
// Raster pipeline: same pattern as store-assets/icons/generate.mjs — an HTML
// template screenshotted by headless Chromium (--force-color-profile=srgb so
// the captured bytes equal the CSS colors), pngjs only for verification.
// Dev-only script: reuses pngjs + the Playwright Chromium from the e2e
// package (no new dependencies). Override the browser with CHROME_BIN.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const e2eRequire = createRequire(pathToFileURL(path.join(ROOT, 'e2e/package.json')));
const { PNG } = e2eRequire('pngjs');
const CHROME =
  process.env.CHROME_BIN ?? e2eRequire('@playwright/test').chromium.executablePath();

const core = await import(
  pathToFileURL(path.join(ROOT, 'packages/core/dist/index.js')).href
);
const { simulateColor, resolveModel } = core;

const work = mkdtempSync(path.join(tmpdir(), 'dichroma-figures-'));

function capture(name, html, width, height) {
  const htmlPath = path.join(work, `${name}.html`);
  const pngPath = path.join(HERE, `${name}.png`);
  writeFileSync(htmlPath, html);
  execFileSync(
    CHROME,
    [
      '--headless',
      '--no-sandbox',
      '--force-color-profile=srgb',
      '--hide-scrollbars',
      `--window-size=${width},${height}`,
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { stdio: 'pipe', timeout: 60_000 },
  );
  const png = PNG.sync.read(readFileSync(pngPath));
  if (png.width !== width || png.height !== height) {
    throw new Error(`${name}.png is ${png.width}x${png.height}, expected ${width}x${height}`);
  }
  return { pngPath, png };
}

const pixelAt = (png, x, y) => {
  const o = (png.width * y + x) * 4;
  return [png.data[o], png.data[o + 1], png.data[o + 2]];
};

// ---------------------------------------------------------------------------
// Figure 1: linear-vs-srgb.png
// ---------------------------------------------------------------------------

// The WRONG variant many tools ship: the Viénot 1999 protan matrix (defined
// for LINEAR RGB) multiplied directly onto gamma-encoded sRGB bytes.
const protanMatrix = resolveModel('protan', 1).matrix;
const clampByte = (v) => Math.round(Math.min(255, Math.max(0, v)));
const wrongSrgbDirect = ([r, g, b]) => [
  clampByte(protanMatrix[0] * r + protanMatrix[1] * g + protanMatrix[2] * b),
  clampByte(protanMatrix[3] * r + protanMatrix[4] * g + protanMatrix[5] * b),
  clampByte(protanMatrix[6] * r + protanMatrix[7] * g + protanMatrix[8] * b),
];

const SWATCHES = [
  [255, 0, 0],
  [255, 165, 0],
  [0, 128, 0],
  [0, 0, 255],
  [255, 0, 255],
  [128, 128, 128],
];

const ROWS = [
  { label: 'Original', color: (s) => s },
  { label: 'Protanopia — correct\n(Viénot matrix in linear RGB)', color: (s) => simulateColor(s, 'protan', 1) },
  { label: 'Protanopia — wrong\n(same matrix on gamma sRGB)', color: wrongSrgbDirect },
];

// Fixed metrics so verification can sample exact swatch centers.
const PAD = 24;
const LABEL_W = 300;
const SW = 96;
const SH = 72;
const GAP = 10;
const VALUE_H = 20;
const ROW_GAP = 18;
const FIG1_W = PAD + LABEL_W + SWATCHES.length * SW + (SWATCHES.length - 1) * GAP + PAD;
const ROW_H = SH + VALUE_H;
const FIG1_H = PAD + ROWS.length * ROW_H + (ROWS.length - 1) * ROW_GAP + PAD;

const fig1Rows = ROWS.map((row, ri) => {
  const top = PAD + ri * (ROW_H + ROW_GAP);
  const label = row.label
    .split('\n')
    .map((l, i) => (i === 0 ? `<div class="t">${l}</div>` : `<div class="u">${l}</div>`))
    .join('');
  const cells = SWATCHES.map((s, ci) => {
    const [r, g, b] = row.color(s);
    const left = PAD + LABEL_W + ci * (SW + GAP);
    return (
      `<div class="sw" style="left:${left}px;top:${top}px;background:rgb(${r},${g},${b})"></div>` +
      `<div class="v" style="left:${left}px;top:${top + SH}px">${r},${g},${b}</div>`
    );
  }).join('');
  return `<div class="lb" style="left:${PAD}px;top:${top}px;height:${SH}px">${label}</div>${cells}`;
}).join('');

const fig1Html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;width:${FIG1_W}px;height:${FIG1_H}px;background:#fff;
       font-family:system-ui,-apple-system,sans-serif;position:relative}
  .sw{position:absolute;width:${SW}px;height:${SH}px;border-radius:6px}
  .v{position:absolute;width:${SW}px;height:${VALUE_H}px;line-height:${VALUE_H}px;
     font-family:ui-monospace,monospace;font-size:11px;color:#667;text-align:center}
  .lb{position:absolute;width:${LABEL_W - 16}px;display:flex;flex-direction:column;justify-content:center}
  .t{font-size:15px;font-weight:600;color:#1a2233}
  .u{font-size:12px;color:#5b6470;margin-top:3px}
</style></head><body>${fig1Rows}</body></html>`;

{
  const { pngPath, png } = capture('linear-vs-srgb', fig1Html, FIG1_W, FIG1_H);
  // Verify the captured pixels ARE the computed colors (red column, all rows).
  const centerOf = (ri) => [
    PAD + LABEL_W + SW / 2,
    PAD + ri * (ROW_H + ROW_GAP) + SH / 2,
  ];
  const expect = [
    [255, 0, 0],
    simulateColor([255, 0, 0], 'protan', 1), // [94, 94, 13]
    wrongSrgbDirect([255, 0, 0]), // [29, 29, 1]
  ];
  expect.forEach((want, ri) => {
    const got = pixelAt(png, ...centerOf(ri));
    if (want.some((c, k) => Math.abs(c - got[k]) > 1)) {
      throw new Error(`linear-vs-srgb row ${ri}: got ${got}, expected ${want}`);
    }
  });
  console.log(`${pngPath} (${FIG1_W}x${FIG1_H}; red column verified: ${expect.map((e) => `[${e}]`).join(' ')})`);
}

// ---------------------------------------------------------------------------
// Figure 2: validation-chain.png
// ---------------------------------------------------------------------------

const STEPS = [
  {
    n: '1',
    title: 'Model math',
    sub: 'SVG filter graph ≡ pure function, emulated in Node',
    metric: '17³ colors · max Δ = 0',
    w: 560,
  },
  {
    n: '2',
    title: 'Golden test',
    sub: 'vs DaltonLens-Python (git-pinned)',
    metric: '17³ grid × 9 combos · Δ ≤ 1/255',
    w: 660,
  },
  {
    n: '3',
    title: 'Real-browser pixels',
    sub: 'headless Chrome render vs pure function',
    metric: '4 combos × 2 embeddings · Δ ≤ 3/255',
    w: 760,
  },
  {
    n: '4',
    title: 'Permanent regression',
    sub: '191 unit tests + Playwright e2e',
    metric: 'runs on every change',
    w: 860,
  },
];

const FIG2_W = 960;
const FIG2_H = 30 + STEPS.length * 100 + (STEPS.length - 1) * 14 + 30;

const fig2Boxes = STEPS.map((s, i) => {
  const top = 30 + i * 114;
  return `<div class="box" style="width:${s.w}px;top:${top}px;left:${(FIG2_W - s.w) / 2}px">
    <div class="badge">${s.n}</div>
    <div class="txt"><div class="title">${s.title}</div><div class="sub">${s.sub}</div></div>
    <div class="metric">${s.metric}</div>
  </div>${i < STEPS.length - 1 ? `<div class="arrow" style="top:${top + 100}px">▼</div>` : ''}`;
}).join('');

const fig2Html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;width:${FIG2_W}px;height:${FIG2_H}px;background:#fff;
       font-family:system-ui,-apple-system,sans-serif;position:relative}
  .box{position:absolute;height:100px;box-sizing:border-box;border:2px solid #2b3a55;
       border-radius:12px;background:#f4f7fc;display:flex;align-items:center;padding:0 24px;gap:18px}
  .badge{width:40px;height:40px;border-radius:50%;background:#2b3a55;color:#fff;flex:none;
         display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:700}
  .txt{flex:1;min-width:0}
  .title{font-size:19px;font-weight:700;color:#1a2233}
  .sub{font-size:13.5px;color:#5b6470;margin-top:4px}
  .metric{font-family:ui-monospace,monospace;font-size:14px;color:#175e2e;background:#e7f4ea;
          border-radius:8px;padding:7px 12px;flex:none}
  .arrow{position:absolute;left:0;width:${FIG2_W}px;height:14px;line-height:14px;
         text-align:center;color:#8fa0b8;font-size:12px}
</style></head><body>${fig2Boxes}</body></html>`;

{
  const { pngPath, png } = capture('validation-chain', fig2Html, FIG2_W, FIG2_H);
  const corner = pixelAt(png, 2, 2);
  if (corner.some((c) => c !== 255)) {
    throw new Error(`validation-chain corner pixel is ${corner}, expected white`);
  }
  console.log(`${pngPath} (${FIG2_W}x${FIG2_H})`);
}

// ---------------------------------------------------------------------------
// Reused store screenshots
// ---------------------------------------------------------------------------

for (const file of ['01-simulation-before-after.png', '03-audit-panel.png']) {
  const src = path.join(ROOT, 'store-assets/screenshots', file);
  const dest = path.join(HERE, file);
  copyFileSync(src, dest);
  console.log(`${dest} ← store-assets/screenshots/${file}`);
}

rmSync(work, { recursive: true, force: true });
