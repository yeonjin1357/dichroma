import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { createSimulationController, type PageInjector } from '@/utils/controller';
import { buildFilterCss, type Prefs, type SimulationSettings, type TabState } from '@/utils/simulation';

// fake-browser does not implement scripting/permissions/commands, so the
// controller takes them as an injectable PageInjector; insertCSS/removeCSS/
// executeScript effects and permissions.request UX are covered by the
// Playwright e2e instead.
interface Calls {
  inserted: [number, string][];
  removed: [number, string][];
  fallbackInjected: [number, string, string][];
  fallbackRemoved: number[];
}

interface FakePage {
  injector: PageInjector;
  calls: Calls;
  /** Net live insertions of `css` on the tab (multiset semantics, like the real page). */
  netInsertions(tabId: number, css: string): number;
  /** Simulate a real document-destroying navigation: all inserted css dies. */
  resetPage(tabId: number): void;
}

/** Pull the filter value out of `html { filter: <value> !important; }`. */
function cssToFilter(css: string): string {
  return /filter:\s*(.+?)\s*!important/.exec(css)?.[1] ?? 'none';
}

/**
 * Fake injector that models the page like Chrome does: insertCSS stacks
 * duplicate insertions, removeCSS removes ONE matching insertion (and
 * silently no-ops on a string that was never inserted), and probePage
 * reports the computed filter of whatever is still live.
 */
function makeInjector(overrides: Partial<PageInjector> = {}): FakePage {
  const calls: Calls = { inserted: [], removed: [], fallbackInjected: [], fallbackRemoved: [] };
  const live = new Map<number, string[]>(); // multiset of live css per tab
  const fallbackCss = new Map<number, string>(); // live fallback style css per tab
  const injector: PageInjector = {
    async insertCss(tabId, css) {
      calls.inserted.push([tabId, css]);
      live.set(tabId, [...(live.get(tabId) ?? []), css]);
    },
    async removeCss(tabId, css) {
      calls.removed.push([tabId, css]);
      const stack = live.get(tabId) ?? [];
      const i = stack.indexOf(css);
      if (i !== -1) stack.splice(i, 1); // one insertion per call; never-inserted → no-op
    },
    async readRootFilter() {
      return 'url("data:image/svg+xml,...")'; // data-URL filter applied fine
    },
    async probePage(tabId) {
      const fb = fallbackCss.get(tabId);
      if (fb != null) return { filter: cssToFilter(fb), hasFallbackNodes: true };
      const stack = live.get(tabId) ?? [];
      if (stack.length === 0) return { filter: 'none', hasFallbackNodes: false };
      return { filter: cssToFilter(stack[stack.length - 1]), hasFallbackNodes: false };
    },
    async injectFallback(tabId, markup, css) {
      calls.fallbackInjected.push([tabId, markup, css]);
      fallbackCss.set(tabId, css);
    },
    async removeFallback(tabId) {
      calls.fallbackRemoved.push(tabId);
      fallbackCss.delete(tabId);
    },
    async hasAllUrlsPermission() {
      return false;
    },
    ...overrides,
  };
  return {
    injector,
    calls,
    netInsertions(tabId, css) {
      return (live.get(tabId) ?? []).filter((c) => c === css).length;
    },
    resetPage(tabId) {
      live.delete(tabId);
      fallbackCss.delete(tabId);
    },
  };
}

const DEUTAN: SimulationSettings = { type: 'deutan', severity: 1 };
const PROTAN_HALF: SimulationSettings = { type: 'protan', severity: 0.5 };

