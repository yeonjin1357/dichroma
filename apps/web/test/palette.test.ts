import { simulateColor, simulatedWcagRatio, wcagRatio } from '@dichroma/core';
import { describe, expect, it } from 'vitest';
import { badgesFor, formatRatio, normalizeHex, paletteRows } from '../src/lib/palette';

describe('paletteRows', () => {
  it('returns Normal + the 4 CVD types in order', () => {
    const rows = paletteRows('#ff0000', '#000000', 1);
    expect(rows.map((r) => r.vision)).toEqual([
      'normal',
      'protan',
      'deutan',
      'tritan',
      'achromatopsia',
    ]);
  });

  it('Normal ratio equals core wcagRatio; CVD ratios equal simulatedWcagRatio', () => {
    for (const severity of [0.5, 1]) {
      const rows = paletteRows('#ff0000', '#000000', severity);
      expect(rows[0].ratio).toBe(wcagRatio([255, 0, 0], [0, 0, 0]));
      for (const row of rows.slice(1)) {
        expect(row.ratio, `${row.vision}@${severity}`).toBe(
          simulatedWcagRatio([255, 0, 0], [0, 0, 0], row.vision as never, severity),
        );
      }
    }
  });

  it('known numbers: red-on-black ≈5.25 → "5.3:1" normal, protan(1) ≈3.09 → "3.1:1"', () => {
    const rows = paletteRows('#ff0000', '#000000', 1);
    expect(formatRatio(rows[0].ratio)).toBe('5.3:1');
    expect(rows[0].badges.aa).toBe(true);
    expect(formatRatio(rows[1].ratio)).toBe('3.1:1');
    expect(rows[1].badges.aa).toBe(false);
  });

  it('chip colors: Normal keeps the input pair, CVD rows use simulateColor', () => {
    const rows = paletteRows('#ff0000', '#0044aa', 1);
    expect(rows[0].fg).toBe('#ff0000');
    expect(rows[0].bg).toBe('#0044aa');
    const deutan = rows[2];
    const toHex = (rgb: readonly number[]) =>
      `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    expect(deutan.fg).toBe(toHex(simulateColor([255, 0, 0], 'deutan', 1)));
    expect(deutan.bg).toBe(toHex(simulateColor([0, 68, 170], 'deutan', 1)));
  });
});

describe('badgesFor boundaries (thresholds are inclusive)', () => {
  it.each([
    [2.9, { aaLarge: false, aa: false, aaa: false }],
    [3, { aaLarge: true, aa: false, aaa: false }],
    [4.49, { aaLarge: true, aa: false, aaa: false }],
    [4.5, { aaLarge: true, aa: true, aaa: false }],
    [6.99, { aaLarge: true, aa: true, aaa: false }],
    [7, { aaLarge: true, aa: true, aaa: true }],
    [21, { aaLarge: true, aa: true, aaa: true }],
  ])('ratio %d', (ratio, expected) => {
    expect(badgesFor(ratio)).toEqual(expected);
  });
});

describe('formatRatio', () => {
  it('renders one decimal with ":1" suffix', () => {
    expect(formatRatio(21)).toBe('21.0:1');
    expect(formatRatio(4.4499)).toBe('4.4:1');
  });
});

describe('normalizeHex', () => {
  it('accepts #rrggbb in any case, with or without the hash', () => {
    expect(normalizeHex('#ff0000')).toBe('#ff0000');
    expect(normalizeHex('FF8800')).toBe('#ff8800');
    expect(normalizeHex(' #AbCdEf ')).toBe('#abcdef');
  });

  it('rejects anything else', () => {
    expect(normalizeHex('#ff00')).toBeNull();
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('#ggg000')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });
});
