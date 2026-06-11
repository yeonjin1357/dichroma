import type { CvdType } from '@dichroma/core';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  byFailureMargin,
  classify,
  formatRatio,
  summarizeByType,
  type ClassifiedEntry,
} from '@/utils/audit';
import {
  AUDIT_CURRENT_KEY,
  auditResultKey,
  type AuditCurrent,
  type StoredAuditResult,
} from '@/utils/audit-controller';
import {
  isAuditEvent,
  type AuditBackgroundResponse,
  type AuditEntry,
  type AuditGroup,
  type AuditPageCommand,
  type FocusPreview,
} from '@/utils/audit-messages';
import { reasonMessageKey, t } from '@/utils/i18n';
import {
  BADGE,
  displayName,
  type SimulationMessage,
  type SimulationResponse,
} from '@/utils/simulation';

const CVD_TYPES: CvdType[] = ['protan', 'deutan', 'tritan', 'achromatopsia'];

const GROUPS: AuditGroup[] = ['cvd-only', 'failing', 'needs-review'];

/** Localized needs-review reason; unknown axe keys fall through raw. */
function reasonText(messageKey?: string): string {
  const key = reasonMessageKey(messageKey);
  return key ? t(key) : (messageKey as string);
}

function badgeFor(c: ClassifiedEntry, type: CvdType): string {
  if (c.group === 'cvd-only' && c.simulatedRatio !== null) {
    return `${formatRatio(c.simulatedRatio)} ${type}`;
  }
  if (c.group === 'failing') {
    const ratio = c.originalRatio ?? c.entry.axeContrastRatio;
    return ratio != null ? formatRatio(ratio) : t('badgeFails');
  }
  return reasonText(c.entry.messageKey);
}

/**
 * Text chip rendering the entry snippet in actual fg-on-bg colors. Rendered
 * from RESOLVED colors on purpose: a per-element CSS filter would show
 * simulated text on the ORIGINAL background — a combination no CVD user sees.
 */
function PreviewChip({
  kind,
  fg,
  bg,
  ratio,
  snippet,
}: {
  kind: 'original' | 'simulated';
  fg: string;
  bg: string;
  ratio: number;
  snippet: string;
}) {
  const label = t(kind === 'original' ? 'chipOriginal' : 'chipSimulated', [
    fg,
    bg,
    formatRatio(ratio),
  ]);
  return (
    <span
      className={`chip chip-${kind}`}
      role="img"
      aria-label={label}
      title={label}
      style={{ color: fg, background: bg }}
    >
      {snippet.trim() || 'Aa'}
    </span>
  );
}

function Row({
  classified,
  headline,
  onFocus,
}: {
  classified: ClassifiedEntry;
  /** Human first line ('Hard to read for Protanopia'); cvd-only rows only. */
  headline?: string;
  onFocus: (c: ClassifiedEntry) => void;
}) {
  const { entry, group, originalRatio, simulatedRatio, expected, simFg, simBg } = classified;
  const hasPreview =
    entry.fgColor != null &&
    entry.bgColor != null &&
    simFg !== null &&
    simBg !== null &&
    originalRatio !== null &&
    simulatedRatio !== null;
  return (
    <li>
      <button
        type="button"
        className="row"
        data-fg={entry.fgColor}
        data-bg={entry.bgColor}
        data-sim-fg={simFg ?? undefined}
        data-sim-bg={simBg ?? undefined}
        onClick={() => onFocus(classified)}
      >
        {/* cvd-only rows lead with the human sentence; failing/needs-review
            rows keep the snippet first. */}
        {headline !== undefined && <span className="row-headline">{headline}</span>}
        <span className="row-snippet">{entry.snippet || entry.selector}</span>
        <span className="row-detail">
          {hasPreview && (
            <>
              <PreviewChip
                kind="original"
                fg={entry.fgColor!}
                bg={entry.bgColor!}
                ratio={originalRatio!}
                snippet={entry.snippet}
              />
              <span aria-hidden="true">→</span>
              <PreviewChip
                kind="simulated"
                fg={simFg!}
                bg={simBg!}
                ratio={simulatedRatio!}
                snippet={entry.snippet}
              />
            </>
          )}
          {group === 'needs-review' && (
            <span className="row-reason">{reasonText(entry.messageKey)}</span>
          )}
        </span>
        {/* The numbers stay (localized format) but demoted to a smaller
            secondary line — the human sentence is the headline now. */}
        {originalRatio !== null && simulatedRatio !== null && (
          <span className="row-ratio">
            {t('ratioLine', [
              formatRatio(originalRatio),
              formatRatio(simulatedRatio),
              formatRatio(expected),
            ])}
          </span>
        )}
      </button>
    </li>
  );
}

