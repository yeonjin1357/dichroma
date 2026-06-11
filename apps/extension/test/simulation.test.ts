import { readFileSync } from 'node:fs';
import { buildSvgFilter } from '@dichroma/core';
import { describe, expect, it } from 'vitest';
import { createT } from '@/utils/i18n';
import { BADGE, buildFilterCss, displayName } from '@/utils/simulation';

/**
 * t() built straight from a public/_locales catalog — the seam createT
 * exposes because fake-browser does not implement i18n.getMessage.
 */
function localeT(locale: 'en' | 'ko') {
  const url = new URL(`../public/_locales/${locale}/messages.json`, import.meta.url);
  const catalog = JSON.parse(readFileSync(url, 'utf8')) as Record<string, { message?: string }>;
  return createT((key) => catalog[key]?.message ?? '');
}

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

describe('displayName (routed through the i18n catalog)', () => {
  const en = localeT('en');
  const ko = localeT('ko');

  it('en: dichromacy (-opia) names at severity 1', () => {
    expect(displayName('protan', 1, en)).toBe('Protanopia');
    expect(displayName('deutan', 1, en)).toBe('Deuteranopia');
    expect(displayName('tritan', 1, en)).toBe('Tritanopia');
    expect(displayName('achromatopsia', 1, en)).toBe('Achromatopsia');
  });

  it('en: anomalous trichromacy (-omaly) names below severity 1', () => {
    expect(displayName('protan', 0.5, en)).toBe('Protanomaly');
    expect(displayName('deutan', 0.9, en)).toBe('Deuteranomaly');
    expect(displayName('tritan', 0.3, en)).toBe('Tritanomaly');
    expect(displayName('achromatopsia', 0.5, en)).toBe('Achromatopsia');
  });

  it("en: 'none' maps to the None choice", () => {
    expect(displayName('none', 1, en)).toBe('None');
    expect(displayName('none', 0.5, en)).toBe('None');
  });

  it('ko: full names carry the medical annotations', () => {
    expect(displayName('protan', 1, ko)).toBe('Protanopia (적색맹)');
    expect(displayName('deutan', 1, ko)).toBe('Deuteranopia (녹색맹)');
    expect(displayName('tritan', 1, ko)).toBe('Tritanopia (청황색맹)');
    expect(displayName('achromatopsia', 1, ko)).toBe('Achromatopsia (전색맹)');
  });

  it('ko: partial names carry the -약 annotations (achromatopsia invariant)', () => {
    expect(displayName('protan', 0.5, ko)).toBe('Protanomaly (적색약)');
    expect(displayName('deutan', 0.9, ko)).toBe('Deuteranomaly (녹색약)');
    expect(displayName('tritan', 0.3, ko)).toBe('Tritanomaly (청황색약)');
    expect(displayName('achromatopsia', 0.5, ko)).toBe('Achromatopsia (전색맹)');
  });

  it("ko: 'none' maps to 없음", () => {
    expect(displayName('none', 1, ko)).toBe('없음');
  });

  it('default t degrades to the message key under fake-browser (no i18n)', () => {
    expect(displayName('protan', 1)).toBe('typeProtanFull');
    expect(displayName('protan', 0.5)).toBe('typeProtanPartial');
    expect(displayName('none', 1)).toBe('typeNone');
  });
});
