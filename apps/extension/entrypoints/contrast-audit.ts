/**
 * Contrast-audit page script (WXT unlisted script → contrast-audit.js).
 *
 * Injected lazily by the background via
 * scripting.executeScript({ files: ['vendor/axe.min.js', 'contrast-audit.js'] })
 * on the MAIN FRAME ONLY (iframe audit is a documented limitation). Runs in
 * the isolated world, where axe works and elementRefs stay usable.
 *
 * It runs axe's color-contrast rule ONCE and emits RAW entries (resolved
 * colors + expected ratios); all (type, severity) classification happens in
 * the side panel as pure math, so switching type/severity never re-runs axe.
 */
import { browser } from 'wxt/browser';
import { parseRatio } from '@/utils/audit';
import {
  isAuditPageCommand,
  type AuditEntry,
  type AuditEvent,
  type AuditGroup,
  type FocusPreview,
} from '@/utils/audit-messages';

declare global {
  interface Window {
    axe: typeof import('axe-core');
    /** Set by the background just before injection (and read on each run). */
    __dichromaAuditTabId?: number;
    /** Idempotency guard: survives re-injection in the same isolated world. */
    __dichromaAudit?: { run(): Promise<void> };
  }
}

interface OverlayModel {
  groups: Record<number, AuditGroup>;
  badges: Record<number, string>;
  swatches: Record<number, { orig: string; sim: string }>;
}

/** Mutations past this count mark the audit results stale (sent once). */
const STALE_THRESHOLD = 50;

/** Scrolling further than this from where the preview card opened closes it. */
const CARD_SCROLL_DISMISS_PX = 48;

