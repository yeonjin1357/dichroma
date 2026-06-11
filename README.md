# dichroma

**English** | [한국어](README.ko.md)

<img width="1280" height="800" alt="01-simulation-before-after" src="https://github.com/user-attachments/assets/f78e077e-0bf5-45fa-9e84-e6a9f1d46a27" />
<img width="1280" height="800" alt="03-audit-panel" src="https://github.com/user-attachments/assets/d5dfa3fc-1bc8-4efd-ba5d-f19e52d4626a" />
<img width="1280" height="800" alt="02-popup" src="https://github.com/user-attachments/assets/98a39dc3-77bf-429b-b2ee-9bceb8b52bee" />
<img width="1280" height="800" alt="04-preview-card" src="https://github.com/user-attachments/assets/dfe095d4-d65e-441d-a92b-5560ad3412b6" />



dichroma is a Chrome extension and pure-TypeScript color-science library for
simulating color-vision deficiencies and checking contrast. It applies
scientifically accurate CVD models (Viénot 1999, Brettel 1997, Machado 2009)
to live pages and audits WCAG contrast in the simulated color space, helping
designers and developers see their work the way color-blind users do.

📖 [Read the validation write-up](docs/validation-en.md) — how the simulation was built and proven correct, pixel by pixel.

## Monorepo layout

```
.
├── packages/
│   └── core/        # @dichroma/core — pure-TS color-science engine
├── apps/
│   └── extension/   # WXT + React Chrome extension
├── e2e/             # Playwright e2e tests (M1/M2)
├── store-assets/    # Chrome Web Store icons, screenshots, listing copy (M5)
└── tools/           # gen-golden.py golden-value generator (M1)
```

## Install

Get dichroma from the Chrome Web Store: `<CHROME_WEB_STORE_URL>`
*(link lands here once the listing is approved — see
`store-assets/SUBMISSION.md`)*.

Or load it unpacked from source:

```sh
pnpm install
pnpm build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load
unpacked**, and select `apps/extension/.output/chrome-mv3`. Pin the dichroma
icon, open any page, and pick a deficiency type in the popup. For development
with HMR, use `pnpm dev` instead of loading a static build.

Known limitations:

- Top-layer content (`<dialog>`, fullscreen elements) escapes root CSS
  filters, so it renders unsimulated.
- `chrome://` and other restricted pages cannot be filtered; the popup shows
  "This page cannot be filtered".
- Navigation resets the simulation unless "Keep across page navigation" is
  enabled (it asks for optional `<all_urls>` host access).
- The contrast audit inspects the top-level frame only; iframe content is not
  audited.

Extension icons live at `apps/extension/public/icon/{16,32,48,128}.png`,
regenerated from the SVG sources in `store-assets/icons/`. Store listing
copy, screenshots, and the submission runbook live under `store-assets/`
(see `store-assets/README.md`); the privacy policy is [PRIVACY.md](PRIVACY.md).

## How the contrast audit works / accuracy

The audit runs axe-core's color-contrast rule once on the top-level frame,
then re-computes each text/background pair's WCAG ratio after mapping both
colors through the selected CVD model (`simulatedWcagRatio`). Simulated-space
ratios are estimates derived from CVD color models — not a normative WCAG
result — and the dichromat simulations are themselves approximations of real
perception. Treat flagged entries as candidates for human review, not as a
compliance verdict; the side panel repeats this disclosure in a footnote.

## Third-party software

The contrast audit ships [axe-core](https://github.com/dequelabs/axe-core)
(© Deque Systems, Inc., [MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/))
unmodified as `vendor/axe.min.js`, with its license alongside as
`vendor/LICENSE`. Both files are copied from the pinned npm package at build
time; dichroma's own code is not derived from axe-core and only calls its
public `axe.run` API. The Chrome Web Store listing description repeats this
attribution (see `store-assets/listing-en.md`).

## Development

```sh
pnpm install   # install all workspace dependencies
pnpm build     # build core + extension
pnpm test      # run unit tests (vitest)
pnpm dev       # run the extension in dev mode (wxt)
```
