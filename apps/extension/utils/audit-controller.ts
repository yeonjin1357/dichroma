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
  /** tabs.sendMessage(tabId, { kind: 'teardownAudit' }). */
  sendTeardown(tabId: number): Promise<void>;
}

/** Name of the long-lived port every side panel opens for close detection. */
export const PANEL_PORT_NAME = 'dichroma-sidepanel';

/**
 * Minimal structural slice of chrome.runtime.Port that the close-detection
 * logic touches. fake-browser (1.5.2) implements neither runtime.connect nor
 * runtime.onConnect, so unit tests inject hand-rolled fakes through this
 * interface (the project's established seam pattern); the real Port is
 * structurally assignable.
 */
export interface PanelPort {
  name: string;
  onMessage: { addListener(cb: (msg: unknown) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
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

  // ---- side-panel close detection ------------------------------------------
  // Chrome's sidePanel API fires NO close event: a closing panel dies
  // silently, and overlay cleanup used to happen only via panel-SENT messages
  // — so nothing ever sent teardownAudit and the page overlay stayed up
  // forever (the user-reported bug). Each panel therefore holds a long-lived
  // port whose disconnect IS the close signal. SW lifecycle: this Set/Map is
  // in-memory and dies with every MV3 service-worker suspension, but the
  // suspension also drops the ports — and the PANEL side reconnects
  // immediately, which wakes the SW and rebuilds this state; that panel-side
  // reconnect loop is what keeps true-close detection alive across
  // suspensions. Teardown stays best-effort either way (a close during a
  // suspension is simply missed); the navigation-cleanup path
  // (handleTabUpdated → page script death) is the eventual fallback.

  /** Every connected panel port (one side panel per window is possible). */
  const panelPorts = new Set<PanelPort>();
  /** Each port's last-announced bound tab; entries appear on first announce. */
  const panelTabs = new Map<PanelPort, number>();

  function handlePanelConnect(port: PanelPort): void {
    if (port.name !== PANEL_PORT_NAME) return;
    panelPorts.add(port);
    port.onMessage.addListener((msg) => {
      if (typeof msg !== 'object' || msg === null) return;
      const { tabId } = msg as { tabId?: unknown };
      // Re-announcements overwrite: a rebind moves the port to the new tab.
      if (typeof tabId === 'number') panelTabs.set(port, tabId);
    });
    port.onDisconnect.addListener(() => {
      panelPorts.delete(port);
      const tabId = panelTabs.get(port);
      panelTabs.delete(port);
      if (tabId === undefined) return; // never bound — nothing to clear
      // Another window's panel may be bound to the SAME tab; its overlay
      // must survive this panel's close.
      for (const other of panelTabs.values()) {
        if (other === tabId) return;
      }
      // Best-effort: the tab may already be closed or navigated away.
      void injector.sendTeardown(tabId).catch(() => {});
    });
  }

  return {
    handleRunAudit,
    handleAuditResult,
    handleTabUpdated,
    handleTabRemoved,
    handlePanelConnect,
  };
}
