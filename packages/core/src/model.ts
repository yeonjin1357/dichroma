import { BRETTEL_TRITAN_M1, BRETTEL_TRITAN_M2, BRETTEL_TRITAN_SEP } from './data/brettel';
import { MACHADO_DEUTAN, MACHADO_PROTAN } from './data/machado';
import { VIENOT_DEUTAN, VIENOT_PROTAN } from './data/vienot';
import type { CvdType, Mat3, SimModel, Vec3 } from './types';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// Rec.709/WCAG luminance weights in linear RGB, replicated on every row so
// the matrix maps any color to its luminance gray.
const LUMA: Mat3 = [
  0.2126, 0.7152, 0.0722,
  0.2126, 0.7152, 0.0722,
  0.2126, 0.7152, 0.0722,
];

const lerpMat = (a: Mat3, b: Mat3, t: number): Mat3 =>
  a.map((v, i) => v + (b[i] - v) * t) as unknown as Mat3;

/** fold(M, s) = s·M + (1−s)·I */
const fold = (m: Mat3, s: number): Mat3 => lerpMat(IDENTITY, m, s);

/**
 * Machado 2009 matrix for an arbitrary severity in [0, 1): element-wise
 * linear interpolation between the two bracketing 0.1-step tables, with the
 * identity matrix as the severity-0 endpoint.
 */
function machadoMatrix(table: readonly Mat3[], severity: number): Mat3 {
  const scaled = severity * 10;
  const lower = Math.floor(scaled);
  const upper = Math.min(lower + 1, 10);
  const at = (i: number): Mat3 => (i === 0 ? IDENTITY : table[i - 1]);
  return lerpMat(at(lower), at(upper), scaled - lower);
}

/**
 * Resolve a CVD type + severity to a concrete linear-RGB simulation model:
 * Viénot 1999 for full protan/deutan dichromacy, Machado 2009 for anomalous
 * protan/deutan trichromacy, Brettel 1997 (severity-folded) for tritan, and
 * an identity→luminance blend for achromatopsia.
 */
export function resolveModel(type: CvdType, severity = 1): SimModel {
  const s = Math.min(1, Math.max(0, severity));
  switch (type) {
    case 'protan':
      return {
        kind: 'matrix',
        matrix: s === 1 ? VIENOT_PROTAN : machadoMatrix(MACHADO_PROTAN, s),
      };
    case 'deutan':
      return {
        kind: 'matrix',
        matrix: s === 1 ? VIENOT_DEUTAN : machadoMatrix(MACHADO_DEUTAN, s),
      };
    case 'tritan':
      return {
        kind: 'brettel',
        m1: fold(BRETTEL_TRITAN_M1, s),
        m2: fold(BRETTEL_TRITAN_M2, s),
        sep: BRETTEL_TRITAN_SEP,
      };
    case 'achromatopsia':
      return { kind: 'matrix', matrix: lerpMat(IDENTITY, LUMA, s) };
  }
}

const clamp01 = (c: number): number => (c < 0 ? 0 : c > 1 ? 1 : c);

const applyMat = (m: Mat3, v: Vec3): Vec3 => [
  clamp01(m[0] * v[0] + m[1] * v[1] + m[2] * v[2]),
  clamp01(m[3] * v[0] + m[4] * v[1] + m[5] * v[2]),
  clamp01(m[6] * v[0] + m[7] * v[1] + m[8] * v[2]),
];

/** Apply a resolved model to one linear-RGB color; components clamped to [0,1]. */
export function simulateLinear(rgb: Vec3, model: SimModel): Vec3 {
  if (model.kind === 'matrix') return applyMat(model.matrix, rgb);
  const onM1Side =
    model.sep[0] * rgb[0] + model.sep[1] * rgb[1] + model.sep[2] * rgb[2] >= 0;
  return applyMat(onM1Side ? model.m1 : model.m2, rgb);
}
