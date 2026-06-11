import type { CvdType } from '@dichroma/core';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { MessageKey } from '../lib/i18n';
import { CVD_TYPES } from '../lib/palette';
import { SAMPLE_IMAGE_URL } from '../lib/sample-image';
import { simulateImageDataCopy } from '../lib/simulate-image';

export const TYPE_KEYS: Record<CvdType, MessageKey> = {
  protan: 'typeProtan',
  deutan: 'typeDeutan',
  tritan: 'typeTritan',
  achromatopsia: 'typeAchroma',
};

interface Props {
  t: (key: MessageKey) => string;
}

export function ImageSimulator({ t }: Props) {
  const [type, setType] = useState<CvdType>('protan');
  const [severity, setSeverity] = useState(1);
  // The sample loads on mount; uploads replace it.
  const [imageUrl, setImageUrl] = useState(SAMPLE_IMAGE_URL);
  const [drawCount, setDrawCount] = useState(0);
  const originalRef = useRef<HTMLCanvasElement>(null);
  const simulatedRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Draw the current image onto the original canvas at its natural size.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      const canvas = originalRef.current;
      if (cancelled || !canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      setDrawCount((n) => n + 1);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Re-simulate on image/type/severity changes, debounced ~100ms so dragging
  // the severity slider doesn't re-run the full-image pass on every tick.
  useEffect(() => {
    if (drawCount === 0) return;
    const id = window.setTimeout(() => {
      const original = originalRef.current;
      const simulated = simulatedRef.current;
      const ctx = original?.getContext('2d');
      if (!original || !simulated || !ctx || original.width === 0) return;
      const src = ctx.getImageData(0, 0, original.width, original.height);
      const out = simulateImageDataCopy(src, type, severity);
      simulated.width = original.width;
      simulated.height = original.height;
      simulated
        .getContext('2d')
        ?.putImageData(new ImageData(out, original.width, original.height), 0, 0);
    }, 100);
    return () => window.clearTimeout(id);
  }, [drawCount, type, severity]);

  const loadFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setImageUrl(objectUrlRef.current);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    loadFile(event.dataTransfer.files[0]);
  };

  const download = () => {
    const canvas = simulatedRef.current;
    if (!canvas || canvas.width === 0) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `dichroma-${type}-${severity.toFixed(1)}.png`;
    a.click();
  };

  return (
    <section
      aria-labelledby="sim-title"
      onDrop={onDrop}
      onDragOver={(event) => event.preventDefault()}
    >
      <h2 id="sim-title">{t('simTitle')}</h2>
      <p>{t('simIntro')}</p>

      <div className="controls">
        <div className="control">
          <label htmlFor="sim-type">{t('typeLabel')}</label>
          <select
            id="sim-type"
            data-testid="sim-type"
            value={type}
            onChange={(event) => setType(event.target.value as CvdType)}
          >
            {CVD_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(TYPE_KEYS[value])}
              </option>
            ))}
          </select>
        </div>
        <div className="control">
          <label htmlFor="sim-severity">{t('severityLabel')}</label>
          <input
            id="sim-severity"
            data-testid="sim-severity"
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={severity}
            onChange={(event) => setSeverity(Number(event.target.value))}
          />
          <output htmlFor="sim-severity">{severity.toFixed(1)}</output>
        </div>
      </div>

      <p className="drop-row">
        {t('dropHint')}{' '}
        <label className="button">
          {t('chooseFile')}
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => loadFile(event.target.files?.[0])}
          />
        </label>{' '}
        <button type="button" className="button" onClick={() => setImageUrl(SAMPLE_IMAGE_URL)}>
          {t('useSample')}
        </button>
      </p>

      <div className="canvas-pair">
        <figure>
          <figcaption>{t('originalLabel')}</figcaption>
          <canvas
            ref={originalRef}
            data-testid="canvas-original"
            role="img"
            aria-label={t('originalLabel')}
          />
        </figure>
        <figure>
          <figcaption>{t('simulatedLabel')}</figcaption>
          <canvas
            ref={simulatedRef}
            data-testid="canvas-simulated"
            role="img"
            aria-label={`${t('simulatedLabel')} — ${t(TYPE_KEYS[type])}`}
          />
        </figure>
      </div>

      <p className="sim-actions">
        <button type="button" className="button" onClick={download}>
          {t('downloadPng')}
        </button>
        <span className="privacy-note">{t('privacyNote')}</span>
      </p>
    </section>
  );
}
