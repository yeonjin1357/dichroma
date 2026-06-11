import { buildSvgFilter, type CvdType, type SvgFilter } from '@dichroma/core';
import { t as defaultT, type MessageKey, type Translate } from './i18n';

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

// Field TYPES are checked, not just the kind tag: runtime.onMessage is
// reachable from every extension context, so malformed payloads are rejected
// silently instead of reaching handlers that assume the shapes.
export function isSimulationMessage(msg: unknown): msg is SimulationMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (typeof m.tabId !== 'number') return false;
  switch (m.kind) {
    case 'clear':
    case 'getState':
      return true;
    case 'apply': {
      const s = m.settings as Record<string, unknown> | null | undefined;
      return (
        typeof s === 'object' &&
        s !== null &&
        typeof s.type === 'string' &&
        typeof s.severity === 'number'
      );
    }
    default:
      return false;
  }
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

const FULL_KEY: Record<CvdType, MessageKey> = {
  protan: 'typeProtanFull',
  deutan: 'typeDeutanFull',
  tritan: 'typeTritanFull',
  achromatopsia: 'typeAchroma',
};

const PARTIAL_KEY: Record<CvdType, MessageKey> = {
  protan: 'typeProtanPartial',
  deutan: 'typeDeutanPartial',
  tritan: 'typeTritanPartial',
  achromatopsia: 'typeAchroma', // no partial form of achromatopsia
};

/**
 * Severity-aware localized display name: dichromacy (-opia) at severity 1,
 * anomalous trichromacy (-omaly) below; achromatopsia has no partial form.
 * Routed through the i18n catalog so ko carries the medical annotations
 * ('Protanopia (적색맹)' …). `t` is injectable — same seam as utils/i18n.ts —
 * because fake-browser lacks i18n.getMessage in unit tests.
 */
export function displayName(
  type: CvdType | 'none',
  severity: number,
  t: Translate = defaultT,
): string {
  if (type === 'none') return t('typeNone');
  return t(severity >= 1 ? FULL_KEY[type] : PARTIAL_KEY[type]);
}
