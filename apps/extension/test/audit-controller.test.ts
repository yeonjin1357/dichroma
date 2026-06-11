import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  AUDIT_CURRENT_KEY,
  AUDIT_ENTRY_CAP,
  auditResultKey,
  createAuditController,
  type AuditCurrent,
  type AuditInjector,
  type StoredAuditResult,
} from '@/utils/audit-controller';
import type { AuditEntry } from '@/utils/audit-messages';

// fake-browser does not implement scripting/tabs.sendMessage, so the audit
// controller takes them as an injectable AuditInjector (same seam pattern as
// the simulation controller); the real wiring is covered by the Playwright e2e.
function makeInjector(overrides: Partial<AuditInjector> = {}) {
  const calls = { injected: [] as number[], reran: [] as number[] };
  const injector: AuditInjector = {
    async injectAudit(tabId) {
      calls.injected.push(tabId);
    },
    async sendRerun(tabId) {
      calls.reran.push(tabId);
    },
    ...overrides,
  };
  return { injector, calls };
}

async function auditFlag(tabId: number): Promise<unknown> {
  const rec = await fakeBrowser.storage.session.get(`audit:${tabId}`);
  return rec[`audit:${tabId}`];
}

async function storedResult(tabId: number): Promise<StoredAuditResult | undefined> {
  const rec = await fakeBrowser.storage.session.get(auditResultKey(tabId));
  return rec[auditResultKey(tabId)] as StoredAuditResult | undefined;
}

async function auditCurrent(): Promise<AuditCurrent | undefined> {
  const rec = await fakeBrowser.storage.session.get(AUDIT_CURRENT_KEY);
  return rec[AUDIT_CURRENT_KEY] as AuditCurrent | undefined;
}

/** Capture every runtime broadcast the controller emits. */
function captureBroadcasts(): unknown[] {
  const events: unknown[] = [];
  fakeBrowser.runtime.onMessage.addListener((msg: unknown) => {
    events.push(msg);
  });
  return events;
}

let nextIndex = 0;
function entry(partial: Partial<AuditEntry> = {}): AuditEntry {
  return {
    index: nextIndex++,
    selector: 'p',
    snippet: 'sample text',
    expectedRatio: 4.5,
    outcome: 'pass',
    ...partial,
  };
}

describe('createAuditController', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('injects the audit script on first run and sets the session flag', async () => {
    const { injector, calls } = makeInjector();
    const controller = createAuditController(injector);
    const res = await controller.handleRunAudit(7);
    expect(res).toEqual({ ok: true });
    expect(calls.injected).toEqual([7]);
    expect(calls.reran).toEqual([]);
    expect(await auditFlag(7)).toBe(true);
  });

  it('sends rerunAudit instead of re-injecting when the flag is set', async () => {
    const { injector, calls } = makeInjector();
    const controller = createAuditController(injector);
    await controller.handleRunAudit(7);
    const res = await controller.handleRunAudit(7);
    expect(res).toEqual({ ok: true });
    expect(calls.injected).toEqual([7]); // still just the first injection
    expect(calls.reran).toEqual([7]);
  });

  it('falls back to re-injection when the rerun message finds no listener', async () => {
    const { injector, calls } = makeInjector({
      async sendRerun() {
        throw new Error('Could not establish connection');
      },
    });
    const controller = createAuditController(injector);
    await controller.handleRunAudit(7);
    const res = await controller.handleRunAudit(7);
    expect(res).toEqual({ ok: true });
    expect(calls.injected).toEqual([7, 7]);
  });

  it('returns ok:false when injection fails (no activeTab, restricted page)', async () => {
    const { injector } = makeInjector({
      async injectAudit() {
        throw new Error('Cannot access contents of the page');
      },
    });
    const controller = createAuditController(injector);
    const res = await controller.handleRunAudit(7);
    expect(res).toEqual({ ok: false, error: 'Cannot access contents of the page' });
    expect(await auditFlag(7)).toBeUndefined(); // flag only set after success
  });

  it('clears the flag on navigation (status loading) so the next run re-injects', async () => {
    const { injector, calls } = makeInjector();
    const controller = createAuditController(injector);
    await controller.handleRunAudit(7);
    await controller.handleTabUpdated(7, { status: 'loading' });
    expect(await auditFlag(7)).toBeUndefined();
    await controller.handleRunAudit(7);
    expect(calls.injected).toEqual([7, 7]);
    expect(calls.reran).toEqual([]);
  });

  it('keeps the flag on non-loading tab updates', async () => {
    const { injector } = makeInjector();
    const controller = createAuditController(injector);
    await controller.handleRunAudit(7);
    await controller.handleTabUpdated(7, { status: 'complete' });
    expect(await auditFlag(7)).toBe(true);
  });

  it('clears the flag when the tab is removed', async () => {
    const { injector } = makeInjector();
    const controller = createAuditController(injector);
    await controller.handleRunAudit(7);
    await controller.handleTabRemoved(7);
    expect(await auditFlag(7)).toBeUndefined();
  });
});

