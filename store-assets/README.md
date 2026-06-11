# store-assets

Everything needed to submit dichroma to the Chrome Web Store. Dev-only: none
of this ships in the extension package or runs in `pnpm test`.

| Path | What it is |
|---|---|
| `SUBMISSION.md` | 제출 런북 (한국어) — start here |
| `listing-en.md` / `listing-ko.md` | Copy-paste store listing copy, single-purpose statement, permission justifications, data-disclosure answers |
| `icons/` | Icon SVG sources + `generate.mjs` regeneration script |
| `screenshots/` | The five 1280×800 store screenshots |
| `make-screenshots.mjs` | Regenerates all five screenshots |

## Icons

`icons/icon.svg` (split disk + seam, renders 128/48) and
`icons/icon-small.svg` (bigger disk, no seam — legible at 32/16) are the
sources. The motif: the same red disk perceived two ways — original red
(upper-left) vs its deuteranopia simulation, olive `rgb(156,156,54)`
(lower-right), split on the diagonal.

```sh
node store-assets/icons/generate.mjs
```

renders both SVGs with headless Chromium (transparent corners via
`--default-background-color=00000000`), verifies size + corner/center alpha,
and installs `apps/extension/public/icon/{16,32,48,128}.png`, which WXT
auto-wires into `manifest.icons` (plus the explicit `action.default_icon` in
`wxt.config.ts`). Uses the e2e package's Playwright Chromium and pngjs — run
`pnpm install` first. `CHROME_BIN=/path/to/chrome` overrides the browser.

## Screenshots

```sh
node store-assets/make-screenshots.mjs
```

Rebuilds the extension in e2e mode (host_permissions so Playwright can script
pages — the rendered output is identical to the production build), serves the
shared demo page (`e2e/demo-page.mjs`, also exposed by the e2e server at
`/demo`), drives the real popup/side-panel UI in headless Chromium, and
composes five PNGs into `screenshots/`, asserting each is exactly 1280×800:

1. `01-simulation-before-after.png` — demo page, original vs deuteranopia
2. `02-popup.png` — the popup over a backdrop
3. `03-audit-panel.png` — audited page with overlay boxes + side panel
4. `04-preview-card.png` — close-up: in-page preview card + matching panel row
5. `05-korean-ui.png` — shot 3 with `--lang=ko` (Korean panel UI)

Shot 5 needs a Hangul font; the script stages one from
`/mnt/c/Windows/Fonts/NotoSansKR-VF.ttf` (WSL) into a temp fontconfig home —
override the source with `KO_FONT=/path/to/font.ttf` on other machines.
