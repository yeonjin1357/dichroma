# @dichroma/core

Scientifically accurate color-vision-deficiency (CVD) simulation with zero
runtime dependencies. All math runs in linear RGB, where the established
models are actually defined: Viénot 1999 for full protanopia/deuteranopia,
Machado 2009 for anomalous (partial-severity) protan/deutan trichromacy,
Brettel 1997 two-half-plane projection for tritanopia, and a luminance blend
for achromatopsia. It also generates equivalent SVG `<filter>` markup for
whole-page simulation in browsers and computes WCAG contrast ratios in
simulated color space.

```sh
npm install @dichroma/core
```

## Usage

```ts
import { simulateColor, buildSvgFilter, simulatedWcagRatio } from '@dichroma/core';

simulateColor([255, 0, 0], 'deutan', 1);        // -> [147, 147, 0]-ish yellow
simulateColor([255, 0, 0], 'protan', 0.5);      // partial severity (Machado 2009)

const filter = buildSvgFilter('tritan', 1);
document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0">${filter.markup}</svg>`);
document.documentElement.style.filter = filter.cssInline;   // or filter.cssDataUrl

simulatedWcagRatio([255, 0, 0], [0, 255, 0], 'deutan', 1);  // contrast as a deutan sees it
```

## API

| Function | Purpose |
| --- | --- |
| `simulateColor(srgb, type, severity?)` | Simulate one 8-bit sRGB color (`[r, g, b]` → `[r, g, b]`). |
| `simulateImageData(data, type, severity?)` | Simulate an RGBA pixel buffer in place (alpha untouched). |
| `buildSvgFilter(type, severity?, opts?)` | SVG `<filter>` equivalent of the model (`markup`, `svg`, `dataUrl`, `cssDataUrl`, `cssInline`). |
| `resolveModel(type, severity?)` | Resolve type + severity to the underlying linear-RGB model. |
| `simulateLinear(rgb, model)` | Apply a resolved model to one linear-RGB color. |
| `relativeLuminance(srgb)` | WCAG relative luminance. |
| `wcagRatio(fg, bg)` | WCAG contrast ratio (1–21). |
| `simulatedWcagRatio(fg, bg, type, severity?)` | WCAG contrast ratio under CVD simulation. |
| `compositeOver(fgRgba, bg)` | Gamma-space alpha compositing (CSS default). |
| `srgbToLinear(c8)` / `linearToSrgb(c)` / `LINEAR_LUT` | sRGB ↔ linear transfer functions. |

`type` is `'protan' | 'deutan' | 'tritan' | 'achromatopsia'`; `severity` is
0–1 (default 1).

## Accuracy

- Validated against DaltonLens-Python on the full 17³ sRGB grid for every
  model/severity route: max per-channel delta ≤ 1/255.
- The SVG filters are verified pixel-for-pixel in headless Chrome (inline and
  data-URL delivery): max per-channel delta ≤ 3/255.

## License

MIT
