import { describe, expect, it } from 'vitest';
import { MACHADO_DEUTAN, MACHADO_PROTAN } from '../src/data/machado';
import { VIENOT_DEUTAN, VIENOT_PROTAN } from '../src/data/vienot';
import { resolveModel, simulateLinear } from '../src/model';
import { simulateColor } from '../src/simulate';
import { linearToSrgb, srgbToLinear } from '../src/srgb';
import type { RGBTuple } from '../src/types';

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('resolveModel severity clamp', () => {
  it('clamps severity above 1 to 1', () => {
    expect(resolveModel('protan', 5)).toEqual(resolveModel('protan', 1));
    expect(resolveModel('tritan', 99)).toEqual(resolveModel('tritan', 1));
  });

  it('clamps severity below 0 to 0 (identity)', () => {
    const model = resolveModel('deutan', -3);
    expect(model).toEqual({ kind: 'matrix', matrix: IDENTITY });
  });

  it('throws RangeError for non-finite severity', () => {
    expect(() => resolveModel('deutan', NaN)).toThrow(RangeError);
    expect(() => resolveModel('protan', Infinity)).toThrow(RangeError);
    expect(() => resolveModel('tritan', -Infinity)).toThrow(RangeError);
  });
});

describe('resolveModel routing', () => {
  it('returns Viénot exactly at severity 1 for protan/deutan (not Machado 1.0)', () => {
    const protan = resolveModel('protan', 1);
    const deutan = resolveModel('deutan', 1);
    expect(protan).toEqual({ kind: 'matrix', matrix: VIENOT_PROTAN });
    expect(deutan).toEqual({ kind: 'matrix', matrix: VIENOT_DEUTAN });
    expect(protan.kind === 'matrix' && protan.matrix).not.toEqual(MACHADO_PROTAN[9]);
    expect(deutan.kind === 'matrix' && deutan.matrix).not.toEqual(MACHADO_DEUTAN[9]);
  });

  it('interpolates Machado element-wise: s=0.25 is the midpoint of the 0.2 and 0.3 tables', () => {
    for (const [type, table] of [
      ['protan', MACHADO_PROTAN],
      ['deutan', MACHADO_DEUTAN],
    ] as const) {
      const model = resolveModel(type, 0.25);
      if (model.kind !== 'matrix') throw new Error('expected matrix model');
      const t02 = table[1]; // severity 0.2
      const t03 = table[2]; // severity 0.3
      for (let i = 0; i < 9; i++) {
        expect(model.matrix[i]).toBeCloseTo(0.5 * t02[i] + 0.5 * t03[i], 12);
      }
    }
  });

  it('uses brettel two-plane model for tritan with severity-folded matrices', () => {
    const full = resolveModel('tritan', 1);
    const half = resolveModel('tritan', 0.5);
    if (full.kind !== 'brettel' || half.kind !== 'brettel') throw new Error('expected brettel');
    // fold(M, s) = s*M + (1-s)*I
    for (let i = 0; i < 9; i++) {
      const eye = IDENTITY[i];
      expect(half.m1[i]).toBeCloseTo(0.5 * full.m1[i] + 0.5 * eye, 12);
      expect(half.m2[i]).toBeCloseTo(0.5 * full.m2[i] + 0.5 * eye, 12);
    }
    // separation plane is never folded
    expect(half.sep).toEqual(full.sep);
  });
});

describe('achromatopsia', () => {
  it('maps any color to its Rec.709 luminance gray at severity 1 (±1 after rounding)', () => {
    const samples: RGBTuple[] = [
      [255, 0, 0],
      [0, 128, 0],
      [0, 0, 255],
      [255, 165, 0],
      [12, 211, 87],
    ];
    for (const srgb of samples) {
      const out = simulateColor(srgb, 'achromatopsia', 1);
      const luma =
        0.2126 * srgbToLinear(srgb[0]) +
        0.7152 * srgbToLinear(srgb[1]) +
        0.0722 * srgbToLinear(srgb[2]);
      const expected = linearToSrgb(luma);
      for (const c of out) {
        expect(Math.abs(c - expected)).toBeLessThanOrEqual(1);
      }
      expect(Math.max(...out) - Math.min(...out)).toBeLessThanOrEqual(1);
    }
  });
});

describe('neutral fixed points', () => {
  it('keeps white and gray near-fixed for protan/deutan/tritan at severity 1', () => {
    for (const type of ['protan', 'deutan', 'tritan'] as const) {
      for (const gray of [255, 128] as const) {
        const out = simulateColor([gray, gray, gray], type, 1);
        for (const c of out) {
          expect(Math.abs(c - gray), `${type} ${gray} -> ${out}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('simulateLinear', () => {
  it('clamps components to [0,1]', () => {
    const model = resolveModel('tritan', 1);
    // saturated colors drive the Brettel projection out of gamut
    for (const v of [
      [1, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
    ] as const) {
      const out = simulateLinear(v, model);
      for (const c of out) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});