async function sessionState(tabId: number): Promise<TabState | undefined> {
  const rec = await fakeBrowser.storage.session.get(`tab:${tabId}`);
  return rec[`tab:${tabId}`] as TabState | undefined;
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('apply → getState round trip', () => {
  it('persists settings and the exact inserted css per tab', async () => {
    const { injector, calls } = makeInjector();
    const c = createSimulationController(injector);

    const applied = await c.handleMessage({ kind: 'apply', tabId: 7, settings: DEUTAN });
    expect(applied).toMatchObject({ ok: true, state: { settings: DEUTAN } });

    const res = await c.handleMessage({ kind: 'getState', tabId: 7 });
    if (!res.ok) throw new Error('expected ok');
    expect(res.state?.settings).toEqual(DEUTAN);
    // stored css must be byte-identical to what insertCss received (removeCSS contract)
    expect(calls.inserted).toEqual([[7, res.state!.css]]);
    expect(res.state?.css).toContain('html { filter:');

    // per-tab isolation: another tab has no state
    const other = await c.handleMessage({ kind: 'getState', tabId: 8 });
    expect(other).toEqual({ ok: true, state: null });

    // storage key shape is tab:${tabId} in session storage
    expect(await sessionState(7)).toEqual(res.state);
  });

  it('sets the badge letter and a background color for the tab', async () => {
    const { injector } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 3, settings: PROTAN_HALF });
    expect(await fakeBrowser.action.getBadgeText({ tabId: 3 })).toBe('P');
    const color = await fakeBrowser.action.getBadgeBackgroundColor({ tabId: 3 });
    expect(color).not.toEqual([0, 0, 0, 0]);
  });

  it('records lastSettings in prefs', async () => {
    const { injector } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 1, settings: PROTAN_HALF });
    const { prefs } = await fakeBrowser.storage.local.get('prefs');
    expect((prefs as Prefs).lastSettings).toEqual(PROTAN_HALF);
  });

  it('removes the previous css before inserting a replacement', async () => {
    const { injector, calls, netInsertions } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 5, settings: DEUTAN });
    const firstCss = calls.inserted[0][1];
    await c.handleMessage({ kind: 'apply', tabId: 5, settings: PROTAN_HALF });
    expect(calls.removed).toContainEqual([5, firstCss]);
    expect(calls.inserted).toHaveLength(2);
    const secondCss = calls.inserted[1][1];
    expect(netInsertions(5, firstCss)).toBe(0); // superseded css fully gone
    expect(netInsertions(5, secondCss)).toBe(1);
    expect((await sessionState(5))!.settings).toEqual(PROTAN_HALF);
  });

  it('is idempotent: applying the same settings twice leaves exactly one insertion', async () => {
    const { injector, calls, netInsertions } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 19, settings: DEUTAN });
    await c.handleMessage({ kind: 'apply', tabId: 19, settings: DEUTAN });
    expect(calls.inserted).toHaveLength(2);
    expect(netInsertions(19, calls.inserted[0][1])).toBe(1);
  });

  it('returns ok:false and stores nothing when insertCSS rejects (chrome:// pages)', async () => {
    const { injector } = makeInjector({
      async insertCss() {
        throw new Error('Cannot access a chrome:// URL');
      },
    });
    const c = createSimulationController(injector);
    const res = await c.handleMessage({ kind: 'apply', tabId: 2, settings: DEUTAN });
    expect(res).toEqual({ ok: false, error: 'Cannot access a chrome:// URL' });
    expect(await sessionState(2)).toBeUndefined();
    expect(await fakeBrowser.action.getBadgeText({ tabId: 2 })).toBe('');
  });

  it('serializes concurrent applies so superseded css is still removed', async () => {
    // Slider drags fire rapid applies; without serialization two handlers
    // both read the same old state and the first inserted css is orphaned.
    const { injector, calls, netInsertions } = makeInjector();
    const c = createSimulationController(injector);
    await Promise.all([
      c.handleMessage({ kind: 'apply', tabId: 15, settings: DEUTAN }),
      c.handleMessage({ kind: 'apply', tabId: 15, settings: PROTAN_HALF }),
    ]);
    expect(calls.inserted).toHaveLength(2);
    expect(netInsertions(15, calls.inserted[0][1])).toBe(0);
    expect(netInsertions(15, calls.inserted[1][1])).toBe(1);
    expect((await sessionState(15))?.css).toBe(calls.inserted[1][1]);
  });

  it('treats apply with type none as clear', async () => {
    const { injector, calls, netInsertions } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 4, settings: DEUTAN });
    const res = await c.handleMessage({
      kind: 'apply',
      tabId: 4,
      settings: { type: 'none', severity: 1 },
    });
    expect(res).toEqual({ ok: true, state: null });
    expect(await sessionState(4)).toBeUndefined();
    expect(calls.removed).toContainEqual([4, calls.inserted[0][1]]);
    expect(netInsertions(4, calls.inserted[0][1])).toBe(0);
  });
});

