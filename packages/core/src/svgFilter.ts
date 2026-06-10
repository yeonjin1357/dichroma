import { resolveModel } from './model';
import type { CvdType, Mat3, SvgFilter, Vec3 } from './types';

/** Format a number with up to 5 decimals, trailing zeros trimmed (snapshot-stable). */
function fmt(n: number): string {
  const s = n.toFixed(5).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

/** Expand a 3×3 linear-RGB matrix to feColorMatrix's 4×5 values string. */
function matrixValues(m: Mat3): string {
  const rows = [
    [m[0], m[1], m[2], 0, 0],
    [m[3], m[4], m[5], 0, 0],
    [m[6], m[7], m[8], 0, 0],
    [0, 0, 0, 1, 0],
  ];
  return rows.map((row) => row.map(fmt).join(' ')).join('  ');
}

/**
 * Separation-plane values string: RGB rows zeroed, alpha row = 100·sep with a
 * +0.5 offset so the discrete feFuncA step lands at dot(sep, rgb) = 0.
 * Always uses the UNFOLDED separation normal (severity folding never moves
 * the plane).
 */
function sepValues(sep: Vec3): string {
  const alphaRow = [100 * sep[0], 100 * sep[1], 100 * sep[2], 0, 0.5].map(fmt).join(' ');
  return `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${alphaRow}`;
}

/**
 * Build an SVG filter equivalent to `resolveModel(type, severity)`. Matrix
 * models become a single feColorMatrix; the Brettel tritan model becomes a
 * verified 7-primitive graph that projects with both half-plane matrices and
 * composites them through a discrete separation-plane mask.
 */
export function buildSvgFilter(
  type: CvdType,
  severity = 1,
  opts?: { idPrefix?: string },
): SvgFilter {
  const s = Math.min(1, Math.max(0, severity));
  const id = `${opts?.idPrefix ?? 'dichroma'}-${type}-${Math.round(s * 100)}`;
  const model = resolveModel(type, s);

  const markup =
    model.kind === 'matrix'
      ? `<filter id="${id}" color-interpolation-filters="linearRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="${matrixValues(model.matrix)}"/></filter>`
      : `<filter id="${id}" color-interpolation-filters="linearRGB">
  <feColorMatrix in="SourceGraphic" type="matrix" result="projA" values="${matrixValues(model.m1)}"/>
  <feColorMatrix in="SourceGraphic" type="matrix" result="projB" values="${matrixValues(model.m2)}"/>
  <feColorMatrix in="SourceGraphic" type="matrix" result="sep" values="${sepValues(model.sep)}"/>
  <feComponentTransfer in="sep" result="mask"><feFuncA type="discrete" tableValues="0 1"/></feComponentTransfer>
  <feComposite in="projA" in2="mask" operator="in" result="maskedA"/>
  <feComposite in="projB" in2="mask" operator="out" result="maskedB"/>
  <feComposite in="maskedA" in2="maskedB" operator="over"/>
</filter>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`;
  const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}#${id}`;
  return {
    id,
    markup,
    svg,
    dataUrl,
    cssDataUrl: `url("${dataUrl}")`,
    cssInline: `url(#${id})`,
  };
}
