import type { Mat3, Vec3 } from '../types';

/**
 * Brettel, Viénot & Mollon 1997, "Computerized simulation of color appearance
 * for dichromats" — tritan two-half-plane projection in linear RGB (row-major).
 * dot(BRETTEL_TRITAN_SEP, rgbLinear) >= 0 selects M1, else M2.
 *
 * Constants from libDaltonLens (public domain):
 * https://github.com/DaltonLens/libDaltonLens/blob/master/libDaltonLens.c
 */
export const BRETTEL_TRITAN_M1: Mat3 = [
  1.01277, 0.13548, -0.14826,
  -0.01243, 0.86812, 0.14431,
  0.07589, 0.805, 0.11911,
];

export const BRETTEL_TRITAN_M2: Mat3 = [
  0.93678, 0.18979, -0.12657,
  0.06154, 0.81526, 0.1232,
  -0.37562, 1.12767, 0.24796,
];

export const BRETTEL_TRITAN_SEP: Vec3 = [0.03901, -0.02788, -0.01113];