describe('storage-backed result lifecycle', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('runAudit stores audit:current and broadcasts auditStarted', async () => {
    const events = captureBroadcasts();
    const controller = createAuditController(makeInjector().injector);
    const before = Date.now();
    await controller.handleRunAudit(7);
    const current = await auditCurrent();
    expect(current?.tabId).toBe(7);
    expect(current?.startedAt).toBeGreaterThanOrEqual(before);
    expect(current?.startedAt).toBeLessThanOrEqual(Date.now());
    expect(events).toContainEqual({ kind: 'auditStarted', tabId: 7 });
  });

  it('still succeeds when no panel is listening (broadcast is best-effort)', async () => {
    // fake-browser's sendMessage throws with zero listeners (like Chrome);
    // the broadcast must be best-effort so the run itself still succeeds.
    const controller = createAuditController(makeInjector().injector);
    const res = await controller.handleRunAudit(7);
    expect(res).toEqual({ ok: true });
    expect((await auditCurrent())?.tabId).toBe(7);
  });

  it('persists an auditResult broadcast under audit:result:${tabId}', async () => {
    const controller = createAuditController(makeInjector().injector);
    const entries = [entry({ fgColor: '#ff0000', bgColor: '#000000' })];
    await controller.handleAuditResult({ tabId: 7, url: 'https://example.test/', entries });
    expect(await storedResult(7)).toEqual({
      entries,
      url: 'https://example.test/',
      stale: false,
    });
  });

  it(`caps persisted entries at ${AUDIT_ENTRY_CAP} and flags truncated`, async () => {
    const controller = createAuditController(makeInjector().injector);
    const entries = Array.from({ length: AUDIT_ENTRY_CAP + 1 }, (_, index) => entry({ index }));
    await controller.handleAuditResult({ tabId: 7, url: 'https://example.test/', entries });
    const stored = await storedResult(7);
    expect(stored?.truncated).toBe(true);
    expect(stored?.entries).toHaveLength(AUDIT_ENTRY_CAP);
    expect(stored?.entries[0].index).toBe(0);
    expect(stored?.entries[AUDIT_ENTRY_CAP - 1].index).toBe(AUDIT_ENTRY_CAP - 1);
  });

  it(`does not flag truncated at exactly ${AUDIT_ENTRY_CAP} entries`, async () => {
    const controller = createAuditController(makeInjector().injector);
    const entries = Array.from({ length: AUDIT_ENTRY_CAP }, (_, index) => entry({ index }));
    await controller.handleAuditResult({ tabId: 7, url: 'https://example.test/', entries });
    const stored = await storedResult(7);
    expect(stored?.truncated).toBeUndefined();
    expect(stored?.entries).toHaveLength(AUDIT_ENTRY_CAP);
  });

  it('marks the stored result stale and broadcasts auditInvalidated on navigation', async () => {
    const controller = createAuditController(makeInjector().injector);
    await controller.handleRunAudit(7);
    const entries = [entry()];
    await controller.handleAuditResult({ tabId: 7, url: 'https://example.test/', entries });

    const events = captureBroadcasts();
    await controller.handleTabUpdated(7, { status: 'loading' });
    const stored = await storedResult(7);
    expect(stored?.stale).toBe(true);
    expect(stored?.entries).toEqual(entries); // results kept, only flagged
    expect(events).toContainEqual({ kind: 'auditInvalidated', tabId: 7 });
    expect(await auditFlag(7)).toBeUndefined(); // injected flag still cleared
  });

  it('broadcasts auditInvalidated once across repeated loading events', async () => {
    // One navigation fires several status:'loading' events (redirects etc.).
    const controller = createAuditController(makeInjector().injector);
    await controller.handleAuditResult({ tabId: 7, url: 'https://example.test/', entries: [] });
    const events = captureBroadcasts();
    await controller.handleTabUpdated(7, { status: 'loading' });
    await controller.handleTabUpdated(7, { status: 'loading' });
    const invalidated = events.filter(
      (e) => (e as { kind?: string }).kind === 'auditInvalidated',
    );
    expect(invalidated).toHaveLength(1);
  });

  it('does not broadcast auditInvalidated when no result is stored', async () => {
    const controller = createAuditController(makeInjector().injector);
    const events = captureBroadcasts();
    await controller.handleTabUpdated(7, { status: 'loading' });
    expect(events).toEqual([]);
  });

  it('onRemoved deletes the stored result and audit:current when it points there', async () => {
    const controller = createAuditController(makeInjector().injector);
    await controller.handleRunAudit(7);
    await controller.handleAuditResult({ tabId: 7, url: 'https://example.test/', entries: [] });
    await controller.handleTabRemoved(7);
    expect(await storedResult(7)).toBeUndefined();
    expect(await auditCurrent()).toBeUndefined();
  });

  it('onRemoved keeps audit:current when it points at another tab', async () => {
    const controller = createAuditController(makeInjector().injector);
    await controller.handleRunAudit(9);
    await controller.handleAuditResult({ tabId: 7, url: 'https://example.test/', entries: [] });
    await controller.handleTabRemoved(7);
    expect(await storedResult(7)).toBeUndefined();
    expect((await auditCurrent())?.tabId).toBe(9);
  });
});
