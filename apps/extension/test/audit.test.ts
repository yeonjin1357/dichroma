import { simulateColor, simulatedWcagRatio, wcagRatio } from '@dichroma/core';
import { describe, expect, it } from 'vitest';
import {
  byFailureMargin,
  classify,
  formatRatio,
  parseHexColor,
  parseRatio,
  rgbToHex,
  summarizeByType,
  type ClassifiedEntry,
} from '@/utils/audit';
import type { AuditEntry } from '@/utils/audit-messages';

let nextIndex = 0;
function entry(partial: Partial<AuditEntry>): AuditEntry {
  return {
    index: nextIndex++,
    selector: 'p',
    snippet: 'sample text',
    expectedRatio: 4.5,
    outcome: 'pass',
    ...partial,
  };
}

describe('parseRatio', () => {
  it("parses '4.5:1' to 4.5", () => {
    expect(parseRatio('4.5:1')).toBe(4.5);
  });

  it("parses '3:1' to 3", () => {
    expect(parseRatio('3:1')).toBe(3);
  });

  it("parses '7:1' to 7", () => {
    expect(parseRatio('7:1')).toBe(7);
  });

  it('falls back to 4.5 for missing or malformed input', () => {
    expect(parseRatio(undefined)).toBe(4.5);
    expect(parseRatio('')).toBe(4.5);
    expect(parseRatio('garbage')).toBe(4.5);
  });
});

describe('parseHexColor', () => {
  it('parses #rrggbb (the form axe emits via toHexString)', () => {
    expect(parseHexColor('#ff0000')).toEqual([255, 0, 0]);
    expect(parseHexColor('#000000')).toEqual([0, 0, 0]);
    expect(parseHexColor('#b8b8b8')).toEqual([184, 184, 184]);
  });

  it('is case-insensitive', () => {
    expect(parseHexColor('#B8B8B8')).toEqual([184, 184, 184]);
  });

  it('returns null for anything else', () => {
    expect(parseHexColor(undefined)).toBeNull();
    expect(parseHexColor('red')).toBeNull();
    expect(parseHexColor('#fff')).toBeNull();
    expect(parseHexColor('rgb(255, 0, 0)')).toBeNull();
  });
});

describe('rgbToHex', () => {
  it('round-trips with parseHexColor', () => {
    expect(rgbToHex([255, 0, 0])).toBe('#ff0000');
    expect(rgbToHex([94, 94, 13])).toBe('#5e5e0d');
    expect(parseHexColor(rgbToHex([1, 2, 3]))).toEqual([1, 2, 3]);
  });
});

describe('formatRatio', () => {
  it('renders one decimal place, trimming trailing zeros', () => {
    expect(formatRatio(5.252)).toBe('5.3:1');
    expect(formatRatio(3)).toBe('3:1');
    expect(formatRatio(4.5)).toBe('4.5:1');
    expect(formatRatio(21)).toBe('21:1');
  });
});

