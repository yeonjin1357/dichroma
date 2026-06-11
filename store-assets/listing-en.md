# Chrome Web Store listing — English

Copy each section below into the matching dashboard field. Sections marked
*ships in the package* are taken from the manifest and cannot be edited in the
dashboard — they are listed here so you can verify what the store will show.

---

## Name — *ships in the package* (45-char limit)

```
dichroma — color vision simulator & audit
```

41 characters (fits the 45-char limit). The store title comes from the
manifest `name` and is NOT editable in the dashboard. The package ships with
the plain name `dichroma`; if you want the full title above, change the one
`name: 'dichroma'` line in `apps/extension/wxt.config.ts` to that string and
re-run `pnpm build && pnpm zip` before uploading. Left as is, the listing
title will simply be **dichroma**.

## Short description / Summary — *ships in the package* (132-char limit)

```
Scientifically accurate color-vision-deficiency simulator and contrast checker
```

78 characters. Comes from the manifest `description` → `_locales/en/messages.json`
(`extDescription`); nothing to paste. The Korean summary ships the same way
(see `listing-ko.md`).

## Detailed description (paste into Store listing → Description)

```
See your site the way color-blind users see it — and catch the contrast failures only they experience.

dichroma applies scientifically accurate color-vision-deficiency (CVD) simulation to any page, live. Pick a deficiency type, drag the severity slider, and the page re-renders the way a person with protanopia, deuteranopia, tritanopia, or complete color blindness perceives it. Then run the built-in contrast audit: it re-checks the page's text in the SIMULATED color space and surfaces text that passes WCAG for typical vision but becomes hard to read under color blindness — failures ordinary contrast checkers cannot report.

WHY DICHROMA
• Scientifically accurate: implements the peer-reviewed Viénot (1999), Brettel (1997), and Machado (2009) models with correct linear-RGB math, validated against the DaltonLens reference data — not a rough approximation.
• Adjustable severity: simulate anything from mild anomalous trichromacy to complete dichromacy with a 0–100% slider. Chrome DevTools' built-in emulation only offers fixed, full-severity rendering.
• A contrast audit no other checker does: WCAG ratios are re-computed after mapping both text and background colors through the CVD model, finding red/green pairs that read fine for most people but fail for roughly 1 in 12 men.

FEATURES
• Five simulation modes: Protanopia, Deuteranopia, Tritanopia, Achromatopsia, or off — anomaly variants via the severity slider
• Severity slider (0–100%) with live re-rendering
• Optional "Keep across page navigation": re-applies your simulation after reloads and navigation (asks for host access only if you opt in)
• Assignable keyboard shortcut to toggle the simulation (chrome://extensions/shortcuts)
• Side-panel contrast audit with grouped results: "readable now but fails under CVD", "already failing WCAG for everyone", and "needs review"
• Original-vs-simulated preview chips on every finding, plus per-type summary counts
• Click a finding to scroll to the element, flash it, and show an in-page preview card; flagged elements are outlined by a page overlay
• English and Korean UI

HONEST LIMITATIONS
Top-layer content (open <dialog> elements, fullscreen video) escapes page-level CSS filters and renders unsimulated. chrome:// pages, the Chrome Web Store, and other restricted pages cannot be filtered or audited. The contrast audit inspects the top-level frame only — iframe content is skipped. Simulated ratios are estimates derived from CVD color models, not a normative WCAG verdict; treat findings as candidates for human review.

PRIVACY
dichroma collects no data of any kind. All color analysis runs locally in your browser; the extension makes no network requests. The only stored data are your own settings and per-tab audit results, kept in Chrome's extension storage on your machine.

THIRD-PARTY SOFTWARE
The contrast audit ships axe-core (© Deque Systems, Inc., MPL-2.0) unmodified as vendor/axe.min.js, with its license included in the package at vendor/LICENSE.

Source code: https://github.com/yeonjin1357/dichroma
```

## Category recommendation

As of June 2026 the dashboard offers 17 categories in three groups
(Productivity / Lifestyle / Make Chrome Yours). There IS an **Accessibility**
category (under "Make Chrome Yours") — but dichroma's audience is designers
and developers checking their own work, so pick:

- **Primary category: Developer Tools** (under Productivity)
- Runner-up if you prefer reach over fit: Accessibility

## Single-purpose statement (paste into Privacy practices → Single purpose)

```
dichroma has a single purpose: simulating color-vision deficiencies for the current page. It renders the page the way color-blind users perceive it (user-selected type and severity) and audits the page's text contrast in that same simulated color space. Every feature — the popup controls, the keyboard shortcut, the side-panel contrast audit with its on-page highlights, and the optional re-apply-after-navigation setting — serves this one purpose. No data is collected.
```

## Permission justifications (paste one per field in Privacy practices)

**activeTab**

```
Grants temporary access to the one tab the user is acting on, and only after an explicit user gesture (opening the dichroma popup or pressing the assigned keyboard shortcut). dichroma uses it to insert/remove the simulation CSS filter and to run the contrast audit on that tab alone. This is the narrowest possible alternative to persistent host permissions, which dichroma deliberately does not request.
```

**scripting**

```
Required for chrome.scripting.insertCSS/removeCSS, which apply and cleanly remove the page-wide simulation filter, and for chrome.scripting.executeScript, which injects the bundled audit script and the bundled axe-core library into the audited tab. It only ever operates on tabs the user granted through activeTab or the optional host permission below — never on arbitrary pages in the background.
```

**storage**

```
Stores the user's own settings (chrome.storage.local — e.g. the "Keep across page navigation" preference) and per-tab session state plus contrast-audit results (chrome.storage.session, which Chrome clears automatically when the browser closes). Nothing leaves the machine; this is the minimal mechanism for the popup, side panel, and background worker to share state.
```

**sidePanel**

```
The contrast-audit results are shown in Chrome's side panel so the user can read the findings next to the audited page; clicking a finding highlights the matching element on the page. The panel only opens on a user action (the popup's "Audit contrast" button).
```

**Optional host permission `<all_urls>`** (optional_host_permissions)

```
Requested at runtime only when the user enables the optional "Keep across page navigation" setting, which re-applies their chosen simulation after reloads and navigations — something activeTab alone cannot do, because a navigation invalidates its grant. It is declared optional so a default install needs no host access at all; if the user declines the prompt, the setting simply stays off and everything else keeps working.
```

## Data-usage disclosure answers (Privacy practices → Data usage)

- **"What user data do you plan to collect?"** — check **nothing**. dichroma
  collects none of the listed categories (no personally identifiable
  information, no health/financial/authentication information, no personal
  communications, no location, no web history, no user activity, no website
  content). Audit results are derived locally and never leave the browser.
- **Certifications** — check **all three** boxes (no sale/transfer of user
  data outside approved use cases; no use/transfer unrelated to the single
  purpose; no use for creditworthiness/lending). Trivially true: no user data
  is collected at all.
- **Remote code** — answer **No**. All code ships inside the package.
  axe-core 4.12.0 is bundled unmodified at `vendor/axe.min.js` (minified, not
  obfuscated) with its MPL-2.0 license at `vendor/LICENSE`. No remotely
  hosted code is loaded or evaluated (Manifest V3 compliant).
- **Privacy policy URL** (set on the developer **account** page) —
  `https://github.com/yeonjin1357/dichroma/blob/main/PRIVACY.md` (fill in after the repo is public).
