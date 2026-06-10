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

## Development

```sh
pnpm install   # install all workspace dependencies
pnpm build     # build core + extension
pnpm test      # run unit tests (vitest)
pnpm dev       # run the extension in dev mode (wxt)
```