describe('data-URL fallback', () => {
  it('injects inline SVG fallback when the computed root filter stays none', async () => {
    const { injector, calls } = makeInjector({
      async readRootFilter() {
        return 'none';
      },
    });
    const c = createSimulationController(injector);
    const res = await c.handleMessage({ kind: 'apply', tabId: 9, settings: DEUTAN });
    if (!res.ok) throw new Error('expected ok');
    expect(res.state?.fallback).toBe(true);
    expect(calls.fallbackInjected).toHaveLength(1);
    const [tabId, markup, css] = calls.fallbackInjected[0];
    expect(tabId).toBe(9);
    expect(markup).toContain('<filter id="');
    expect(css).toMatch(/^html \{ filter: url\(#.+\) !important; \}$/);
  });

  it('clear removes the fallback nodes too', async () => {
    const { injector, calls } = makeInjector({
      async readRootFilter() {
        return 'none';
      },
    });
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 9, settings: DEUTAN });
    await c.handleMessage({ kind: 'clear', tabId: 9 });
    expect(calls.fallbackRemoved).toEqual([9]);
    expect(await sessionState(9)).toBeUndefined();
  });
});

describe('clear', () => {
  it('removes the stored css, deletes state, and clears the badge', async () => {
    const { injector, calls, netInsertions } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 6, settings: DEUTAN });
    const res = await c.handleMessage({ kind: 'clear', tabId: 6 });
    expect(res).toEqual({ ok: true, state: null });
    expect(calls.removed).toContainEqual([6, calls.inserted[0][1]]);
    expect(netInsertions(6, calls.inserted[0][1])).toBe(0);
    expect(await sessionState(6)).toBeUndefined();
    expect(await fakeBrowser.action.getBadgeText({ tabId: 6 })).toBe('');
  });

  it('is a no-op (ok) on a tab without state', async () => {
    const { injector, calls } = makeInjector();
    const c = createSimulationController(injector);
    const res = await c.handleMessage({ kind: 'clear', tabId: 42 });
    expect(res).toEqual({ ok: true, state: null });
    expect(calls.removed).toHaveLength(0);
  });

  it('retries removal until the probe stops reporting the filter (pre-fix duplicates)', async () => {
    // A pre-fix build could stack the SAME css twice (Bug A); one removeCSS
    // then leaves a duplicate alive. clear() must heal that within 3 attempts.
    const { injector, calls, netInsertions } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 23, settings: DEUTAN });
    const css = calls.inserted[0][1];
    await injector.insertCss(23, css); // duplicate insertion, behind the controller's back
    expect(netInsertions(23, css)).toBe(2);

    const removalsBeforeClear = calls.removed.length;
    const res = await c.handleMessage({ kind: 'clear', tabId: 23 });
    expect(res).toEqual({ ok: true, state: null });
    expect(netInsertions(23, css)).toBe(0); // healed within the 3-attempt budget
    expect(calls.removed.length - removalsBeforeClear).toBe(2); // needed exactly 2 removeCss calls
    expect(await sessionState(23)).toBeUndefined();
    expect(await fakeBrowser.action.getBadgeText({ tabId: 23 })).toBe('');
  });

  it('removes a residual foreign-id filter after retries (orphan + state coexistence)', async () => {
    // The live page shows a DIFFERENT dichroma id than the stored state:
    // rebuild that id's css (the builder is deterministic) and remove it too.
    const { injector, calls, netInsertions } = makeInjector();
    const c = createSimulationController(injector);
    const orphanCss = buildFilterCss('protan', 0.5).css;
    await injector.insertCss(99, orphanCss); // orphan from a previous document state
    await c.handleMessage({ kind: 'apply', tabId: 99, settings: DEUTAN });
    // deutan wins the cascade while live; clear removes it, then finds protan
    const res = await c.handleMessage({ kind: 'clear', tabId: 99 });
    expect(res).toEqual({ ok: true, state: null });
    expect(netInsertions(99, orphanCss)).toBe(0);
    expect(calls.removed).toContainEqual([99, orphanCss]);
    expect(await sessionState(99)).toBeUndefined();
  });
});

describe('toggle command', () => {
  // Chrome passes the active tab to commands.onCommand listeners; the
  // controller's active-tab-query fallback cannot be unit-tested because
  // fake-browser has no working way to mark a tab active (tabs.create
  // ignores `active`, tabs.duplicate never registers the new tab) — that
  // path is left to manual verification in real Chrome.
  const TAB = { id: 31 };

  it('applies the default deutan/1 when the tab has no state and no lastSettings', async () => {
    const { injector } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleToggleCommand(TAB);
    expect((await sessionState(TAB.id))?.settings).toEqual({ type: 'deutan', severity: 1 });
  });

  it('applies prefs.lastSettings when present', async () => {
    await fakeBrowser.storage.local.set({
      prefs: { persist: false, lastSettings: PROTAN_HALF } satisfies Prefs,
    });
    const { injector } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleToggleCommand(TAB);
    expect((await sessionState(TAB.id))?.settings).toEqual(PROTAN_HALF);
  });

  it('clears when the tab already has state', async () => {
    const { injector, calls, netInsertions } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleToggleCommand(TAB);
    await c.handleToggleCommand(TAB);
    expect(await sessionState(TAB.id)).toBeUndefined();
    expect(calls.removed).toContainEqual([TAB.id, calls.inserted[0][1]]);
    expect(netInsertions(TAB.id, calls.inserted[0][1])).toBe(0);
  });
});