describe('classify', () => {
  it('flags the textbook CVD-only case: red on black passes normally, fails under protan', () => {
    // #ff0000 on #000000: 5.25:1 normally (passes 4.5), ≈3.1:1 under protan
    // severity 1 (Viénot) — invisible to every shipping contrast checker.
    const e = entry({ fgColor: '#ff0000', bgColor: '#000000', outcome: 'pass' });
    const [c] = classify([e], 'protan', 1);
    expect(c.group).toBe('cvd-only');
    expect(c.originalRatio).toBeCloseTo(wcagRatio([255, 0, 0], [0, 0, 0]), 6);
    expect(c.originalRatio).toBeCloseTo(5.25, 1);
    expect(c.originalRatio!).toBeGreaterThanOrEqual(4.5);
    expect(c.simulatedRatio).toBeCloseTo(
      simulatedWcagRatio([255, 0, 0], [0, 0, 0], 'protan', 1),
      6,
    );
    expect(c.simulatedRatio).toBeCloseTo(3.1, 1);
    expect(c.simulatedRatio!).toBeLessThan(4.5);
    expect(c.expected).toBe(4.5);
  });

  it('computes simFg/simBg as the simulated swatch colors', () => {
    const e = entry({ fgColor: '#ff0000', bgColor: '#000000', outcome: 'pass' });
    const [c] = classify([e], 'protan', 1);
    expect(c.simFg).toBe(rgbToHex(simulateColor([255, 0, 0], 'protan', 1)));
    expect(c.simBg).toBe(rgbToHex(simulateColor([0, 0, 0], 'protan', 1)));
  });

  it('preview chip colors equal simulateColor from the core for partial severities too', () => {
    // Guards against the panel's chip/preview colors drifting from the core:
    // classify's simFg/simBg ARE what every chip and in-page card renders.
    const e = entry({ fgColor: '#1a56b8', bgColor: '#ffffff', outcome: 'pass' });
    const [c] = classify([e], 'deutan', 0.6);
    expect(c.simFg).toBe(rgbToHex(simulateColor([26, 86, 184], 'deutan', 0.6)));
    expect(c.simBg).toBe(rgbToHex(simulateColor([255, 255, 255], 'deutan', 0.6)));
  });

  it('agrees with the core for the same pair under deutan (derived, not hardcoded)', () => {
    const sim = simulatedWcagRatio([255, 0, 0], [0, 0, 0], 'deutan', 1);
    const e = entry({ fgColor: '#ff0000', bgColor: '#000000', outcome: 'pass' });
    const [c] = classify([e], 'deutan', 1);
    expect(c.simulatedRatio).toBeCloseTo(sim, 6);
    expect(c.group).toBe(sim < 4.5 ? 'cvd-only' : 'pass');
  });

  it("maps violation outcomes to 'failing' regardless of the simulated value", () => {
    // Black on white keeps a 21:1 ratio under any simulation; outcome wins.
    const e = entry({ fgColor: '#000000', bgColor: '#ffffff', outcome: 'violation' });
    const [c] = classify([e], 'protan', 1);
    expect(c.group).toBe('failing');
    expect(c.simulatedRatio!).toBeGreaterThan(4.5);
  });

  it("maps incomplete outcomes to 'needs-review', even without resolved colors", () => {
    const e = entry({ outcome: 'incomplete', messageKey: 'bgGradient' });
    const [c] = classify([e], 'deutan', 1);
    expect(c.group).toBe('needs-review');
    expect(c.originalRatio).toBeNull();
    expect(c.simulatedRatio).toBeNull();
    expect(c.simFg).toBeNull();
    expect(c.simBg).toBeNull();
  });

  it('omits passing entries from all three groups', () => {
    // White on black survives every CVD simulation at 21:1.
    const e = entry({ fgColor: '#ffffff', bgColor: '#000000', outcome: 'pass' });
    const [c] = classify([e], 'protan', 1);
    expect(c.group).toBe('pass');
  });

  it('honors per-entry expected ratios (large text needs only 3:1)', () => {
    const sim = simulatedWcagRatio([255, 0, 0], [0, 0, 0], 'protan', 1); // ≈3.1
    expect(sim).toBeGreaterThan(3); // sanity: fixture sits between 3 and 4.5
    const e = entry({
      fgColor: '#ff0000',
      bgColor: '#000000',
      outcome: 'pass',
      expectedRatio: 3,
    });
    const [c] = classify([e], 'protan', 1);
    expect(c.group).toBe('pass');
    expect(c.expected).toBe(3);
  });

  it('severity 0 simulates to the original ratio (no CVD-only flags)', () => {
    // All genuinely passing pairs — axe only reports outcome 'pass' when the
    // original ratio meets the expectation.
    const pairs: [string, string][] = [
      ['#ff0000', '#000000'],
      ['#1a56b8', '#ffffff'],
      ['#767676', '#ffffff'],
    ];
    const entries = pairs.map(([fgColor, bgColor]) => entry({ fgColor, bgColor }));
    for (const type of ['protan', 'deutan', 'tritan'] as const) {
      for (const c of classify(entries, type, 0)) {
        expect(c.simulatedRatio!).toBeCloseTo(c.originalRatio!, 6);
        expect(c.group).not.toBe('cvd-only');
      }
    }
  });

  it('is pure: identical args give identical output (type/severity switch determinism)', () => {
    const entries = [
      entry({ fgColor: '#ff0000', bgColor: '#000000', outcome: 'pass' }),
      entry({ fgColor: '#b8b8b8', bgColor: '#ffffff', outcome: 'violation' }),
      entry({ outcome: 'incomplete', messageKey: 'bgImage' }),
    ];
    expect(classify(entries, 'tritan', 0.7)).toEqual(classify(entries, 'tritan', 0.7));
  });
});

