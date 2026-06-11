import { browser } from 'wxt/browser';

/**
 * Single source of truth for the message catalog. The unit tests assert this
 * list, _locales/en and _locales/ko all carry IDENTICAL key sets, so a key
 * added in one place but forgotten elsewhere fails CI instead of shipping.
 */
export const MESSAGE_KEYS = [
  // manifest
  'extDescription',
  // popup
  'legendSimulation',
  // CVD type names (displayName routes through these; ko carries the
  // medical annotations, e.g. 'Protanopia (적색맹)')
  'typeNone',
  'typeProtanFull',
  'typeProtanPartial',
  'typeDeutanFull',
  'typeDeutanPartial',
  'typeTritanFull',
  'typeTritanPartial',
  'typeAchroma',
  'severityLabel',
  'persistLabel',
  'auditButton',
  'errCannotFilter',
  'errCannotAudit',
  'errGeneric',
  // side panel
  'panelTitle',
  'typeLabel',
  'runAudit',
  'rerunAudit',
  'runningLabel',
  'previewToggle',
  'groupCvdOnly',
  'groupFailing',
  'groupNeedsReview',
  'groupNeedsReviewHint',
  'rowCvdOnly',
  'staleBanner',
  'auditTruncated',
  'heuristicFootnote',
  'emptyState',
  'errNoAccess',
  'errAuditFailed',
  'errAuditTimeout',
  'chipOriginal',
  'chipSimulated',
  'previewCaption',
  'badgeFails',
  'ratioLine',
  // axe needs-review reasons
  'reasonDefault',
  'reasonBgImage',
  'reasonBgGradient',
  'reasonImgNode',
  'reasonBgOverlap',
  'reasonFgAlpha',
  'reasonElmPartiallyObscured',
  'reasonElmPartiallyObscuring',
  'reasonOutsideViewport',
  'reasonEqualRatio',
  'reasonShortTextContent',
  'reasonNonBmp',
  'reasonPseudoContent',
  'reasonColorParse',
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];

export type GetMessage = (key: string, substitutions?: string[]) => string;

/**
 * Injectable seam over browser.i18n.getMessage: @webext-core/fake-browser
 * does not implement i18n (getMessage throws), so unit tests build their own
 * t() from a plain function — the same seam pattern the controllers use.
 */
export function createT(getMessage: GetMessage) {
  return function t(key: MessageKey, substitutions?: string[]): string {
    let message = '';
    try {
      message = getMessage(key, substitutions);
    } catch {
      // i18n unavailable (unit tests); fall through to the key.
    }
    return message === '' ? key : message;
  };
}

/** The t() shape — what consumers accept when the call must stay injectable. */
export type Translate = ReturnType<typeof createT>;

/** Localized message for `key`; falls back to the key itself when missing. */
// The cast re-narrows the seam's `string` back to WXT's generated catalog
// union (createT only ever passes a MessageKey).
export const t = createT((key, substitutions) =>
  browser.i18n.getMessage(key as MessageKey, substitutions),
);

/** axe-core 4.12 color-contrast incomplete messageKeys → catalog keys. */
const REASON_KEYS: Record<string, MessageKey> = {
  bgImage: 'reasonBgImage',
  bgGradient: 'reasonBgGradient',
  imgNode: 'reasonImgNode',
  bgOverlap: 'reasonBgOverlap',
  fgAlpha: 'reasonFgAlpha',
  elmPartiallyObscured: 'reasonElmPartiallyObscured',
  elmPartiallyObscuring: 'reasonElmPartiallyObscuring',
  outsideViewport: 'reasonOutsideViewport',
  equalRatio: 'reasonEqualRatio',
  shortTextContent: 'reasonShortTextContent',
  nonBmp: 'reasonNonBmp',
  pseudoContent: 'reasonPseudoContent',
  colorParse: 'reasonColorParse',
};

/**
 * Catalog key for an axe needs-review messageKey; null for unknown keys so
 * callers can fall through to the raw key (mirrors utils/audit reasonLabel).
 */
export function reasonMessageKey(axeKey?: string): MessageKey | null {
  if (!axeKey) return 'reasonDefault';
  return REASON_KEYS[axeKey] ?? null;
}
