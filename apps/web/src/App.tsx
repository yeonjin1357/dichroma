import { useCallback, useEffect, useState } from 'react';
import { ImageSimulator } from './components/ImageSimulator';
import { PaletteChecker } from './components/PaletteChecker';
import { detectLang, LANG_STORAGE_KEY, messages, type Lang, type MessageKey } from './lib/i18n';

export default function App() {
  const [lang, setLang] = useState<Lang>(() =>
    detectLang(localStorage.getItem(LANG_STORAGE_KEY), navigator.language),
  );

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key: MessageKey) => messages[lang][key], [lang]);

  return (
    <>
      <header className="site-header">
        <span className="brand">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={32} height={32} />
          <span className="wordmark">dichroma</span>
        </span>
        <nav aria-label="dichroma">
          {/* Placeholder kept literal until the Chrome Web Store listing goes live. */}
          <a href="<CHROME_WEB_STORE_URL>">{t('linkExtension')}</a>
          <a href="https://www.npmjs.com/package/@dichroma/core">{t('linkNpm')}</a>
          <a href="https://github.com/yeonjin1357/dichroma">{t('linkGithub')}</a>
          <button
            type="button"
            className="button"
            data-testid="lang-toggle"
            onClick={() => setLang(lang === 'en' ? 'ko' : 'en')}
            lang={lang === 'en' ? 'ko' : 'en'}
          >
            {t('langToggle')}
          </button>
        </nav>
      </header>

      <main>
        <p className="tagline">{t('tagline')}</p>
        <ImageSimulator t={t} />
        <PaletteChecker t={t} />
      </main>

      <footer className="site-footer">
        <p>{t('footerDisclaimer')}</p>
      </footer>
    </>
  );
}
