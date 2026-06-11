import {
  simulateColor,
  simulatedWcagRatio,
  wcagRatio,
  type CvdType,
  type RGBTuple,
} from '@dichroma/core';

export const CVD_TYPES = ['protan', 'deutan', 'tritan', 'achromatopsia'] as const;

export type Vision = 'normal' | CvdType;

/** WCAG pass/fail at the standard thresholds (inclusive). */
export interface Badges {
  /** AA normal text, ratio ≥ 4.5 */
  aa: boolean;
  /** AA large text, ratio ≥ 3 */
  aaLarge: boolean;
  /** AAA normal text, ratio ≥ 7 */
  aaa: boolean;
}

export interface PaletteRow {
  vision: Vision;
  /** Chip colors: the input pair for 'normal', the simulated pair otherwise. */
  fg: string;
  bg: string;
  ratio: number;
  badges: Badges;
}

/** '#rrggbb' / 'rrggbb' (any case, surrounding spaces ok) → '#rrggbb', else null. */
export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

function hexToRgb(hex: string): RGBTuple {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(rgb: RGBTuple): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function badgesFor(ratio: number): Badges {
  return { aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7 };
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}

/**
 * WhoCanUse-style table data: the Normal row uses the true wcagRatio, each
 * CVD row uses simulatedWcagRatio at the given severity plus the simulated
 * color pair for its preview chip. fg/bg are '#rrggbb' strings.
 */
export function paletteRows(fg: string, bg: string, severity: number): PaletteRow[] {
  const fgRgb = hexToRgb(fg);
  const bgRgb = hexToRgb(bg);
  const normalRatio = wcagRatio(fgRgb, bgRgb);
  return [
    { vision: 'normal', fg, bg, ratio: normalRatio, badges: badgesFor(normalRatio) },
    ...CVD_TYPES.map((type): PaletteRow => {
      const ratio = simulatedWcagRatio(fgRgb, bgRgb, type, severity);
      return {
        vision: type,
        fg: rgbToHex(simulateColor(fgRgb, type, severity)),
        bg: rgbToHex(simulateColor(bgRgb, type, severity)),
        ratio,
        badges: badgesFor(ratio),
      };
    }),
  ];
}
