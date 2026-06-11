import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createT, MESSAGE_KEYS, reasonMessageKey, t } from '@/utils/i18n';

interface CatalogEntry {
  message?: unknown;
  placeholders?: Record<string, { content?: string }>;
}

/** Parse a locale catalog straight from public/ (what Chrome will load). */
function loadLocale(locale: 'en' | 'ko'): Record<string, CatalogEntry> {
  const url = new URL(`../public/_locales/${locale}/messages.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Record<string, CatalogEntry>;
}

describe('locale catalogs', () => {
  it('en and ko define IDENTICAL key sets', () => {
    const en = Object.keys(loadLocale('en')).sort();
    const ko = Object.keys(loadLocale('ko')).sort();
    expect(ko).toEqual(en);
  });

  it('every entry in both locales has a non-empty message string', () => {
    for (const locale of ['en', 'ko'] as const) {
      for (const [key, value] of Object.entries(loadLocale(locale))) {
        expect(typeof value.message, `${locale}/${key}`).toBe('string');
        expect((value.message as string).length, `${locale}/${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('MESSAGE_KEYS (the MessageKey source of truth) matches the en catalog exactly', () => {
    const en = Object.keys(loadLocale('en')).sort();
    expect([...MESSAGE_KEYS].sort()).toEqual(en);
  });

  it('type-name substitution keys use the chrome placeholders form ($TYPE$ ← $1) in both locales', () => {
    // getMessage(key, [typeName]) only substitutes through a placeholders
    // block: message text carries $TYPE$, and placeholders.type.content
    // routes $1 into it. A bare $1 in the message would NOT be substituted.
    for (const locale of ['en', 'ko'] as const) {
      const catalog = loadLocale(locale);
      for (const key of ['groupCvdOnly', 'rowCvdOnly'] as const) {
        const entry = catalog[key];
        expect(entry?.message, `${locale}/${key}`).toContain('$TYPE$');
        expect(entry?.placeholders?.type?.content, `${locale}/${key}`).toBe('$1');
      }
    }
  });
});

describe('createT', () => {
  it('returns the message getMessage resolves', () => {
    const t2 = createT((key) => (key === 'runAudit' ? 'Run audit' : ''));
    expect(t2('runAudit')).toBe('Run audit');
  });

  it('passes substitutions through to getMessage', () => {
    const t2 = createT((key, subs) => `${key}:${(subs ?? []).join(',')}`);
    expect(t2('chipSimulated', ['#6e6e00', '#000000', '3.1:1'])).toBe(
      'chipSimulated:#6e6e00,#000000,3.1:1',
    );
  });

  it("falls back to the key itself when getMessage yields ''", () => {
    const t2 = createT(() => '');
    expect(t2('groupCvdOnly')).toBe('groupCvdOnly');
  });

  it('default t falls back to the key under fake-browser (getMessage throws)', () => {
    // @webext-core/fake-browser does NOT implement i18n.getMessage (it
    // throws), hence the createT seam above; the default export must still
    // degrade to the key instead of crashing callers.
    expect(t('runAudit')).toBe('runAudit');
  });
});

describe('reasonMessageKey', () => {
  it('maps every known axe color-contrast messageKey to a real MessageKey', () => {
    const axeKeys = [
      'bgImage',
      'bgGradient',
      'imgNode',
      'bgOverlap',
      'fgAlpha',
      'elmPartiallyObscured',
      'elmPartiallyObscuring',
      'outsideViewport',
      'equalRatio',
      'shortTextContent',
      'nonBmp',
      'pseudoContent',
      'colorParse',
    ];
    for (const axeKey of axeKeys) {
      const key = reasonMessageKey(axeKey);
      expect(key, axeKey).not.toBeNull();
      expect(MESSAGE_KEYS).toContain(key);
    }
  });

  it('maps a missing messageKey to the default reason', () => {
    expect(reasonMessageKey(undefined)).toBe('reasonDefault');
  });

  it('returns null for unknown keys so callers can fall through raw', () => {
    expect(reasonMessageKey('someFutureKey')).toBeNull();
  });
});
