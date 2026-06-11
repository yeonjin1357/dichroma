import { browser } from 'wxt/browser';
import type { AuditBackgroundResponse, AuditEntry, AuditEvent } from './audit-messages';

/**
 * Audit-injection seam. The real implementation (background.ts) wraps
 * browser.scripting/browser.tabs, which @webext-core/fake-browser does not
 * implement — unit tests substitute an in-memory fake and the real wiring is
 * covered by the Playwright e2e.
 */
export interface AuditInjector {
  /** executeScript(['vendor/axe.min.js', 'contrast-audit.js']) on the main frame. */
  injectAudit(tabId: number): Promise<void>;
  /** tabs.sendMessage(tabId, { kind: 'rerunAudit' }). */
  sendRerun(tabId: number): Promise<void>;
}

const auditKey = (tabId: number) => `audit:${tabId}`;

/** Session key recording the most recently started audit's target tab. */
export const AUDIT_CURRENT_KEY = 'audit:current';

export interface AuditCurrent {
  tabId: number;
  startedAt: number;
}

/** Session key for the stored copy of a tab's last audit result. */
export const auditResultKey = (tabId: number) => `audit:result:${tabId}`;

/**
 * Persisted audit result (panel pull model): the panel READS this on mount,
 * so a result broadcast before its listener exists is never lost, and a
 * navigation can flag it stale even though the page-side emitter died.
 */
export interface StoredAuditResult {
  entries: AuditEntry[];
  url: string;
  stale: boolean;
  /** Present (true) when entries were capped at AUDIT_ENTRY_CAP. */
  truncated?: true;
}

/**
 * Sanity cap for the persisted copy. storage.session's ~10MB quota would
 * allow far more; past this point the panel list is unusable anyway.
 */
export const AUDIT_ENTRY_CAP = 1500;

/** Best-effort broadcast: with no extension page listening, sendMessage rejects. */
async function broadcast(event: AuditEvent): Promise<void> {
  try {
    await browser.runtime.sendMessage(event);
  } catch {
    // No listener (panel not open); the stored copy carries the information.
  }
}

/**
 * Background-side audit controller: tracks an `audit:${tabId}` injected flag
 * in storage.session so a re-run sends `rerunAudit` instead of re-injecting
 * (the page script's own global guard backstops double injection anyway),
 * plus the audit:current / audit:result:* records of the pull model.
 */
export function createAuditController(injector: AuditInjector) {
  async function isInjected(tabId: number): Promise<boolean> {
    const rec = await browser.storage.session.get(auditKey(tabId));
    return rec[auditKey(tabId)] === true;
  }

  async function inject(tabId: number): Promise<void> {
    await injector.injectAudit(tabId);
    await browser.storage.session.set({ [auditKey(tabId)]: true });
  }

  async function handleRunAudit(tabId: number): Promise<AuditBackgroundResponse> {
    // Record + announce the run FIRST: a panel that mounts later finds its
    // target tab in audit:current (the sidePanel.open race), and an already
    // open panel rebinds on auditStarted (popup-triggered run on another tab).
    const current: AuditCurrent = { tabId, startedAt: Date.now() };
    await browser.storage.session.set({ [AUDIT_CURRENT_KEY]: current });
    await broadcast({ kind: 'auditStarted', tabId });
    try {
      if (await isInjected(tabId)) {
        try {
          await injector.sendRerun(tabId);
        } catch {
          // The flag outlived the script (e.g. a discarded-and-restored tab);
          // fall back to a fresh injection, whose global guard makes it safe.
          await inject(tabId);
        }
      } else {
        await inject(tabId);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Persist an auditResult broadcast so a (re)opened panel can pull it. */
  async function handleAuditResult(event: {
    tabId: number;
    url: string;
    entries: AuditEntry[];
  }): Promise<void> {
    const truncated = event.entries.length > AUDIT_ENTRY_CAP;
    const stored: StoredAuditResult = {
      entries: truncated ? event.entries.slice(0, AUDIT_ENTRY_CAP) : event.entries,
      url: event.url,
      stale: false,
      ...(truncated ? { truncated: true as const } : {}),
    };
    await browser.storage.session.set({ [auditResultKey(event.tabId)]: stored });
  }

  /**
   * Navigation kills the injected script (clear the flag alongside tab state)
   * AND silently orphans any displayed result — its page-side staleness
   * observer died with the document, so the background flags the stored copy
   * and broadcasts the invalidation in its place (once per navigation;
   * Chrome fires several status:'loading' events for one).
   */
  async function handleTabUpdated(tabId: number, changeInfo: { status?: string }): Promise<void> {
    if (changeInfo.status !== 'loading') return;
    await browser.storage.session.remove(auditKey(tabId));
    const rec = await browser.storage.session.get(auditResultKey(tabId));
    const stored = rec[auditResultKey(tabId)] as StoredAuditResult | undefined;
    if (stored && !stored.stale) {
      await browser.storage.session.set({ [auditResultKey(tabId)]: { ...stored, stale: true } });
      await broadcast({ kind: 'auditInvalidated', tabId });
    }
  }

  async function handleTabRemoved(tabId: number): Promise<void> {
    await browser.storage.session.remove([auditKey(tabId), auditResultKey(tabId)]);
    const rec = await browser.storage.session.get(AUDIT_CURRENT_KEY);
    const current = rec[AUDIT_CURRENT_KEY] as AuditCurrent | undefined;
    if (current?.tabId === tabId) await browser.storage.session.remove(AUDIT_CURRENT_KEY);
  }

  return { handleRunAudit, handleAuditResult, handleTabUpdated, handleTabRemoved };
}
