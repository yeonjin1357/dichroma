// Typed en/ko dictionary for the one-page app. Korean wording (medical-
// annotated type names, footnote, UI labels) mirrors the extension's
// _locales/ko/messages.json — values copied, no cross-app import.

const en = {
  tagline: 'Scientifically accurate color-vision-deficiency simulator and contrast checker',
  linkExtension: 'Chrome extension',
  linkNpm: 'npm',
  linkGithub: 'GitHub',
  langToggle: '한국어',
  simTitle: 'Image simulator',
  simIntro: 'See any image the way people with color vision deficiency see it.',
  typeLabel: 'Type',
  typeProtan: 'Protanopia (red-blind)',
  typeDeutan: 'Deuteranopia (green-blind)',
  typeTritan: 'Tritanopia (blue-yellow-blind)',
  typeAchroma: 'Achromatopsia (no color)',
  severityLabel: 'Severity',
  dropHint: 'Drag & drop an image here, or',
  chooseFile: 'Choose a file',
  useSample: 'Use sample image',
  originalLabel: 'Original',
  simulatedLabel: 'Simulated',
  downloadPng: 'Download PNG',
  privacyNote: 'Images never leave your browser.',
  paletteTitle: 'Palette checker',
  paletteIntro: 'Check a text/background pair against WCAG — for everyone.',
  fgLabel: 'Text color',
  bgLabel: 'Background color',
  visionColumn: 'Vision',
  previewColumn: 'Preview',
  ratioColumn: 'Contrast',
  badgesColumn: 'WCAG',
  normalVision: 'Normal vision',
  sampleText: 'Sample text',
  badgePass: 'pass',
  badgeFail: 'fail',
  footerDisclaimer:
    'Simulated ratios are estimates from CVD color models — not a normative WCAG result.',
} as const;

export type MessageKey = keyof typeof en;

const ko: Record<MessageKey, string> = {
  tagline: '과학적으로 정확한 색각 이상(CVD) 시뮬레이터 겸 대비 검사 도구',
  linkExtension: 'Chrome 확장 프로그램',
  linkNpm: 'npm',
  linkGithub: 'GitHub',
  langToggle: 'English',
  simTitle: '이미지 시뮬레이터',
  simIntro: '색각 이상이 있는 사람에게 이미지가 어떻게 보이는지 확인해 보세요.',
  typeLabel: '유형',
  typeProtan: 'Protanopia (적색맹)',
  typeDeutan: 'Deuteranopia (녹색맹)',
  typeTritan: 'Tritanopia (청황색맹)',
  typeAchroma: 'Achromatopsia (전색맹)',
  severityLabel: '심각도',
  dropHint: '이미지를 여기에 끌어다 놓거나',
  chooseFile: '파일 선택',
  useSample: '샘플 이미지 사용',
  originalLabel: '원본',
  simulatedLabel: '시뮬레이션',
  downloadPng: 'PNG 다운로드',
  privacyNote: '이미지는 브라우저 밖으로 전송되지 않습니다.',
  paletteTitle: '팔레트 검사',
  paletteIntro: '글자/배경 색 조합이 모두에게 WCAG를 통과하는지 확인하세요.',
  fgLabel: '글자 색',
  bgLabel: '배경 색',
  visionColumn: '색각',
  previewColumn: '미리보기',
  ratioColumn: '대비',
  badgesColumn: 'WCAG',
  normalVision: '일반 색각',
  sampleText: '샘플 텍스트',
  badgePass: '통과',
  badgeFail: '실패',
  footerDisclaimer: '시뮬레이션 비율은 색각 모델 기반 추정치로, WCAG 공식 판정값이 아닙니다.',
};

export type Lang = 'en' | 'ko';

export const messages: Record<Lang, Record<MessageKey, string>> = { en, ko };

export const LANG_STORAGE_KEY = 'dichroma.lang';

/**
 * Resolve the UI language: a valid stored choice wins, otherwise
 * navigator.language (ko* → ko, anything else → en).
 */
export function detectLang(stored: string | null, navigatorLanguage: string | undefined): Lang {
  if (stored === 'en' || stored === 'ko') return stored;
  return navigatorLanguage?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}