describe('byFailureMargin', () => {
  function classified(
    index: number,
    simulatedRatio: number | null,
    expected = 4.5,
  ): ClassifiedEntry {
    return {
      entry: entry({ index }),
      group: 'cvd-only',
      originalRatio: 5,
      simulatedRatio,
      expected,
      simFg: null,
      simBg: null,
    };
  }

  it('sorts the worst failure margin (expected − simulated) first', () => {
    // margins: 4.5−4.4=0.1, 4.5−1.2=3.3, 4.5−3.1=1.4 → worst first: 1, 2, 0
    const items = [classified(0, 4.4), classified(1, 1.2), classified(2, 3.1)];
    const sorted = [...items].sort(byFailureMargin);
    expect(sorted.map((c) => c.entry.index)).toEqual([1, 2, 0]);
  });

  it('uses the margin, not the raw ratio (per-entry expected ratios differ)', () => {
    // 7−5=2 beats 4.5−3.5=1 even though 3.5 is the lower ratio.
    const items = [classified(0, 3.5, 4.5), classified(1, 5, 7)];
    expect([...items].sort(byFailureMargin).map((c) => c.entry.index)).toEqual([1, 0]);
  });

  it('keeps ties stable by original index (comparator returns 0)', () => {
    const items = [classified(0, 3.1), classified(1, 1.0), classified(2, 3.1)];
    expect(byFailureMargin(items[0], items[2])).toBe(0);
    expect([...items].sort(byFailureMargin).map((c) => c.entry.index)).toEqual([1, 0, 2]);
  });

  it('sorts entries without a simulated ratio last, stably', () => {
    const items = [classified(0, null), classified(1, 3.1), classified(2, null)];
    expect([...items].sort(byFailureMargin).map((c) => c.entry.index)).toEqual([1, 0, 2]);
    expect(byFailureMargin(items[0], items[2])).toBe(0);
  });
});

describe('summarizeByType', () => {
  it('red-on-black counts 1 for protan and 0 for deutan at severity 1', () => {
    const summary = summarizeByType(
      [entry({ fgColor: '#ff0000', bgColor: '#000000', outcome: 'pass' })],
      1,
    );
    expect(summary.protan).toBe(1);
    expect(summary.deutan).toBe(0);
    // The other two derived from the core, not hardcoded.
    for (const type of ['tritan', 'achromatopsia'] as const) {
      const sim = simulatedWcagRatio([255, 0, 0], [0, 0, 0], type, 1);
      expect(summary[type], type).toBe(sim < 4.5 ? 1 : 0);
    }
  });

  it("counts only would-be 'cvd-only' entries — violations and incompletes never count", () => {
    const entries = [
      entry({ fgColor: '#ff0000', bgColor: '#000000', outcome: 'pass' }),
      entry({ fgColor: '#b8b8b8', bgColor: '#ffffff', outcome: 'violation' }),
      entry({ outcome: 'incomplete', messageKey: 'bgGradient' }),
    ];
    const summary = summarizeByType(entries, 1);
    expect(summary.protan).toBe(1); // only the red-on-black pass entry
    expect(summary.deutan).toBe(0);
  });

  it('agrees with classify() per type (same core math, no axe re-run)', () => {
    const entries = [
      entry({ fgColor: '#ff0000', bgColor: '#000000', outcome: 'pass' }),
      entry({ fgColor: '#1a56b8', bgColor: '#ffffff', outcome: 'pass' }),
    ];
    for (const type of ['protan', 'deutan', 'tritan', 'achromatopsia'] as const) {
      const expected = classify(entries, type, 0.8).filter((c) => c.group === 'cvd-only').length;
      expect(summarizeByType(entries, 0.8)[type], type).toBe(expected);
    }
  });

  it('severity 0 counts nothing anywhere', () => {
    const entries = [entry({ fgColor: '#ff0000', bgColor: '#000000', outcome: 'pass' })];
    expect(summarizeByType(entries, 0)).toEqual({
      protan: 0,
      deutan: 0,
      tritan: 0,
      achromatopsia: 0,
    });
  });
});
