import { describe, expect, it } from 'vitest';
import { simulateColor, simulateImageData } from '../src/simulate';
import type { CvdType, RGBTuple } from '../src/types';

// Deterministic LCG so failures are reproducible.
function makeRand(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state >>> 24; // 0..255
  };
}

describe('simulateImageData', () => {
  const combos: [CvdType, number][] = [
    ['protan', 1],
    ['deutan', 0.7],
    ['tritan', 0.7],
    ['achromatopsia', 1],
  ];

  it.each(combos)('matches per-pixel simulateColor byte-for-byte (%s, severity %d)', (type, severity) => {
    const rand = makeRand(0x12345678);
    const original = new Uint8ClampedArray(64 * 4);
    for (let i = 0; i < original.length; i++) original[i] = rand();

    const data = new Uint8ClampedArray(original);
    simulateImageData(data, type, severity);

    for (let p = 0; p < 64; p++) {
      const o = p * 4;
      const srgb: RGBTuple = [original[o], original[o + 1], original[o + 2]];
      const want = simulateColor(srgb, type, severity);
      expect([data[o], data[o + 1], data[o + 2]], `pixel ${p} rgb`).toEqual([...want]);
      expect(data[o + 3], `pixel ${p} alpha`).toBe(original[o + 3]);
    }
  });
});
