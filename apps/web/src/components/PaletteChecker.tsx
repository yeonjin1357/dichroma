import { useMemo, useState } from 'react';
import type { MessageKey } from '../lib/i18n';
import { formatRatio, normalizeHex, paletteRows, type Badges } from '../lib/palette';
import { TYPE_KEYS } from './ImageSimulator';

const BADGE_DEFS: ReadonlyArray<{ key: keyof Badges; label: string }> = [
  { key: 'aaLarge', label: 'AA Large' },
  { key: 'aa', label: 'AA' },
  { key: 'aaa', label: 'AAA' },
];

interface Props {
  t: (key: MessageKey) => string;
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [text, setText] = useState(value);

  return (
    <div className="control">
      <label htmlFor={id}>{label}</label>
      <span className="color-field">
        <input
          id={id}
          data-testid={`${id}-picker`}
          type="color"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setText(event.target.value);
          }}
        />
        <input
          type="text"
          data-testid={`${id}-hex`}
          aria-label={`${label} (hex)`}
          value={text}
          size={9}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            const hex = normalizeHex(event.target.value);
            if (hex) onChange(hex);
          }}
        />
      </span>
    </div>
  );
}

export function PaletteChecker({ t }: Props) {
  const [fg, setFg] = useState('#ff4444');
  const [bg, setBg] = useState('#171b26');
  const [severity, setSeverity] = useState(1);
  const rows = useMemo(() => paletteRows(fg, bg, severity), [fg, bg, severity]);

  return (
    <section aria-labelledby="palette-title">
      <h2 id="palette-title">{t('paletteTitle')}</h2>
      <p>{t('paletteIntro')}</p>

      <div className="controls">
        <ColorField id="fg" label={t('fgLabel')} value={fg} onChange={setFg} />
        <ColorField id="bg" label={t('bgLabel')} value={bg} onChange={setBg} />
        <div className="control">
          <label htmlFor="palette-severity">{t('severityLabel')}</label>
          <input
            id="palette-severity"
            data-testid="palette-severity"
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={severity}
            onChange={(event) => setSeverity(Number(event.target.value))}
          />
          <output htmlFor="palette-severity">{severity.toFixed(1)}</output>
        </div>
      </div>

      <table className="palette-table">
        <thead>
          <tr>
            <th scope="col">{t('visionColumn')}</th>
            <th scope="col">{t('previewColumn')}</th>
            <th scope="col">{t('ratioColumn')}</th>
            <th scope="col">{t('badgesColumn')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.vision} data-testid={`palette-row-${row.vision}`}>
              <th scope="row">
                {row.vision === 'normal' ? t('normalVision') : t(TYPE_KEYS[row.vision])}
              </th>
              <td>
                <span className="chip" style={{ color: row.fg, backgroundColor: row.bg }}>
                  {t('sampleText')}
                </span>
              </td>
              <td data-testid="ratio">{formatRatio(row.ratio)}</td>
              <td>
                {BADGE_DEFS.map(({ key, label }) => {
                  const pass = row.badges[key];
                  const passText = pass ? t('badgePass') : t('badgeFail');
                  return (
                    <span
                      key={key}
                      className={`badge ${pass ? 'badge-pass' : 'badge-fail'}`}
                      data-badge={key}
                      data-pass={pass ? 'true' : 'false'}
                    >
                      {label} <span aria-hidden="true">{pass ? '✓' : '✕'}</span>
                      <span className="visually-hidden">{passText}</span>
                    </span>
                  );
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