describe('navigation (tabs.onUpdated loading)', () => {
  it('drops state and badge when persist is off', async () => {
    const { injector, calls } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 11, settings: DEUTAN });
    await c.handleTabUpdated(11, { status: 'loading' });
    expect(await sessionState(11)).toBeUndefined();
    expect(await fakeBrowser.action.getBadgeText({ tabId: 11 })).toBe('');
    expect(calls.inserted).toHaveLength(1); // no re-apply
  });

  it('drops state when persist is on but <all_urls> is not granted', async () => {
    const { injector } = makeInjector(); // hasAllUrlsPermission: false
    const c = createSimulationController(injector);
    await fakeBrowser.storage.local.set({ prefs: { persist: true } satisfies Prefs });
    await c.handleMessage({ kind: 'apply', tabId: 12, settings: DEUTAN });
    await c.handleTabUpdated(12, { status: 'loading' });
    expect(await sessionState(12)).toBeUndefined();
  });

  it('re-applies when persist is on and <all_urls> is granted', async () => {
    const { injector, calls } = makeInjector({
      async hasAllUrlsPermission() {
        return true;
      },
    });
    const c = createSimulationController(injector);
    await fakeBrowser.storage.local.set({ prefs: { persist: true } satisfies Prefs });
    await c.handleMessage({ kind: 'apply', tabId: 13, settings: DEUTAN });
    await c.handleTabUpdated(13, { status: 'loading' });
    expect((await sessionState(13))?.settings).toEqual(DEUTAN);
    expect(calls.inserted).toHaveLength(2); // fresh insert after navigation
    expect(await fakeBrowser.action.getBadgeText({ tabId: 13 })).toBe('D');
  });

  it('keeps exactly one net insertion across repeated loading events (Bug A)', async () => {
    // Chrome fires status:'loading' MULTIPLE times for one navigation
    // (redirects etc.); the pre-fix handler deleted state first, so apply
    // could never remove the previous insertion and the SAME css stacked up —
    // clear() then removed only one copy and the filter was stuck forever.
    const { injector, calls, netInsertions } = makeInjector({
      async hasAllUrlsPermission() {
        return true;
      },
    });
    const c = createSimulationController(injector);
    await fakeBrowser.storage.local.set({ prefs: { persist: true } satisfies Prefs });
    await c.handleMessage({ kind: 'apply', tabId: 20, settings: DEUTAN });
    const css = calls.inserted[0][1];
    await c.handleTabUpdated(20, { status: 'loading' });
    await c.handleTabUpdated(20, { status: 'loading' });
    await c.handleTabUpdated(20, { status: 'loading' });
    expect(netInsertions(20, css)).toBe(1);
    expect((await sessionState(20))?.settings).toEqual(DEUTAN);

    const res = await c.handleMessage({ kind: 'clear', tabId: 20 });
    expect(res).toEqual({ ok: true, state: null });
    expect(netInsertions(20, css)).toBe(0);
    expect(await sessionState(20)).toBeUndefined();
    expect(await fakeBrowser.action.getBadgeText({ tabId: 20 })).toBe('');
  });

  it('drops state and badge when the persist re-apply fails (chrome:// etc.)', async () => {
    let inserts = 0;
    const { injector } = makeInjector({
      async hasAllUrlsPermission() {
        return true;
      },
      async insertCss() {
        if (++inserts > 1) throw new Error('Cannot access a chrome:// URL');
      },
    });
    const c = createSimulationController(injector);
    await fakeBrowser.storage.local.set({ prefs: { persist: true } satisfies Prefs });
    await c.handleMessage({ kind: 'apply', tabId: 16, settings: DEUTAN });
    await c.handleTabUpdated(16, { status: 'loading' });
    expect(await sessionState(16)).toBeUndefined();
    expect(await fakeBrowser.action.getBadgeText({ tabId: 16 })).toBe('');
  });

  it('ignores non-loading updates and tabs without state', async () => {
    const { injector, calls } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 14, settings: DEUTAN });
    await c.handleTabUpdated(14, { status: 'complete' });
    expect(await sessionState(14)).toBeDefined();
    await c.handleTabUpdated(99, { status: 'loading' }); // no state: must not throw
    expect(calls.inserted).toHaveLength(1);
  });
});

