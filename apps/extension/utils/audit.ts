import {
  simulateColor,
  simulatedWcagRatio,
  wcagRatio,
  type CvdType,
  type RGBTuple,
} from '@dichroma/core';
import type { AuditEntry, AuditGroup } from './audit-messages';

/**
 * Pure classification of raw audit entries under a (CVD type, severity).
 * The axe run is expensive; this is free — switching type/severity in the
 * panel re-classifies instantly without touching the page.
 */
export interface ClassifiedEntry {
  entry: AuditEntry;
  /** 'pass' = omitted from all three panel groups. */
  group: AuditGroup | 'pass';
  /** Ratios are null when axe could not resolve fg/bg colors. */
  originalRatio: number | null;
  simulatedRatio: number | null;
  expected: number;
  /** Simulated swatch colors ('#rrggbb'), null without resolved colors. */
  simFg: string | null;
  simBg: string | null;
}

/** Parse axe's expected-ratio form ('4.5:1' → 4.5); WCAG-AA 4.5 fallback. */
export function parseRatio(text: string | undefined): number {
  const m = /^(\d+(?:\.\d+)?):1$/.exec(text?.trim() ?? '');
  return m ? Number(m[1]) : 4.5;
}

/** Parse '#rrggbb' (the only form axe's toHexString emits) to an RGBTuple. */
export function parseHexColor(hex: string | undefined): RGBTuple | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex?.trim() ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHex(rgb: RGBTuple): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** '5.3:1' style display string (one decimal, trailing zeros trimmed). */
export function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 10) / 10}:1`;
}

export function classify(
  entries: AuditEntry[],
  type: CvdType,
  severity: number,
): ClassifiedEntry[] {
  return entries.map((entry) => {
    const fg = parseHexColor(entry.fgColor);
    const bg = parseHexColor(entry.bgColor);
    let originalRatio: number | null = null;
    let simulatedRatio: number | null = null;
    let simFg: string | null = null;
    let simBg: string | null = null;
    if (fg && bg) {
      originalRatio = wcagRatio(fg, bg);
      simulatedRatio = simulatedWcagRatio(fg, bg, type, severity);
      simFg = rgbToHex(simulateColor(fg, type, severity));
      simBg = rgbToHex(simulateColor(bg, type, severity));
    }

    let group: AuditGroup | 'pass';
    if (entry.outcome === 'incomplete') {
      group = 'needs-review';
    } else if (entry.outcome === 'violation') {
      group = 'failing';
    } else {
      // The differentiator: a node that passes WCAG in true colors but falls
      // below its expected ratio in the simulated color space.
      group =
        simulatedRatio !== null && simulatedRatio < entry.expectedRatio ? 'cvd-only' : 'pass';
    }

    return { entry, group, originalRatio, simulatedRatio, expected: entry.expectedRatio, simFg, simBg };
  });
}

/**
 * Sort comparator for classified entries: worst failure first, by margin
 * (expected − simulatedRatio) DESCENDING. Entries without a resolvable
 * simulated ratio sort last; ties return 0, so Array.prototype.sort (stable)
 * keeps their original index order.
 */
export function byFailureMargin(a: ClassifiedEntry, b: ClassifiedEntry): number {
  const ma = a.simulatedRatio === null ? null : a.expected - a.simulatedRatio;
  const mb = b.simulatedRatio === null ? null : b.expected - b.simulatedRatio;
  if (ma === null && mb === null) return 0;
  if (ma === null) return 1;
  if (mb === null) return -1;
  return mb - ma;
}

const CVD_TYPES: CvdType[] = ['protan', 'deutan', 'tritan', 'achromatopsia'];

/**
 * Summary-bar tallies: for each CVD type, how many entries would land in
 * 'cvd-only' at that type + `severity`. Pure re-classification of the one
 * existing axe run — never re-runs axe.
 */
export function summarizeByType(
  entries: AuditEntry[],
  severity: number,
): Record<CvdType, number> {
  const counts = {} as Record<CvdType, number>;
  for (const type of CVD_TYPES) {
    counts[type] = classify(entries, type, severity).filter((c) => c.group === 'cvd-only').length;
  }
  return counts;
}

// axe messageKey → reason text lives ONLY in utils/i18n.ts (reasonMessageKey
// + the locale catalogs); a second English table here would drift.
