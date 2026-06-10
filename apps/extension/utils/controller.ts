import type { CvdType } from '@dichroma/core';
import { browser } from 'wxt/browser';
import {
  BADGE,
  buildFilterCss,
  type Prefs,
  type SimulationMessage,
  type SimulationResponse,
  type SimulationSettings,
  type TabState,
} from './simulation';

/**
 * Page-injection seam. The real implementation (background.ts) wraps
 * browser.scripting/browser.permissions, which @webext-core/fake-browser does
 * not implement — unit tests substitute an in-memory fake and the real wiring
 * is covered by the Playwright e2e.
 */
export interface PageInjector {
  insertCss(tabId: number, css: string): Promise<void>;
  removeCss(tabId: number, css: string): Promise<void>;
  /** Computed `filter` of the page's html element. */
  readRootFilter(tabId: number): Promise<string>;
  /**
   * Computed root filter plus fallback-node presence, or null when the page
   * is not scriptable (chrome:// etc., or no permission for the origin).
   */
  probePage(tabId: number): Promise<{ filter: string; hasFallbackNodes: boolean } | null>;
  injectFallback(tabId: number, filterMarkup: string, css: string): Promise<void>;
  removeFallback(tabId: number): Promise<void>;
  hasAllUrlsPermission(): Promise<boolean>;
}

const BADGE_COLOR = '#36395a';

const tabKey = (tabId: number) => `tab:${tabId}`;

/** Matches the deterministic filter ids minted by buildSvgFilter. */
const FILTER_ID_PATTERN = /dichroma-(protan|deutan|tritan|achromatopsia)-(\d+)/;

/**
 * Recover settings from a live filter id (e.g. "dichroma-protan-50" →
 * protan at 0.5). Works on both delivery forms: the data-URL keeps the raw
 * `#id` fragment and the inline fallback shows `url("#id")`.
 */
function parseDichromaFilter(filter: string): { type: CvdType; severity: number } | null {
  const m = FILTER_ID_PATTERN.exec(filter);
  if (!m) return null;
  return { type: m[1] as CvdType, severity: Number(m[2]) / 100 };
}

