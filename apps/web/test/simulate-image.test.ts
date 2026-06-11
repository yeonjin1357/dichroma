import { simulateColor } from '@dichroma/core';
import { describe, expect, it } from 'vitest';
import { simulateImageDataCopy } from '../src/lib/simulate-image';

// 2×2 RGBA fixture: pure red, pure green, mid gray (semi-transparent), white.
const FIXTURE = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
    128, 128, 128, 64,
    255, 255, 255, 0,
  ]),
};

describe('simulateImageDataCopy', () => {
  it('matches per-pixel simulateColor for every pixel', () => {
    for (const type of ['protan', 'deutan', 'tritan', 'achromatopsia'] as const) {
      for (const severity of [0.5, 1]) {
        const out = simulateImageDataCopy(FIXTURE, type, severity);
        for (let i = 0; i < FIXTURE.data.length; i += 4) {
          const expected = simulateColor(
            [FIXTURE.data[i], FIXTURE.data[i + 1], FIXTURE.data[i + 2]],
            type,
            severity,
          );
          expect([out[i], out[i + 1], out[i + 2]], `${type}@${severity} px ${i / 4}`).toEqual([
            ...expected,
          ]);
        }
      }
    }
  });

  it('preserves alpha byte for byte', () => {
    const out = simulateImageDataCopy(FIXTURE, 'deutan', 1);
    for (let i = 3; i < FIXTURE.data.length; i += 4) {
      expect(out[i]).toBe(FIXTURE.data[i]);
    }
  });

  it('returns a NEW array and leaves the input untouched', () => {
    const before = [...FIXTURE.data];
    const out = simulateImageDataCopy(FIXTURE, 'tritan', 1);
    expect(out).not.toBe(FIXTURE.data);
    expect(out).toBeInstanceOf(Uint8ClampedArray);
    expect([...FIXTURE.data]).toEqual(before);
  });

  it('severity 0 is an identity copy', () => {
    const out = simulateImageDataCopy(FIXTURE, 'protan', 0);
    expect([...out]).toEqual([...FIXTURE.data]);
  });
});
