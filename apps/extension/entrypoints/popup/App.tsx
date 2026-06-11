import type { CvdType } from '@dichroma/core';
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { t } from '@/utils/i18n';
import {
  displayName,
  type Prefs,
  type SimulationMessage,
  type SimulationResponse,
  type SimulationSettings,
} from '@/utils/simulation';

const CVD_TYPES: CvdType[] = ['protan', 'deutan', 'tritan', 'achromatopsia'];

type Choice = CvdType | 'none';

async function sendMessage(msg: SimulationMessage): Promise<SimulationResponse> {
  return (await browser.runtime.sendMessage(msg)) as SimulationResponse;
}

export default function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [choice, setChoice] = useState<Choice>('none');
  const [severity, setSeverity] = useState(1);
  const [persist, setPersist] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    void (async () => {
      // TEST HOOK: `?tab=<id>` overrides the target tab. The e2e suite opens
      // popup.html as a regular page, which would otherwise make popup.html
      // itself the "active tab". Only a non-negative integer counts;
      // anything else falls back to the active-tab query.
      const override = new URLSearchParams(location.search).get('tab');
      const parsed = override === null ? NaN : Number(override);
      let id: number | undefined;
      if (Number.isInteger(parsed) && parsed >= 0) {
        id = parsed;
      } else {
        const [active] = await browser.tabs.query({ active: true, currentWindow: true });
        id = active?.id;
      }
      if (id == null) return;
      setTabId(id);
      try {
        const res = await sendMessage({ kind: 'getState', tabId: id });
        if (res.ok && res.state) {
          setChoice(res.state.settings.type);
          setSeverity(res.state.settings.severity);
        }
      } catch {
        setStatus(t('errGeneric'));
      }
      const { prefs } = await browser.storage.local.get('prefs');
      setPersist((prefs as Prefs | undefined)?.persist ?? false);
    })();
  }, []);

  // The background owns insertCSS/removeCSS, per-tab state, and the badge;
  // the popup only sends messages.
  async function send(settings: SimulationSettings) {
    if (tabId == null) return;
    try {
      const res = await sendMessage(
        settings.type === 'none'
          ? { kind: 'clear', tabId }
          : { kind: 'apply', tabId, settings },
      );
      setStatus(res.ok ? '' : t('errCannotFilter'));
    } catch {
      setStatus(t('errGeneric'));
    }
  }

  function onChoice(next: Choice) {
    setChoice(next);
    void send({ type: next, severity });
  }

  function onSeverity(next: number) {
    setSeverity(next);
    if (choice !== 'none') void send({ type: choice, severity: next });
  }

  async function onAudit() {
    if (tabId == null) return;
    try {
      // sidePanel.open consumes the click's user gesture, so it must be the
      // FIRST async call here — never routed through a background hop.
      await browser.sidePanel.open({ tabId });
      const res = (await browser.runtime.sendMessage({ kind: 'runAudit', tabId })) as
        | { ok: boolean }
        | undefined;
      setStatus(res?.ok ? '' : t('errCannotAudit'));
    } catch {
      setStatus(t('errGeneric'));
    }
  }

  async function onPersist(checked: boolean) {
    if (checked) {
      // A change event in the popup is a valid user gesture for this prompt.
      const granted = await browser.permissions.request({ origins: ['<all_urls>'] });
      if (!granted) {
        setPersist(false);
        return;
      }
    }
    // Unchecking only clears the flag; the permission is kept so re-enabling
    // needs no second prompt (never revoke silently).
    setPersist(checked);
    const { prefs } = await browser.storage.local.get('prefs');
    await browser.storage.local.set({
      prefs: { ...((prefs as Prefs | undefined) ?? {}), persist: checked },
    });
  }

  // Controls stay disabled until the target tab is known so a click can
  // never race the async init and silently go nowhere.
  const ready = tabId != null;

  return (
    <main>
      <h1>dichroma</h1>

      <fieldset>
        <legend>{t('legendSimulation')}</legend>
        <label className="choice">
          <input
            type="radio"
            name="cvd"
            value="none"
            checked={choice === 'none'}
            disabled={!ready}
            onChange={() => onChoice('none')}
          />
          {displayName('none', severity)}
        </label>
        {CVD_TYPES.map((type) => (
          <label className="choice" key={type}>
            <input
              type="radio"
              name="cvd"
              value={type}
              checked={choice === type}
              disabled={!ready}
              onChange={() => onChoice(type)}
            />
            {/* Severity-aware (-opia at 1, -omaly below) AND localized: ko
                carries the medical annotations via the catalog. */}
            {displayName(type, severity)}
          </label>
        ))}
      </fieldset>

      <div className="severity">
        <label htmlFor="severity">{t('severityLabel')}</label>
        <input
          id="severity"
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={severity}
          disabled={!ready || choice === 'none'}
          onChange={(e) => onSeverity(Number(e.target.value))}
        />
        <output htmlFor="severity">{severity.toFixed(1)}</output>
      </div>

      <label className="choice">
        <input
          type="checkbox"
          checked={persist}
          disabled={!ready}
          onChange={(e) => void onPersist(e.target.checked)}
        />
        {t('persistLabel')}
      </label>

      <button type="button" disabled={!ready} onClick={() => void onAudit()}>
        {t('auditButton')}
      </button>

      {/* Always mounted so screen readers announce changes to the live
          region; the box styling is suppressed while there is no message. */}
      <p
        className="footnote"
        role="status"
        style={status ? undefined : { padding: 0, border: 'none' }}
      >
        {status}
      </p>
    </main>
  );
}
