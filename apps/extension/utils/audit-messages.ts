/**
 * Message types for the contrast audit. Kept separate from simulation.ts so
 * each family stays a small discriminated union the background can route
 * independently.
 */

/**
 * One node from the single axe-core color-contrast run: raw RESOLVED colors
 * plus the expected ratio. Classification by (CVD type, severity) happens in
 * the side panel as pure math — one axe run serves every type/severity.
 */
export interface AuditEntry {
  /** Key into the page-side index→element Map (elements never serialize). */
  index: number;
  selector: string;
  /** Trimmed textContent, ≤80 chars. */
  snippet: string;
  /** '#rrggbb' as resolved by axe; absent for some incomplete reasons. */
  fgColor?: string;
  bgColor?: string;
  shadowColor?: string;
  /** Parsed from axe's '4.5:1' form. */
  expectedRatio: number;
  /** axe's own measured ratio (accounts for text shadows etc.). */
  axeContrastRatio?: number;
  outcome: 'pass' | 'violation' | 'incomplete';
  /** axe incomplete reason key (bgImage, bgGradient, …). */
  messageKey?: string;
}

export type AuditGroup = 'cvd-only' | 'failing' | 'needs-review';

/** Side panel / popup → background. */
export type AuditBackgroundMessage = { kind: 'runAudit'; tabId: number };

export type AuditBackgroundResponse = { ok: true } | { ok: false; error: string };

/**
 * Audit events (runtime.sendMessage broadcast). auditResult/auditStale/
 * auditError come from the audit page script; auditStarted/auditInvalidated
 * come from the background (run announced for panel rebinding, stored result
 * invalidated by navigation).
 */
export type AuditEvent =
  | { kind: 'auditStarted'; tabId: number }
  | { kind: 'auditResult'; tabId: number; url: string; entries: AuditEntry[] }
  | { kind: 'auditStale'; tabId: number }
  | { kind: 'auditInvalidated'; tabId: number }
  | { kind: 'auditError'; tabId: number; error: string };

/**
 * In-page preview card payload, built ENTIRELY panel-side: colors come from
 * the same classify() math as the row chips and `caption` is already
 * localized — the page script stays i18n-free and locale-agnostic.
 */
export interface FocusPreview {
  simFg: string;
  simBg: string;
  origFg: string;
  origBg: string;
  caption: string;
}

/** Extension pages / background → audit page script (tabs.sendMessage). */
export type AuditPageCommand =
  | { kind: 'rerunAudit' }
  | {
      kind: 'updateOverlay';
      groups: Record<number, AuditGroup>;
      badges: Record<number, string>;
      swatches: Record<number, { orig: string; sim: string }>;
    }
  | { kind: 'clearOverlay' }
  | { kind: 'teardownAudit' }
  | { kind: 'focusEntry'; index: number; preview?: FocusPreview };

// The guards below check field TYPES, not just the kind tag: runtime.onMessage
// is reachable from every extension context, so malformed payloads are
// rejected silently instead of reaching handlers that assume the shapes.

function fields(msg: unknown): Record<string, unknown> | null {
  return typeof msg === 'object' && msg !== null ? (msg as Record<string, unknown>) : null;
}

function isPlainRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAuditBackgroundMessage(msg: unknown): msg is AuditBackgroundMessage {
  const m = fields(msg);
  return m !== null && m.kind === 'runAudit' && typeof m.tabId === 'number';
}

export function isAuditEvent(msg: unknown): msg is AuditEvent {
  const m = fields(msg);
  if (m === null || typeof m.tabId !== 'number') return false;
  switch (m.kind) {
    case 'auditStarted':
    case 'auditStale':
    case 'auditInvalidated':
      return true;
    case 'auditResult':
      return typeof m.url === 'string' && Array.isArray(m.entries);
    case 'auditError':
      return typeof m.error === 'string';
    default:
      return false;
  }
}

export function isAuditPageCommand(msg: unknown): msg is AuditPageCommand {
  const m = fields(msg);
  if (m === null) return false;
  switch (m.kind) {
    case 'rerunAudit':
    case 'clearOverlay':
    case 'teardownAudit':
      return true;
    case 'updateOverlay':
      return isPlainRecord(m.groups) && isPlainRecord(m.badges) && isPlainRecord(m.swatches);
    case 'focusEntry':
      return typeof m.index === 'number';
    default:
      return false;
  }
}