export function createSimulationController(injector: PageInjector) {
  // All entry points run through one queue: concurrent handlers (e.g. rapid
  // slider applies, or apply racing tabs.onUpdated) would otherwise read the
  // same stale state and orphan an inserted CSS string that removeCSS can
  // then never match.
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  async function getTabState(tabId: number): Promise<TabState | undefined> {
    const rec = await browser.storage.session.get(tabKey(tabId));
    return rec[tabKey(tabId)] as TabState | undefined;
  }

  async function getPrefs(): Promise<Prefs> {
    const { prefs } = await browser.storage.local.get('prefs');
    return (prefs as Prefs | undefined) ?? { persist: false };
  }

  async function removeFromPage(tabId: number, state: TabState): Promise<void> {
    await injector.removeCss(tabId, state.css);
    if (state.fallback) await injector.removeFallback(tabId);
  }

  async function apply(tabId: number, settings: SimulationSettings): Promise<SimulationResponse> {
    if (settings.type === 'none') return clear(tabId);
    const old = await getTabState(tabId);
    const { css, filter } = buildFilterCss(settings.type, settings.severity);
    try {
      if (old) await removeFromPage(tabId, old);
      // Idempotence: navigation events can re-run apply for css that is
      // already live (or stacked up by a pre-fix build). removeCSS of a
      // never-inserted string is a silent no-op, so this pre-removal
      // guarantees the insert below leaves EXACTLY ONE live insertion no
      // matter how apply calls interleave.
      await injector.removeCss(tabId, css);
      await injector.insertCss(tabId, css);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    // Data-URL SVG filters can silently no-op (e.g. blocked by CSP); verify
    // the computed style and fall back to inline <svg> markup if needed.
    let fallback = false;
    try {
      if ((await injector.readRootFilter(tabId)) === 'none') {
        await injector.injectFallback(
          tabId,
          filter.markup,
          `html { filter: ${filter.cssInline} !important; }`,
        );
        fallback = true;
      }
    } catch {
      // Verification is best-effort; keep the inserted CSS.
    }

    const state: TabState = fallback ? { settings, css, fallback } : { settings, css };
    await browser.storage.session.set({ [tabKey(tabId)]: state });
    await browser.action.setBadgeText({ tabId, text: BADGE[settings.type] });
    await browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
    const prefs = await getPrefs();
    await browser.storage.local.set({ prefs: { ...prefs, lastSettings: settings } });
    return { ok: true, state };
  }

  async function clear(tabId: number): Promise<SimulationResponse> {
    const state = await getTabState(tabId);
    if (state) {
      try {
        await removeFromPage(tabId, state);
        // Pre-fix builds could stack duplicate insertions of the SAME css
        // (each removeCSS call removes one match); probe and retry until the
        // filter is gone, up to 3 removeCss attempts in total.
        let probe = await injector.probePage(tabId);
        for (let attempts = 1; attempts < 3; attempts++) {
          if (!probe || !FILTER_ID_PATTERN.test(probe.filter)) break;
          await injector.removeCss(tabId, state.css);
          probe = await injector.probePage(tabId);
        }
        // Orphan + state coexistence: a DIFFERENT dichroma id may still be
        // live (e.g. adopted state next to an older orphan). The builder is
        // deterministic, so that id's css can be rebuilt and removed too.
        const residual = probe && parseDichromaFilter(probe.filter);
        if (residual) {
          const residualCss = buildFilterCss(residual.type, residual.severity).css;
          if (residualCss !== state.css) await injector.removeCss(tabId, residualCss);
        }
      } catch {
        // Page may be gone or no longer scriptable; state cleanup still applies.
      }
      await browser.storage.session.remove(tabKey(tabId));
    }
    await browser.action.setBadgeText({ tabId, text: '' });
    return { ok: true, state: null };
  }

  /**
   * Reconcile stored state with page reality. Opening the popup re-grants
   * activeTab, so the page is probe-able exactly when accuracy matters:
   * tab events both leak state whose css died with a real navigation AND
   * delete state whose css survived a same-document one (SPA pushState,
   * canceled navigations, download triggers).
   */
  async function reconcileState(tabId: number): Promise<TabState | null> {
    const state = (await getTabState(tabId)) ?? null;
    const probe = await injector.probePage(tabId);
    if (!probe) return state; // unscriptable page: best effort, trust storage

    if (state) {
      if (state.settings.type !== 'none') {
        const expectedId = buildFilterCss(state.settings.type, state.settings.severity).filter.id;
        if (!probe.filter.includes(`#${expectedId}`) && !probe.hasFallbackNodes) {
          // The css died with a real navigation; the stored state is stale.
          await browser.storage.session.remove(tabKey(tabId));
          await browser.action.setBadgeText({ tabId, text: '' });
          return null;
        }
      }
      return state;
    }

    // ORPHAN: a dichroma filter is live but no state records it (a soft
    // navigation was treated as document-destroying). Re-adopt it so the
    // popup shows reality and None can remove it — the builder is
    // deterministic, so the rebuilt css is byte-identical to the inserted one.
    const settings = parseDichromaFilter(probe.filter);
    if (!settings) return null;
    const { css } = buildFilterCss(settings.type, settings.severity);
    const adopted: TabState = probe.hasFallbackNodes
      ? { settings, css, fallback: true }
      : { settings, css };
    await browser.storage.session.set({ [tabKey(tabId)]: adopted });
    await browser.action.setBadgeText({ tabId, text: BADGE[settings.type] });
    await browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
    return adopted;
  }

  async function handleMessage(msg: SimulationMessage): Promise<SimulationResponse> {
    switch (msg.kind) {
      case 'apply':
        return apply(msg.tabId, msg.settings);
      case 'clear':
        return clear(msg.tabId);
      case 'getState':
        return { ok: true, state: await reconcileState(msg.tabId) };
    }
  }

  /**
   * Keyboard command: toggle the active tab between off and the last-used
   * settings. Chrome passes the active tab to onCommand listeners (117+);
   * falls back to an active-tab query when absent.
   */
  async function handleToggleCommand(commandTab?: { id?: number }): Promise<void> {
    let tabId = commandTab?.id;
    if (tabId == null) {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id;
    }
    if (tabId == null) return;
    if (await getTabState(tabId)) {
      await clear(tabId);
    } else {
      const prefs = await getPrefs();
      await apply(tabId, prefs.lastSettings ?? { type: 'deutan', severity: 1 });
    }
  }

  /**
   * Inserted CSS dies on navigation. Re-apply when the user opted into
   * persistence AND granted <all_urls>; otherwise drop the stale state.
   *
   * Chrome fires status:'loading' MULTIPLE times for one navigation
   * (redirects etc.), so the state must NOT be deleted before re-applying:
   * apply() needs it to remove the previous insertion, and its idempotent
   * pre-removal handles both the fresh-document case (removals no-op) and
   * the same-document case (the duplicate is removed first).
   */
  async function handleTabUpdated(tabId: number, changeInfo: { status?: string }): Promise<void> {
    if (changeInfo.status !== 'loading') return;
    const state = await getTabState(tabId);
    if (!state) return;
    const prefs = await getPrefs();
    if (prefs.persist && (await injector.hasAllUrlsPermission())) {
      const res = await apply(tabId, state.settings);
      if (!res.ok) {
        // Navigated somewhere unscriptable (chrome:// etc.): drop the state.
        await browser.storage.session.remove(tabKey(tabId));
        await browser.action.setBadgeText({ tabId, text: '' });
      }
    } else {
      await browser.storage.session.remove(tabKey(tabId));
      await browser.action.setBadgeText({ tabId, text: '' });
    }
  }

  async function handleTabRemoved(tabId: number): Promise<void> {
    await browser.storage.session.remove(tabKey(tabId));
  }

  return {
    handleMessage: (msg: SimulationMessage) => enqueue(() => handleMessage(msg)),
    handleToggleCommand: (commandTab?: { id?: number }) =>
      enqueue(() => handleToggleCommand(commandTab)),
    handleTabUpdated: (tabId: number, changeInfo: { status?: string }) =>
      enqueue(() => handleTabUpdated(tabId, changeInfo)),
    handleTabRemoved: (tabId: number) => enqueue(() => handleTabRemoved(tabId)),
  };
}
