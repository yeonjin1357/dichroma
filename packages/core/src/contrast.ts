import { resolveModel, simulateLinear } from './model';
import { srgbToLinear } from './srgb';
import type { CvdType, RGBTuple, Vec3 } from './types';

const luminanceOf = (v: Vec3): number => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];

const toLinear = (srgb: RGBTuple): Vec3 => [
  srgbToLinear(srgb[0]),
  srgbToLinear(srgb[1]),
  srgbToLinear(srgb[2]),
];

const ratio = (la: number, lb: number): number =>
  (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);

/** WCAG relative luminance (Rec.709 weights over linearized channels). */
export function relativeLuminance(srgb: RGBTuple): number {
  return luminanceOf(toLinear(srgb));
}

/** WCAG contrast ratio (Lhi + 0.05) / (Llo + 0.05), in 1–21. */
export function wcagRatio(fg: RGBTuple, bg: RGBTuple): number {
  return ratio(relativeLuminance(fg), relativeLuminance(bg));
}

/**
 * WCAG contrast ratio as perceived under the given CVD simulation. Luminance
 * is taken directly from the simulated linear values (no 8-bit roundtrip);
 * simulateLinear clamps them to [0,1].
 */
export function simulatedWcagRatio(
  fg: RGBTuple,
  bg: RGBTuple,
  type: CvdType,
  severity = 1,
): number {
  const model = resolveModel(type, severity);
  return ratio(
    luminanceOf(simulateLinear(toLinear(fg), model)),
    luminanceOf(simulateLinear(toLinear(bg), model)),
  );
}

/**
 * Composite a translucent foreground over an opaque background in gamma
 * space (CSS default compositing); alpha in [0,1].
 */
export function compositeOver(
  fgRgba: readonly [number, number, number, number],
  bg: RGBTuple,
): RGBTuple {
  const a = Math.min(1, Math.max(0, fgRgba[3]));
  return [
    Math.round(fgRgba[0] * a + bg[0] * (1 - a)),
    Math.round(fgRgba[1] * a + bg[1] * (1 - a)),
    Math.round(fgRgba[2] * a + bg[2] * (1 - a)),
  ];
}
