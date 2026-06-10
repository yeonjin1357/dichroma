import type { CvdType } from '@dichroma/core';
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  displayName,
  type Prefs,
  type SimulationMessage,
  type SimulationResponse,
  type SimulationSettings,
} from '@/utils/simulation';

const CVD_TYPES: CvdType[] = ['protan', 'deutan', 'tritan', 'achromatopsia'];

type Choice = CvdType | 'none';

const GENERIC_ERROR = 'Something went wrong. Try reopening the popup.';

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
      // itself the "active tab".
      const override = new URLSearchParams(location.search).get('tab');
      let id: number | undefined;
      if (override) {
        id = Number(override);
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
        setStatus(GENERIC_ERROR);
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
      setStatus(res.ok ? '' : 'This page cannot be filtered.');
    } catch {
      setStatus(GENERIC_ERROR);
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
        <legend>Color vision simulation</legend>
        <label className="choice">
          <input
            type="radio"
            name="cvd"
            value="none"
            checked={choice === 'none'}
            disabled={!ready}
            onChange={() => onChoice('none')}
          />
          None
        </label>
        {CVD_TYPES.map((t) => (
          <label className="choice" key={t}>
            <input
              type="radio"
              name="cvd"
              value={t}
              checked={choice === t}
              disabled={!ready}
              onChange={() => onChoice(t)}
            />
            {displayName(t, severity)}
          </label>
        ))}
      </fieldset>

      <div className="severity">
        <label htmlFor="severity">Severity</label>
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
        Keep across page navigation
      </label>

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
