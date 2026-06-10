import { resolveModel, simulateLinear } from './model';
import { LINEAR_LUT, linearToSrgb } from './srgb';
import type { CvdType, RGBTuple } from './types';

/** Simulate one 8-bit sRGB color as seen with the given CVD type/severity. */
export function simulateColor(srgb: RGBTuple, type: CvdType, severity = 1): RGBTuple {
  const model = resolveModel(type, severity);
  const out = simulateLinear(
    [LINEAR_LUT[srgb[0]], LINEAR_LUT[srgb[1]], LINEAR_LUT[srgb[2]]],
    model,
  );
  return [linearToSrgb(out[0]), linearToSrgb(out[1]), linearToSrgb(out[2])];
}

/** Simulate an RGBA pixel buffer in place (alpha untouched). */
export function simulateImageData(
  data: Uint8ClampedArray,
  type: CvdType,
  severity = 1,
): void {
  const model = resolveModel(type, severity);
  for (let i = 0; i + 3 < data.length; i += 4) {
    const out = simulateLinear(
      [LINEAR_LUT[data[i]], LINEAR_LUT[data[i + 1]], LINEAR_LUT[data[i + 2]]],
      model,
    );
    data[i] = linearToSrgb(out[0]);
    data[i + 1] = linearToSrgb(out[1]);
    data[i + 2] = linearToSrgb(out[2]);
  }
}
