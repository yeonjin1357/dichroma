import { buildSvgFilter } from '@dichroma/core';
import { describe, expect, it } from 'vitest';
import { BADGE, buildFilterCss, displayName } from '@/utils/simulation';

describe('buildFilterCss', () => {
  it('targets the html root with !important and the data-URL filter value', () => {
    const { css, filter } = buildFilterCss('deutan', 1);
    expect(css).toBe(`html { filter: ${filter.cssDataUrl} !important; }`);
    expect(css).toMatch(/^html \{/);
    expect(css).toContain('!important');
    expect(css).toContain('url("data:image/svg+xml,');
  });

  it('builds the same filter as @dichroma/core buildSvgFilter', () => {
    const { filter } = buildFilterCss('tritan', 0.5);
    expect(filter).toEqual(buildSvgFilter('tritan', 0.5));
  });
});

describe('BADGE', () => {
  it('maps each CVD type to its single-letter badge', () => {
    expect(BADGE).toEqual({ protan: 'P', deutan: 'D', tritan: 'T', achromatopsia: 'A' });
  });
});

describe('displayName', () => {
  it('uses dichromacy (-opia) names at severity 1', () => {
    expect(displayName('protan', 1)).toBe('Protanopia');
    expect(displayName('deutan', 1)).toBe('Deuteranopia');
    expect(displayName('tritan', 1)).toBe('Tritanopia');
    expect(displayName('achromatopsia', 1)).toBe('Achromatopsia');
  });

  it('uses anomalous trichromacy (-omaly) names below severity 1', () => {
    expect(displayName('protan', 0.5)).toBe('Protanomaly');
    expect(displayName('deutan', 0.9)).toBe('Deuteranomaly');
    expect(displayName('tritan', 0.3)).toBe('Tritanomaly');
    expect(displayName('achromatopsia', 0.5)).toBe('Achromatopsia');
  });
});
