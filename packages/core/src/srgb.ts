/** Decode one 8-bit sRGB channel (0–255) to linear light (0–1). */
export function srgbToLinear(c8: number): number {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Encode one linear-light channel (0–1, clamped) to a rounded 8-bit sRGB value. */
export function linearToSrgb(c: number): number {
  const v = c < 0 ? 0 : c > 1 ? 1 : c;
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
}

/** srgbToLinear of every byte value, for fast 8-bit decode. */
export const LINEAR_LUT: Float64Array = Float64Array.from({ length: 256 }, (_, i) =>
  srgbToLinear(i),
);