function createAudit() {
  /** index → live element; never serialized, owned by this side only. */
  const elements = new Map<number, Element>();
  let model: OverlayModel | null = null;
  let host: HTMLElement | null = null;
  let boxLayer: HTMLElement | null = null;
  /** Flash + preview card live here, OUTSIDE the boxLayer rebuild cycle. */
  let fxLayer: HTMLElement | null = null;
  let card: HTMLElement | null = null;
  let cardTimer: ReturnType<typeof setTimeout> | undefined;
  let cardScrollY = 0;
  let observer: MutationObserver | null = null;
  let repositionQueued = false;

  const tabId = () => window.__dichromaAuditTabId ?? -1;

  function send(event: AuditEvent): void {
    // The background always has an onMessage listener, so this never throws
    // for "no receiving end"; guard anyway (e.g. extension reloaded).
    void browser.runtime.sendMessage(event).catch(() => {});
  }

  // ---- staleness -----------------------------------------------------------

  function watchForStaleness(): void {
    observer?.disconnect();
    let mutations = 0;
    observer = new MutationObserver((records) => {
      for (const record of records) {
        // Ignore the overlay host's own insertion/removal.
        const nodes = [...record.addedNodes, ...record.removedNodes];
        if (nodes.length > 0 && nodes.every((n) => n === host)) continue;
        mutations++;
      }
      if (mutations >= STALE_THRESHOLD) {
        observer?.disconnect();
        observer = null;
        send({ kind: 'auditStale', tabId: tabId() });
      }
    });
    observer.observe(document, { childList: true, characterData: true, subtree: true });
  }

  // ---- audit run -----------------------------------------------------------

  function snippetOf(el: Element | undefined): string {
    return (el?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  }

  function selectorOf(target: unknown): string {
    if (!Array.isArray(target)) return String(target);
    return target.map((t) => (Array.isArray(t) ? t.join(' ') : String(t))).join(' ');
  }

  async function run(): Promise<void> {
    removeOverlay(); // old indices die with the new element map
    elements.clear();

    // resultTypes must list 'passes': axe caps unlisted result types at one
    // node per rule, and the differentiator needs every passing node's
    // resolved colors.
    const results = await window.axe.run(document, {
      runOnly: 'color-contrast',
      resultTypes: ['passes', 'violations', 'incomplete'],
      elementRef: true,
      preload: false,
    });

    const entries: AuditEntry[] = [];
    let index = 0;
    const buckets = [
      [results.passes, 'pass'],
      [results.violations, 'violation'],
      [results.incomplete, 'incomplete'],
    ] as const;
    for (const [ruleResults, outcome] of buckets) {
      for (const rule of ruleResults) {
        for (const node of rule.nodes) {
          // Semi-public axe API (pinned 4.12.x): the color-contrast check
          // exposes resolved colors on node.any[0].data.
          const data = (node.any?.[0]?.data ?? {}) as Record<string, unknown>;
          const entry: AuditEntry = {
            index,
            selector: selectorOf(node.target),
            snippet: snippetOf(node.element),
            expectedRatio: parseRatio(
              typeof data.expectedContrastRatio === 'string'
                ? data.expectedContrastRatio
                : undefined,
            ),
            outcome,
          };
          // Some incomplete reasons resolve no colors; keep the entry (the
          // panel buckets it under needs-review via its messageKey).
          if (typeof data.fgColor === 'string') entry.fgColor = data.fgColor;
          if (typeof data.bgColor === 'string') entry.bgColor = data.bgColor;
          if (typeof data.shadowColor === 'string') entry.shadowColor = data.shadowColor;
          if (typeof data.contrastRatio === 'number') entry.axeContrastRatio = data.contrastRatio;
          if (typeof data.messageKey === 'string') entry.messageKey = data.messageKey;
          if (node.element) elements.set(index, node.element);
          entries.push(entry);
          index++;
        }
      }
    }

    watchForStaleness();
    send({ kind: 'auditResult', tabId: tabId(), url: location.href, entries });
  }

  /**
   * Every external entry point calls THIS, never run() directly: a rejected
   * run must surface as auditError in the panel (which exits its Running
   * state) instead of vanishing into a void-ed promise.
   */
  async function safeRun(): Promise<void> {
    try {
      await run();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/already running/i.test(message)) {
        // Known axe rejection for concurrent runs: ignore and retry once
        // after a short delay. If the retry hits it again, stay silent — the
        // in-flight run delivers its own auditResult.
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          await run();
        } catch (err2) {
          const message2 = err2 instanceof Error ? err2.message : String(err2);
          if (!/already running/i.test(message2)) {
            send({ kind: 'auditError', tabId: tabId(), error: message2 });
          }
        }
        return;
      }
      send({ kind: 'auditError', tabId: tabId(), error: message });
    }
  }

  // ---- overlay -------------------------------------------------------------

  const OVERLAY_CSS = `
    .box { position: absolute; }
    .cvd-only { box-shadow: 0 0 0 2px #c4003d, 0 0 0 3px #ffffff; }
    .failing { box-shadow: 0 0 0 2px rgba(110, 110, 110, 0.55), 0 0 0 3px rgba(255, 255, 255, 0.55); }
    .needs-review { outline: 2px dashed #946300; box-shadow: 0 0 0 1px #ffffff; }
    .badge {
      position: absolute;
      display: flex;
      align-items: center;
      gap: 4px;
      transform: translateY(-100%);
      padding: 1px 5px;
      border-radius: 2px;
      background: #1c1c1c;
      color: #ffffff;
      font: 11px/1.5 system-ui, sans-serif;
      white-space: nowrap;
    }
    .chip { width: 9px; height: 9px; border: 1px solid #ffffff; }
    .flash { position: absolute; box-shadow: 0 0 0 4px #ffd400; transition: opacity 0.9s ease; }
    .card {
      position: absolute;
      max-width: min(340px, 90vw);
      padding: 6px;
      border-radius: 6px;
      background: #1c1c1c;
      color: #ffffff;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
      font: 12px/1.4 system-ui, sans-serif;
    }
    .card-sim {
      padding: 4px 8px;
      border-radius: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card-meta { display: flex; align-items: center; gap: 6px; margin-top: 5px; }
    .card-orig {
      max-width: 130px;
      padding: 1px 5px;
      border-radius: 3px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;

  function ensureHost(): void {
    if (host?.isConnected) return;
    host = document.createElement('div');
    host.setAttribute('data-dichroma-overlay', '');
    // The host must never affect the page: no pointer events, color-only.
    host.style.cssText =
      'position:fixed !important; inset:0 !important; width:auto !important;' +
      'height:auto !important; margin:0 !important; border:0 !important;' +
      'padding:0 !important; background:transparent !important; overflow:visible !important;' +
      'pointer-events:none !important; z-index:2147483647 !important;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    boxLayer = document.createElement('div');
    fxLayer = document.createElement('div');
    shadow.append(style, boxLayer, fxLayer);
    document.documentElement.append(host);
    try {
      // Enter the top layer so the overlay escapes the root CVD filter —
      // intentional: extension chrome shows TRUE colors, and the filter is
      // color-only so page geometry (and these boxes) are unaffected.
      host.setAttribute('popover', 'manual');
      host.showPopover();
    } catch {
      // Popover API unavailable/blocked: the plain fixed host still works,
      // it just renders beneath other top-layer content.
      host.removeAttribute('popover');
    }
  }

  function removeOverlay(): void {
    dismissCard();
    host?.remove();
    host = null;
    boxLayer = null;
    fxLayer = null;
  }

  /**
   * Release everything a finished session holds in the page: overlay,
   * staleness observer, and the index→element map. A closing panel reaches
   * this through the background's port-disconnect teardownAudit (the
   * sidePanel API has no close event of its own) or its best-effort pagehide
   * clearOverlay — a re-run re-creates all of it.
   */
  function teardown(): void {
    model = null;
    removeOverlay();
    observer?.disconnect();
    observer = null;
    elements.clear();
  }

  function renderBoxes(): void {
    if (!model || !boxLayer || !host) return;
    boxLayer.replaceChildren();
    let rendered = 0;
    for (const [key, group] of Object.entries(model.groups)) {
      const index = Number(key);
      const el = elements.get(index);
      // Prune entries whose element left the DOM.
      if (!el?.isConnected) continue;
      const rects = el.getClientRects();
      if (rects.length === 0) continue;
      rendered++;
      for (const rect of rects) {
        const box = document.createElement('div');
        box.className = `box ${group}`;
        positionBox(box, rect);
        boxLayer.append(box);
      }
      const badgeText = model.badges[index];
      if (badgeText) {
        const badge = document.createElement('div');
        badge.className = 'badge';
        const swatch = model.swatches[index];
        if (swatch && group === 'cvd-only') {
          // Split swatch: original → simulated color.
          for (const color of [swatch.orig, swatch.sim]) {
            const chip = document.createElement('span');
            chip.className = 'chip';
            chip.style.background = color;
            badge.append(chip);
          }
        }
        badge.append(badgeText);
        badge.style.left = `${rects[0].left}px`;
        badge.style.top = `${rects[0].top}px`;
        boxLayer.append(badge);
      }
    }
    host.setAttribute('data-count', String(rendered));
  }

  function positionBox(box: HTMLElement, rect: DOMRect): void {
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }

  function queueReposition(): void {
    if (repositionQueued || !host) return;
    repositionQueued = true;
    requestAnimationFrame(() => {
      repositionQueued = false;
      // Only boxLayer is rebuilt — the flash and preview card sit in fxLayer
      // so a reposition (e.g. the scroll fired by focusEntry's
      // scrollIntoView) can no longer wipe them before they paint.
      renderBoxes();
      if (card && Math.abs(window.scrollY - cardScrollY) > CARD_SCROLL_DISMISS_PX) {
        dismissCard();
      }
    });
  }

  // One rAF-throttled listener pair for the page's lifetime (the guard in
  // main() guarantees createAudit runs once per isolated world).
  document.addEventListener('scroll', queueReposition, { capture: true, passive: true });
  window.addEventListener('resize', queueReposition, { passive: true });

  function focusEntry(index: number, preview?: FocusPreview): void {
    const el = elements.get(index);
    if (!el?.isConnected) return;
    dismissCard(); // a new focusEntry replaces any live card immediately
    el.scrollIntoView({ block: 'center' });
    ensureHost();
    requestAnimationFrame(() => {
      if (!fxLayer) return;
      const rect = el.getBoundingClientRect();
      const flash = document.createElement('div');
      flash.className = 'flash';
      positionBox(flash, rect);
      fxLayer.append(flash);
      setTimeout(() => {
        flash.style.opacity = '0';
      }, 300);
      setTimeout(() => flash.remove(), 1300);
      if (preview) showCard(el, rect, preview);
    });
  }

  // ---- preview card ----------------------------------------------------------
  // Renders the panel-resolved colors directly — NEVER a per-element CSS
  // filter, which would show simulated text on the ORIGINAL background (the
  // background pixels usually belong to an ancestor the filter cannot touch).

  function dismissCard(): void {
    clearTimeout(cardTimer);
    cardTimer = undefined;
    card?.remove();
    card = null;
    host?.removeAttribute('data-preview');
  }

  function showCard(el: Element, rect: DOMRect, preview: FocusPreview): void {
    if (!fxLayer || !host) return;
    const snippet = snippetOf(el) || 'Aa';
    // Approximate the element's own type size so the preview reads like the
    // real thing, clamped to a legible-but-modest 12–28px.
    const fontSize = Math.min(28, Math.max(12, parseFloat(getComputedStyle(el).fontSize) || 16));

    card = document.createElement('div');
    card.className = 'card';
    const sim = document.createElement('div');
    sim.className = 'card-sim';
    sim.style.color = preview.simFg;
    sim.style.background = preview.simBg;
    sim.style.fontSize = `${fontSize}px`;
    sim.textContent = snippet;
    const orig = document.createElement('span');
    orig.className = 'card-orig';
    orig.style.color = preview.origFg;
    orig.style.background = preview.origBg;
    orig.textContent = snippet;
    const caption = document.createElement('span');
    caption.textContent = preview.caption; // localized by the panel
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.append(orig, caption);
    card.append(sim, meta);
    fxLayer.append(card);

    // Anchor below the element's rect, flipping above when there is no room,
    // and clamp to the viewport edges (the host is viewport-fixed).
    const margin = 8;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const left = Math.min(Math.max(rect.left, margin), Math.max(margin, innerWidth - cw - margin));
    let top = rect.bottom + margin;
    if (top + ch > innerHeight - margin) top = rect.top - ch - margin;
    top = Math.min(Math.max(top, margin), Math.max(margin, innerHeight - ch - margin));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;

    cardScrollY = window.scrollY;
    host.setAttribute('data-preview', '1');
    cardTimer = setTimeout(dismissCard, 4000);
  }

  // ---- messages ------------------------------------------------------------

  browser.runtime.onMessage.addListener((msg: unknown) => {
    if (!isAuditPageCommand(msg)) return;
    switch (msg.kind) {
      case 'rerunAudit':
        void safeRun();
        break;
      case 'updateOverlay':
        // Post-teardown no-op (documented behavior): teardownAudit cleared
        // the index→element map, so a late updateOverlay — typically a
        // reopened panel rendering its STORED results — has nothing to draw.
        // Recreating an empty host would only leave ghost chrome on the page;
        // the panel's Re-run is the recovery path that rebuilds the map (and
        // with it the overlay).
        if (elements.size === 0) break;
        model = { groups: msg.groups, badges: msg.badges, swatches: msg.swatches };
        ensureHost();
        renderBoxes();
        break;
      case 'clearOverlay':
      case 'teardownAudit':
        teardown();
        break;
      case 'focusEntry':
        focusEntry(msg.index, msg.preview);
        break;
    }
  });

  // safeRun is the only public face: it never rejects, so the `void` call
  // sites here and in main() cannot swallow an audit failure.
  return { run: safeRun };
}

export default defineUnlistedScript(() => {
  // Re-injection re-evaluates this module in the same isolated world; the
  // window flag keeps a single listener set and just re-runs the audit.
  if (window.__dichromaAudit) {
    void window.__dichromaAudit.run();
    return;
  }
  const audit = createAudit();
  window.__dichromaAudit = audit;
  void audit.run();
});
