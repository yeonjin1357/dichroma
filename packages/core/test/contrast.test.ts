import { describe, expect, it } from 'vitest';
import { compositeOver, relativeLuminance, simulatedWcagRatio, wcagRatio } from '../src/contrast';
import type { RGBTuple } from '../src/types';

const BLACK: RGBTuple = [0, 0, 0];
const WHITE: RGBTuple = [255, 255, 255];

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 12);
  });
});

describe('wcagRatio', () => {
  it('is 21 for black on white', () => {
    expect(wcagRatio(BLACK, WHITE)).toBeCloseTo(21, 9);
  });

  it('is ≈4.54 for #767676 on white (±0.01)', () => {
    expect(Math.abs(wcagRatio([0x76, 0x76, 0x76], WHITE) - 4.54)).toBeLessThanOrEqual(0.01);
  });

  it('is symmetric', () => {
    const pairs: [RGBTuple, RGBTuple][] = [
      [BLACK, WHITE],
      [
        [255, 0, 0],
        [0, 128, 0],
      ],
      [
        [12, 34, 56],
        [200, 180, 20],
      ],
    ];
    for (const [a, b] of pairs) {
      expect(wcagRatio(a, b)).toBe(wcagRatio(b, a));
    }
  });
});

describe('simulatedWcagRatio', () => {
  it('collapses red/green contrast for deutan at severity 1', () => {
    const red: RGBTuple = [255, 0, 0];
    // NOTE: pure green [0,255,0], not CSS 'green' [0,128,0]. For the
    // half-intensity green the deutan projection RAISES the luminance ratio
    // (red brightens toward yellow more than the dark green darkens) —
    // verified against DaltonLens-Python, so only the full-intensity pair
    // exhibits the luminance collapse.
    const green: RGBTuple = [0, 255, 0];
    expect(simulatedWcagRatio(red, green, 'deutan', 1)).toBeLessThan(wcagRatio(red, green));
  });

  it('equals wcagRatio at severity 0 (identity)', () => {
    const fg: RGBTuple = [255, 0, 0];
    const bg: RGBTuple = [0, 128, 0];
    for (const type of ['protan', 'deutan', 'tritan', 'achromatopsia'] as const) {
      expect(simulatedWcagRatio(fg, bg, type, 0)).toBeCloseTo(wcagRatio(fg, bg), 12);
    }
  });
});

describe('compositeOver', () => {
  it('returns the foreground at alpha 1 and the background at alpha 0', () => {
    expect(compositeOver([10, 20, 30, 1], [200, 100, 50])).toEqual([10, 20, 30]);
    expect(compositeOver([10, 20, 30, 0], [200, 100, 50])).toEqual([200, 100, 50]);
  });

  it('blends in gamma space at alpha 0.5', () => {
    expect(compositeOver([0, 0, 0, 0.5], [255, 255, 255])).toEqual([128, 128, 128]);
    expect(compositeOver([100, 200, 30, 0.25], [0, 0, 0])).toEqual([25, 50, 8]);
  });
});
