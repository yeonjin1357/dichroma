import { describe, expect, it } from 'vitest';
import { detectLang, messages } from '../src/lib/i18n';

describe('messages', () => {
  it('en and ko have exactly the same keys', () => {
    expect(Object.keys(messages.ko).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it('every string is non-empty', () => {
    for (const lang of ['en', 'ko'] as const) {
      for (const [key, value] of Object.entries(messages[lang])) {
        expect(value, `${lang}.${key}`).not.toBe('');
      }
    }
  });

  it('keeps the spec-mandated privacy and disclaimer wording', () => {
    expect(messages.en.privacyNote).toContain('Images never leave your browser');
    expect(messages.ko.privacyNote).toContain('이미지는 브라우저 밖으로 전송되지 않습니다');
    expect(messages.en.footerDisclaimer).toBe(
      'Simulated ratios are estimates from CVD color models — not a normative WCAG result.',
    );
    expect(messages.ko.footerDisclaimer).toBe(
      '시뮬레이션 비율은 색각 모델 기반 추정치로, WCAG 공식 판정값이 아닙니다.',
    );
  });
});

describe('detectLang', () => {
  it('prefers a valid stored value', () => {
    expect(detectLang('ko', 'en-US')).toBe('ko');
    expect(detectLang('en', 'ko-KR')).toBe('en');
  });

  it('falls back to navigator.language (ko* → ko, anything else → en)', () => {
    expect(detectLang(null, 'ko')).toBe('ko');
    expect(detectLang(null, 'ko-KR')).toBe('ko');
    expect(detectLang(null, 'en-US')).toBe('en');
    expect(detectLang(null, 'fr')).toBe('en');
    expect(detectLang(null, undefined)).toBe('en');
    expect(detectLang('garbage', 'ko-KR')).toBe('ko');
  });
});
