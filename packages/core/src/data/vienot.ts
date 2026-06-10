import type { Mat3 } from '../types';

/**
 * Viénot, Brettel & Mollon 1999, "Digital video colourmaps for checking the
 * legibility of displays by dichromats" — full-dichromacy projection matrices
 * in linear RGB (row-major).
 *
 * Constants from libDaltonLens (public domain):
 * https://github.com/DaltonLens/libDaltonLens/blob/master/libDaltonLens.c
 */
export const VIENOT_PROTAN: Mat3 = [
  0.11238, 0.88762, 0,
  0.11238, 0.88762, 0,
  0.00401, -0.00401, 1,
];

export const VIENOT_DEUTAN: Mat3 = [
  0.29275, 0.70725, 0,
  0.29275, 0.70725, 0,
  -0.02234, 0.02234, 1,
];
