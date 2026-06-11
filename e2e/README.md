# e2e

Browser end-to-end tests (not part of the vitest suite).

## chrome-filter.test.mjs (M1)

Verifies that `buildSvgFilter` from `@dichroma/core` renders pixel-accurately
in real Chrome. For each combo (tritan/1.0, deutan/1.0, protan/0.5,
achromatopsia/1.0) it renders a 12-swatch page twice — once with the filter
markup injected inline (`cssInline`) and once via the data-URL CSS value
(`cssDataUrl`) — screenshots it with headless Chrome, and compares every
swatch center pixel against `simulateColor`. PASS threshold: max per-channel
|delta| <= 3/255.

Run it (after `pnpm build`, which produces the `@dichroma/core` dist the test
imports through the workspace link):

```sh
pnpm --filter e2e run test:filter
```

The Chrome binary is taken from `$CHROME_BIN`, falling back to the local
Playwright Chromium install; if neither exists the test SKIPs (exit 0).

## extension.spec.mjs (M2/M3)

Playwright suite that loads the built extension (`wxt build --mode e2e`,
which adds `host_permissions` so automation can script pages) and drives the
popup simulation flows, the navigation/persist regressions, and the M3
contrast audit (side panel via its `?tab=` hook, simulated-space group
counts, in-page overlay, focus-on-click):

```sh
pnpm --filter e2e run test:extension
```

## web.spec.mjs (M4a)

Playwright suite for the client-side web app. It builds `@dichroma/core` +
`apps/web`, then serves `apps/web/dist` with a tiny static `node:http` server
that honors the production `/dichroma/` base path (chosen over `vite preview`
because it needs no workspace exec/port plumbing and exercises exactly the
GitHub Pages URL layout). The tests assert the sample-image canvases render,
the deutan/severity-1 simulated canvas pixel matches `simulateColor` (±1),
the palette checker's red-on-black ratios/badges match core, and the Korean
language toggle works:

```sh
pnpm --filter e2e run test:web
```
