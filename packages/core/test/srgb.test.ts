import { describe, expect, it } from 'vitest';
import { LINEAR_LUT, linearToSrgb, srgbToLinear } from '../src/srgb';

describe('srgbToLinear', () => {
  it('maps the endpoints exactly', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(255)).toBe(1);
  });

  it('uses the linear segment below the knee', () => {
    // 10/255 ≈ 0.0392 <= 0.04045 -> c/12.92
    expect(srgbToLinear(10)).toBeCloseTo(10 / 255 / 12.92, 12);
  });

  it('uses the power segment above the knee', () => {
    expect(srgbToLinear(128)).toBeCloseTo(((128 / 255 + 0.055) / 1.055) ** 2.4, 12);
  });
});

describe('linearToSrgb', () => {
  it('round-trips every byte value', () => {
    for (let i = 0; i < 256; i++) {
      expect(linearToSrgb(srgbToLinear(i))).toBe(i);
    }
  });

  it('clamps out-of-range input', () => {
    expect(linearToSrgb(-0.5)).toBe(0);
    expect(linearToSrgb(1.5)).toBe(255);
  });
});

describe('LINEAR_LUT', () => {
  it('is a 256-entry Float64Array matching srgbToLinear', () => {
    expect(LINEAR_LUT).toBeInstanceOf(Float64Array);
    expect(LINEAR_LUT.length).toBe(256);
    for (let i = 0; i < 256; i++) {
      expect(LINEAR_LUT[i]).toBe(srgbToLinear(i));
    }
  });
});
