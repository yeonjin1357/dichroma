# dichroma

dichroma is a Chrome extension and pure-TypeScript color-science library for
simulating color-vision deficiencies and checking contrast. It applies
scientifically accurate CVD models (Viénot 1999, Brettel 1997, Machado 2009)
to live pages and audits WCAG contrast in the simulated color space, helping
designers and developers see their work the way color-blind users do.

## Monorepo layout

```
.
├── packages/
│   └── core/        # @dichroma/core — pure-TS color-science engine
├── apps/
│   └── extension/   # WXT + React Chrome extension
├── e2e/             # Playwright e2e tests (M1/M2)
└── tools/           # gen-golden.py golden-value generator (M1)
```

## Try it

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

TODO: store icons are intentionally deferred.

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
public `axe.run` API.

TODO: the Chrome Web Store listing description must repeat this axe-core
attribution when the store submission is prepared.

## Development

```sh
pnpm install   # install all workspace dependencies
pnpm build     # build core + extension
pnpm test      # run unit tests (vitest)
pnpm dev       # run the extension in dev mode (wxt)
```
