/** Supported color-vision-deficiency types. */
export type CvdType = 'protan' | 'deutan' | 'tritan' | 'achromatopsia';

/** An sRGB color, channels in 0–255. */
export type RGBTuple = readonly [number, number, number];

/** A linear-RGB color, channels in 0–1. */
export type Vec3 = readonly [number, number, number];

/** A 3×3 matrix in row-major order. */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * A resolved simulation model operating in linear RGB: either a single
 * matrix, or Brettel 1997's two half-plane projections with a separation
 * plane normal (dot(sep, rgbLinear) >= 0 selects m1, else m2).
 */
export type SimModel =
  | { kind: 'matrix'; matrix: Mat3 }
  | { kind: 'brettel'; m1: Mat3; m2: Mat3; sep: Vec3 };

/** An SVG filter rendering of a simulation model, in several delivery forms. */
export interface SvgFilter {
  /** The filter element id, e.g. "dichroma-deutan-100". */
  id: string;
  /** The bare `<filter>…</filter>` markup. */
  markup: string;
  /** The markup wrapped in a standalone `<svg>` document. */
  svg: string;
  /** `data:image/svg+xml,…#id` URL referencing the filter. */
  dataUrl: string;
  /** `url("data:…#id")` for use as a CSS `filter` value. */
  cssDataUrl: string;
  /** `url(#id)` for use as a CSS `filter` value with inline-injected markup. */
  cssInline: string;
}
