import { describe, expect, it } from 'vitest';
import { buildSvgFilter } from '../src/svgFilter';
import type { CvdType } from '../src/types';

const TYPES: CvdType[] = ['protan', 'deutan', 'tritan', 'achromatopsia'];
const SEVERITIES = [0.5, 1.0];

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('buildSvgFilter snapshots', () => {
  for (const type of TYPES) {
    for (const severity of SEVERITIES) {
      it(`${type} severity ${severity}: markup`, () => {
        expect(buildSvgFilter(type, severity).markup).toMatchSnapshot();
      });
      it(`${type} severity ${severity}: dataUrl`, () => {
        expect(buildSvgFilter(type, severity).dataUrl).toMatchSnapshot();
      });
    }
  }
});

describe('buildSvgFilter properties', () => {
  it('matrix-kind markup contains exactly one feColorMatrix', () => {
    for (const type of ['protan', 'deutan', 'achromatopsia'] as const) {
      for (const severity of SEVERITIES) {
        const { markup } = buildSvgFilter(type, severity);
        expect(count(markup, '<feColorMatrix'), `${type} ${severity}`).toBe(1);
        expect(markup).toContain('color-interpolation-filters="linearRGB"');
        expect(markup).toContain('in="SourceGraphic"');
      }
    }
  });

  it('brettel markup contains the 7-primitive graph', () => {
    for (const severity of SEVERITIES) {
      const { markup } = buildSvgFilter('tritan', severity);
      expect(count(markup, '<feColorMatrix')).toBe(3);
      expect(count(markup, '<feComponentTransfer')).toBe(1);
      expect(count(markup, '<feComposite')).toBe(3);
      expect(markup).toContain('color-interpolation-filters="linearRGB"');
      expect(markup).toContain('<feFuncA type="discrete" tableValues="0 1"/>');
      // the separation alpha row uses the UNFOLDED normal at every severity
      expect(markup).toContain('3.901 -2.788 -1.113 0 0.5');
    }
  });

  it('derives id, svg, dataUrl, cssDataUrl, and cssInline consistently', () => {
    const f = buildSvgFilter('deutan', 0.5);
    expect(f.id).toBe('dichroma-deutan-50');
    expect(f.svg).toBe(`<svg xmlns="http://www.w3.org/2000/svg">${f.markup}</svg>`);
    expect(f.dataUrl).toBe(`data:image/svg+xml,${encodeURIComponent(f.svg)}#${f.id}`);
    expect(f.cssDataUrl).toBe(`url("${f.dataUrl}")`);
    expect(f.cssInline).toBe(`url(#${f.id})`);
  });

  it('honors opts.idPrefix', () => {
    const f = buildSvgFilter('tritan', 1, { idPrefix: 'custom' });
    expect(f.id).toBe('custom-tritan-100');
    expect(f.markup).toContain('id="custom-tritan-100"');
  });
});