/** No auditResult/auditError within this window of Run ⇒ assume it died. */
const RUN_TIMEOUT_MS = 30_000;

/** Re-apply delay while 'Preview on page' is ON, so slider drags don't spam. */
const PREVIEW_DEBOUNCE_MS = 150;

export default function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [type, setType] = useState<CvdType>('deutan');
  const [severity, setSeverity] = useState(1);
  const [preview, setPreview] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [stale, setStale] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const runTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `preview` synchronously so a debounced apply that became due in
  // the same tick the switch flipped OFF can never land AFTER the clear and
  // leave the filter stuck on (the Bug A/B failure mode, panel edition).
  // Every setPreview() is paired with a previewRef.current write.
  const previewRef = useRef(false);

  function clearRunTimer() {
    if (runTimer.current !== null) {
      clearTimeout(runTimer.current);
      runTimer.current = null;
    }
  }

  /** No auditResult/auditError within the window ⇒ assume the run died. */
  function armRunTimer() {
    clearRunTimer();
    runTimer.current = setTimeout(() => {
      runTimer.current = null;
      setStatus(t('errAuditTimeout'));
      setRunning(false);
    }, RUN_TIMEOUT_MS);
  }

  useEffect(() => clearRunTimer, []); // never fire into an unmounted panel

  useEffect(() => {
    void (async () => {
      // TEST HOOK: `?tab=<id>` overrides the target tab, same pattern as the
      // popup — the e2e suite opens sidepanel.html as a regular page. Only a
      // non-negative integer counts; anything else falls back to the audit the
      // background recorded last (audit:current — sidePanel.open resolves
      // before this document even loads, so the popup's run must be found in
      // storage, never awaited as an event), then to the active tab.
      const override = new URLSearchParams(location.search).get('tab');
      const parsed = override === null ? NaN : Number(override);
      let id: number | undefined;
      if (Number.isInteger(parsed) && parsed >= 0) {
        id = parsed;
      } else {
        const rec = await browser.storage.session.get(AUDIT_CURRENT_KEY);
        const current = rec[AUDIT_CURRENT_KEY] as AuditCurrent | undefined;
        if (typeof current?.tabId === 'number') {
          id = current.tabId;
        } else {
          const [active] = await browser.tabs.query({ active: true, currentWindow: true });
          id = active?.id;
        }
      }
      if (id == null) return;
      setTabId(id);
      // Start from the tab's live simulation settings when one is active —
      // and reflect that liveness in the 'Preview on page' switch.
      try {
        const res = (await browser.runtime.sendMessage({
          kind: 'getState',
          tabId: id,
        })) as SimulationResponse;
        if (res.ok && res.state && res.state.settings.type !== 'none') {
          setType(res.state.settings.type);
          setSeverity(res.state.settings.severity);
          previewRef.current = true;
          setPreview(true);
        }
      } catch {
        // Background unreachable; keep the deutan/1 defaults.
      }
    })();
  }, []);

  // Live events: results/errors/staleness from the page script, run/invalidate
  // announcements from the background. The stored copy is read AFTER the
  // listener is attached so a result can never fall between the two.
  useEffect(() => {
    if (tabId == null) return;
    let live = false; // a live event already rendered fresher state
    const onMessage = (msg: unknown) => {
      if (!isAuditEvent(msg)) return;
      if (msg.kind === 'auditStarted') {
        // A run began (possibly popup-triggered on ANOTHER tab): rebind to it.
        live = true;
        if (msg.tabId !== tabId) {
          // The old tab's audit session is abandoned — release its overlay,
          // staleness observer, and element map (page-script residue). The
          // preview switch is NOT carried over: it described the old tab's
          // simulation (left as-is, clearable from the popup), and silently
          // applying a filter to the new tab would be a surprise.
          const cmd: AuditPageCommand = { kind: 'teardownAudit' };
          void browser.tabs.sendMessage(tabId, cmd).catch(() => {});
          previewRef.current = false;
          setPreview(false);
        }
        armRunTimer();
        setTabId(msg.tabId);
        setEntries(null);
        setStale(false);
        setTruncated(false);
        setStatus('');
        setRunning(true);
        return;
      }
      if (msg.tabId !== tabId) return;
      if (msg.kind === 'auditResult') {
        live = true;
        clearRunTimer();
        setEntries(msg.entries);
        setStale(false);
        setTruncated(false);
        setRunning(false);
      } else if (msg.kind === 'auditError') {
        live = true;
        clearRunTimer();
        setStatus(t('errAuditFailed', [msg.error]));
        setRunning(false);
      } else {
        // auditStale (page mutated) or auditInvalidated (navigation killed
        // the page script): banner on top, results stay visible.
        setStale(true);
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    // Pull model: render the stored result immediately (a popup-triggered
    // result can be broadcast before this panel document even existed).
    // Skipped while running — a rebind must show Running, not the new tab's
    // PREVIOUS result — and yields to any live event that lands first.
    if (!running) {
      void (async () => {
        const rec = await browser.storage.session.get(auditResultKey(tabId));
        const stored = rec[auditResultKey(tabId)] as StoredAuditResult | undefined;
        if (!stored || live) return;
        setEntries(stored.entries);
        setStale(stored.stale);
        setTruncated(stored.truncated === true);
      })();
    }
    return () => browser.runtime.onMessage.removeListener(onMessage);
    // `running` is deliberately read at bind time, not a dependency:
    // re-subscribing on every running flip would tear the listener down
    // mid-run.
  }, [tabId]);

  // The expensive axe run happened once; this is pure math per type/severity.
  const classified = useMemo(
    () => (entries === null ? null : classify(entries, type, severity)),
    [entries, type, severity],
  );

  // Four-type summary chips: would-be cvd-only counts per type, recomputed
  // when the severity changes (same pure math as classify).
  const summary = useMemo(
    () => (entries === null ? null : summarizeByType(entries, severity)),
    [entries, severity],
  );

  // Re-render the in-page overlay on every local re-classification.
  useEffect(() => {
    if (tabId == null || classified === null) return;
    const groups: Record<number, AuditGroup> = {};
    const badges: Record<number, string> = {};
    const swatches: Record<number, { orig: string; sim: string }> = {};
    for (const c of classified) {
      if (c.group === 'pass') continue;
      groups[c.entry.index] = c.group;
      badges[c.entry.index] = badgeFor(c, type);
      if (c.group === 'cvd-only' && c.entry.fgColor && c.simFg) {
        swatches[c.entry.index] = { orig: c.entry.fgColor, sim: c.simFg };
      }
    }
    const msg: AuditPageCommand = { kind: 'updateOverlay', groups, badges, swatches };
    void browser.tabs.sendMessage(tabId, msg).catch(() => {});
  }, [tabId, classified, type]);

  // Best-effort overlay cleanup when the panel goes away.
  useEffect(() => {
    if (tabId == null) return;
    const onHide = () => {
      const msg: AuditPageCommand = { kind: 'clearOverlay' };
      void browser.tabs.sendMessage(tabId, msg).catch(() => {});
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [tabId]);

  /** Preview apply failed (activeTab expired): popup guidance + switch back. */
  function failPreview() {
    setStatus(t('errNoAccess'));
    previewRef.current = false;
    setPreview(false);
  }

  // 'Preview on page': while ON, (re-)apply the panel's type/severity to the
  // bound tab through the EXISTING simulation family — the background still
  // owns insertCSS, per-tab state, and the badge. Debounced so severity
  // slider drags coalesce into one apply (popup-slider precedent).
  useEffect(() => {
    if (!preview || tabId == null) return;
    const timer = setTimeout(() => {
      if (!previewRef.current) return; // switched OFF before the timer fired
      void (async () => {
        const msg: SimulationMessage = { kind: 'apply', tabId, settings: { type, severity } };
        try {
          const res = (await browser.runtime.sendMessage(msg)) as SimulationResponse;
          if (!res.ok) failPreview();
        } catch {
          failPreview();
        }
      })();
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [preview, tabId, type, severity]);

  function onPreviewToggle(checked: boolean) {
    previewRef.current = checked;
    setPreview(checked);
    if (!checked && tabId != null) {
      // Turning OFF clears immediately (no debounce — nothing to coalesce).
      const msg: SimulationMessage = { kind: 'clear', tabId };
      void browser.runtime.sendMessage(msg).catch(() => {});
    }
  }

  function failRun(message: string) {
    clearRunTimer();
    setStatus(message);
    setRunning(false);
  }

  async function runAudit() {
    if (tabId == null) return;
    setStatus('');
    setRunning(true);
    armRunTimer();
    try {
      const res = (await browser.runtime.sendMessage({
        kind: 'runAudit',
        tabId,
      })) as AuditBackgroundResponse | undefined;
      if (!res?.ok) failRun(t('errNoAccess'));
      // On ok the page script sends auditResult/auditError, which clears the
      // timer and flips `running` back.
    } catch {
      failRun(t('errNoAccess'));
    }
  }

  function focusEntry(c: ClassifiedEntry) {
    if (tabId == null) return;
    // The preview card is built panel-side from the SAME classify() colors as
    // the row chips; the caption ships pre-localized so the page script never
    // touches i18n.
    let preview: FocusPreview | undefined;
    if (c.entry.fgColor && c.entry.bgColor && c.simFg && c.simBg) {
      preview = {
        simFg: c.simFg,
        simBg: c.simBg,
        origFg: c.entry.fgColor,
        origBg: c.entry.bgColor,
        caption: t('previewCaption', [displayName(type, severity), `${Math.round(severity * 100)}%`]),
      };
    }
    const msg: AuditPageCommand = { kind: 'focusEntry', index: c.entry.index, preview };
    void browser.tabs.sendMessage(tabId, msg).catch(() => {});
  }

  const ready = tabId != null;
  const grouped = useMemo(() => {
    const map: Record<AuditGroup, ClassifiedEntry[]> = {
      'cvd-only': [],
      failing: [],
      'needs-review': [],
    };
    for (const c of classified ?? []) {
      if (c.group !== 'pass') map[c.group].push(c);
    }
    // Worst failures first (sort is stable, so ties keep axe's DOM order);
    // needs-review has no margin to sort by.
    map['cvd-only'].sort(byFailureMargin);
    map.failing.sort(byFailureMargin);
    return map;
  }, [classified]);

  /** Localized human-sentence group heading (type name substituted). */
  function groupTitle(group: AuditGroup): string {
    if (group === 'cvd-only') return t('groupCvdOnly', [displayName(type, severity)]);
    if (group === 'failing') return t('groupFailing');
    return t('groupNeedsReview');
  }

  return (
    <main>
      <header className="controls">
        <h1>{t('panelTitle')}</h1>

        {/* Four-type summary: would-be cvd-only count per type at the current
            severity. A chip click is the same local reclassification as the
            select; the active type is marked by border + underline +
            aria-pressed, never color alone. */}
        {summary && (
          <div className="summary-bar">
            {CVD_TYPES.map((value, i) => {
              const label = `${displayName(value, severity)}: ${summary[value]}`;
              return (
                <Fragment key={value}>
                  {i > 0 && <span aria-hidden="true">·</span>}
                  <button
                    type="button"
                    className="type-chip"
                    aria-pressed={type === value}
                    aria-label={label}
                    title={label}
                    onClick={() => setType(value)}
                  >
                    {BADGE[value]} {summary[value]}
                  </button>
                </Fragment>
              );
            })}
          </div>
        )}

        <div className="field">
          <label htmlFor="cvd-type">{t('typeLabel')}</label>
          <select
            id="cvd-type"
            value={type}
            disabled={!ready}
            onChange={(e) => setType(e.target.value as CvdType)}
          >
            {/* Severity-aware (-opia at 1, -omaly below) and localized via
                the catalog — consistent with the popup radios, the summary
                chips, and the preview caption. */}
            {CVD_TYPES.map((value) => (
              <option key={value} value={value}>
                {displayName(value, severity)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="severity">{t('severityLabel')}</label>
          <input
            id="severity"
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={severity}
            disabled={!ready}
            onChange={(e) => setSeverity(Number(e.target.value))}
          />
          <output htmlFor="severity">{severity.toFixed(1)}</output>
        </div>

        <label className="preview-toggle">
          <input
            type="checkbox"
            role="switch"
            checked={preview}
            disabled={!ready}
            onChange={(e) => onPreviewToggle(e.target.checked)}
          />
          {t('previewToggle')}
        </label>

        <button type="button" disabled={!ready || running} onClick={() => void runAudit()}>
          {running ? t('runningLabel') : entries === null ? t('runAudit') : t('rerunAudit')}
        </button>
      </header>

      {stale && (
        <p className="banner" role="status">
          {t('staleBanner')}
        </p>
      )}

      {truncated && (
        <p className="banner" role="status">
          {t('auditTruncated')}
        </p>
      )}

      {/* Always mounted so screen readers announce changes. */}
      <p className="footnote" role="status" style={status ? undefined : { display: 'none' }}>
        {status}
      </p>

      {entries === null ? (
        <p className="empty">{t('emptyState')}</p>
      ) : (
        GROUPS.map((group) => {
          const rows = grouped[group];
          const headline =
            group === 'cvd-only' ? t('rowCvdOnly', [displayName(type, severity)]) : undefined;
          const list = rows.length > 0 && (
            <ul>
              {rows.map((c) => (
                <Row key={c.entry.index} classified={c} headline={headline} onFocus={focusEntry} />
              ))}
            </ul>
          );
          if (group === 'needs-review') {
            // Collapsed by default: rows here are inconclusive, not failures.
            // Native <details>/<summary> is keyboard- and screen-reader-
            // accessible without extra wiring.
            return (
              <details key={group} className={`group ${group}`}>
                <summary>
                  <h2>
                    {groupTitle(group)} ({rows.length}){' '}
                    <span className="hint">{t('groupNeedsReviewHint')}</span>
                  </h2>
                </summary>
                {list}
              </details>
            );
          }
          return (
            <section key={group} className={`group ${group}`}>
              <h2>
                {groupTitle(group)} ({rows.length})
              </h2>
              {list}
            </section>
          );
        })
      )}

      {/* Heuristic disclosure — always present: simulated-space ratios are
          estimates, never a normative WCAG verdict. */}
      <p className="heuristic-note">{t('heuristicFootnote')}</p>
    </main>
  );
}
