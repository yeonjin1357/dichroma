import { buildSvgFilter, type CvdType, type SvgFilter } from '@dichroma/core';

/** What to simulate on a tab; `type: 'none'` means no simulation. */
export interface SimulationSettings {
  type: CvdType | 'none';
  severity: number;
}

/** Per-tab state owned by the background (session storage `tab:${tabId}`). */
export interface TabState {
  settings: SimulationSettings;
  /** The exact CSS string passed to insertCSS — removeCSS needs it verbatim. */
  css: string;
  /** True when the data-URL filter failed and inline SVG fallback was injected. */
  fallback?: boolean;
}

/** Global prefs owned by the background (local storage `prefs`). */
export interface Prefs {
  persist: boolean;
  lastSettings?: SimulationSettings;
}

/** Popup → background messages. The popup never touches CSS/state directly. */
export type SimulationMessage =
  | { kind: 'apply'; tabId: number; settings: SimulationSettings }
  | { kind: 'clear'; tabId: number }
  | { kind: 'getState'; tabId: number };

export type SimulationResponse =
  | { ok: true; state: TabState | null }
  | { ok: false; error: string };

export function isSimulationMessage(msg: unknown): msg is SimulationMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'kind' in msg &&
    ['apply', 'clear', 'getState'].includes((msg as { kind: unknown }).kind as string)
  );
}

/**
 * Build the CSS inserted into a page. The filter MUST target the html root:
 * filtering body creates a containing block that breaks position:fixed.
 */
export function buildFilterCss(
  type: CvdType,
  severity: number,
): { css: string; filter: SvgFilter } {
  const filter = buildSvgFilter(type, severity);
  return { css: `html { filter: ${filter.cssDataUrl} !important; }`, filter };
}

/** Toolbar badge letters, one per CVD type. */
export const BADGE: Record<CvdType, string> = {
  protan: 'P',
  deutan: 'D',
  tritan: 'T',
  achromatopsia: 'A',
};

const FULL_NAME: Record<CvdType, string> = {
  protan: 'Protanopia',
  deutan: 'Deuteranopia',
  tritan: 'Tritanopia',
  achromatopsia: 'Achromatopsia',
};

const PARTIAL_NAME: Record<CvdType, string> = {
  protan: 'Protanomaly',
  deutan: 'Deuteranomaly',
  tritan: 'Tritanomaly',
  achromatopsia: 'Achromatopsia',
};

/**
 * Severity-aware display name: dichromacy (-opia) at severity 1, anomalous
 * trichromacy (-omaly) below; achromatopsia has no partial form.
 */
export function displayName(type: CvdType, severity: number): string {
  return severity >= 1 ? FULL_NAME[type] : PARTIAL_NAME[type];
}
