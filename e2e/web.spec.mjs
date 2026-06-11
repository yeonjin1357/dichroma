// Web app e2e: build apps/web, serve the dist with a tiny static node:http
// server that honors the production '/dichroma/' base path (simplest reliable
// option — `vite preview` would need a workspace exec per worker and another
// port-picking dance), then drive the real page in Chromium.
//
// Pixel ground truth: the built-in sample image draws a solid #ff0000 bar
// whose region is exported from apps/web/src/lib/sample-image.ts as
// {x:24, y:168, w:88, h:108} — RED_CENTER below is its center; keep in sync.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';
import { simulateColor, simulatedWcagRatio, wcagRatio } from '@dichroma/core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(ROOT, 'apps/web/dist');
const BASE_PATH = '/dichroma/';
const RED_CENTER = { x: 68, y: 222 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** @type {import('node:http').Server} */ let server;
/** @type {import('@playwright/test').Browser} */ let browser;
/** @type {import('@playwright/test').Page} */ let page;
let baseUrl;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  execSync('pnpm --filter @dichroma/core build && pnpm --filter web build', {
    cwd: ROOT,
    stdio: 'pipe',
  });

  server = createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (!pathname.startsWith(BASE_PATH)) {
      res.statusCode = 404;
      res.end('outside base path');
      return;
    }
    const rel = pathname.slice(BASE_PATH.length) || 'index.html';
    const file = path.join(DIST, path.normalize(rel));
    if (!file.startsWith(DIST) || !existsSync(file)) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}${BASE_PATH}`;

  browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  page = await browser.newPage();
});

test.afterAll(async () => {
  await browser?.close();
  server?.close();
});

/** Read one RGB pixel from a canvas located by data-testid. */
async function readPixel(testId, { x, y }) {
  return page.getByTestId(testId).evaluate(
    (canvas, point) => {
      const d = canvas.getContext('2d').getImageData(point.x, point.y, 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    { x, y },
  );
}

test('page loads and the sample-image canvases render', async () => {
  await page.goto(baseUrl);
  await expect(page).toHaveTitle(/dichroma/);

  // Sample loads on mount; both canvases end up at its natural 480×300.
  for (const id of ['canvas-original', 'canvas-simulated']) {
    await expect(page.getByTestId(id)).toBeVisible();
    await expect.poll(() => page.getByTestId(id).evaluate((c) => c.width)).toBe(480);
  }
  // The original canvas carries the untouched pure-red sample bar.
  await expect.poll(() => readPixel('canvas-original', RED_CENTER)).toEqual([255, 0, 0]);
});

test('deutan severity-1 simulation matches simulateColor on the red region', async () => {
  await page.getByTestId('sim-type').selectOption('deutan');
  await page.getByTestId('sim-severity').fill('1');

  const expected = simulateColor([255, 0, 0], 'deutan', 1);
  expect(expected).toEqual([147, 147, 0]); // the known number from the spec

  // Severity is debounced ~100ms — poll until the simulated pixel lands
  // within ±1 per channel of the core model.
  await expect
    .poll(async () => {
      const [r, g, b] = await readPixel('canvas-simulated', RED_CENTER);
      return Math.max(
        Math.abs(r - expected[0]),
        Math.abs(g - expected[1]),
        Math.abs(b - expected[2]),
      );
    })
    .toBeLessThanOrEqual(1);
});

test('palette checker: red on black is AA for normal vision, fails under protanopia', async () => {
  await page.getByTestId('fg-hex').fill('#ff0000');
  await page.getByTestId('bg-hex').fill('#000000');

  // Cross-check the displayed numbers against core (≈5.25 and ≈3.09).
  expect(wcagRatio([255, 0, 0], [0, 0, 0]).toFixed(1)).toBe('5.3');
  expect(simulatedWcagRatio([255, 0, 0], [0, 0, 0], 'protan', 1).toFixed(1)).toBe('3.1');

  const normal = page.getByTestId('palette-row-normal');
  await expect(normal.getByTestId('ratio')).toHaveText('5.3:1');
  await expect(normal.locator('[data-badge="aa"]')).toHaveAttribute('data-pass', 'true');

  const protan = page.getByTestId('palette-row-protan');
  await expect(protan.getByTestId('ratio')).toHaveText('3.1:1');
  await expect(protan.locator('[data-badge="aa"]')).toHaveAttribute('data-pass', 'false');
});

test('language toggle switches the UI to Korean', async () => {
  await page.getByTestId('lang-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(
    page.getByText('이미지는 브라우저 밖으로 전송되지 않습니다'),
  ).toBeVisible();
});