describe('getState reconciliation', () => {
  it('returns stored state unchanged while its filter is live on the page', async () => {
    const { injector } = makeInjector();
    const c = createSimulationController(injector);
    const applied = await c.handleMessage({ kind: 'apply', tabId: 50, settings: DEUTAN });
    if (!applied.ok) throw new Error('expected ok');
    const res = await c.handleMessage({ kind: 'getState', tabId: 50 });
    if (!res.ok) throw new Error('expected ok');
    expect(res.state).toEqual(applied.state);
    expect(await sessionState(50)).toEqual(applied.state);
    expect(await fakeBrowser.action.getBadgeText({ tabId: 50 })).toBe('D');
  });

  it('drops stale state when the probe shows the css died with a navigation', async () => {
    const { injector, resetPage } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 51, settings: DEUTAN });
    resetPage(51); // real navigation destroyed the document; state was never cleaned up
    const res = await c.handleMessage({ kind: 'getState', tabId: 51 });
    expect(res).toEqual({ ok: true, state: null });
    expect(await sessionState(51)).toBeUndefined();
    expect(await fakeBrowser.action.getBadgeText({ tabId: 51 })).toBe('');
  });

  it('re-adopts an orphaned filter: state, badge, and byte-identical rebuilt css (Bug B)', async () => {
    // SPA soft navigation: a tab event deleted the state while the inserted
    // css stayed alive in the never-reloaded document. The popup showed None
    // and the filter could not be turned off.
    const { injector } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 52, settings: DEUTAN });
    await fakeBrowser.storage.session.remove('tab:52'); // the bug: state gone, css alive
    await fakeBrowser.action.setBadgeText({ tabId: 52, text: '' });

    const res = await c.handleMessage({ kind: 'getState', tabId: 52 });
    if (!res.ok) throw new Error('expected ok');
    expect(res.state?.settings).toEqual({ type: 'deutan', severity: 1 });
    expect(res.state?.css).toBe(buildFilterCss('deutan', 1).css);
    expect(res.state?.fallback).toBeUndefined();
    expect(await sessionState(52)).toEqual(res.state);
    expect(await fakeBrowser.action.getBadgeText({ tabId: 52 })).toBe('D');

    // None now works: the re-adopted css is byte-identical to the inserted one
    const cleared = await c.handleMessage({ kind: 'clear', tabId: 52 });
    expect(cleared).toEqual({ ok: true, state: null });
    expect((await injector.probePage(52))?.filter).toBe('none');
  });

  it('parses severity from the filter id (dichroma-protan-50 → 0.5)', async () => {
    const { injector } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 53, settings: PROTAN_HALF });
    await fakeBrowser.storage.session.remove('tab:53');
    const res = await c.handleMessage({ kind: 'getState', tabId: 53 });
    if (!res.ok) throw new Error('expected ok');
    expect(res.state?.settings).toEqual({ type: 'protan', severity: 0.5 });
    expect(res.state?.css).toBe(buildFilterCss('protan', 0.5).css);
    expect(await fakeBrowser.action.getBadgeText({ tabId: 53 })).toBe('P');
  });

  it('re-adopts with fallback:true when the fallback nodes are present', async () => {
    const { injector } = makeInjector({
      async readRootFilter() {
        return 'none'; // data-URL filter blocked → apply injected the fallback
      },
    });
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 54, settings: DEUTAN });
    await fakeBrowser.storage.session.remove('tab:54');
    const res = await c.handleMessage({ kind: 'getState', tabId: 54 });
    if (!res.ok) throw new Error('expected ok');
    expect(res.state?.settings).toEqual({ type: 'deutan', severity: 1 });
    expect(res.state?.fallback).toBe(true);
  });

  it('returns null when there is neither state nor a live filter', async () => {
    const { injector } = makeInjector();
    const c = createSimulationController(injector);
    const res = await c.handleMessage({ kind: 'getState', tabId: 55 });
    expect(res).toEqual({ ok: true, state: null });
  });

  it('returns stored state as-is when the page is not probe-able', async () => {
    const { injector } = makeInjector({
      async probePage() {
        return null; // executeScript rejected (chrome:// etc.)
      },
    });
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 56, settings: DEUTAN });
    const res = await c.handleMessage({ kind: 'getState', tabId: 56 });
    if (!res.ok) throw new Error('expected ok');
    expect(res.state?.settings).toEqual(DEUTAN);
    expect(await sessionState(56)).toBeDefined();
  });
});

describe('tabs.onRemoved', () => {
  it('deletes the tab state', async () => {
    const { injector } = makeInjector();
    const c = createSimulationController(injector);
    await c.handleMessage({ kind: 'apply', tabId: 21, settings: DEUTAN });
    await c.handleTabRemoved(21);
    expect(await sessionState(21)).toBeUndefined();
  });
});
