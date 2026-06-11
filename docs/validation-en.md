<!--
  Images use absolute raw.githubusercontent.com URLs, so they render once this
  document is pushed to the main branch of
  https://github.com/yeonjin1357/dichroma — including when the markdown is
  pasted as-is into dev.to or similar platforms.

  한국어 원문: validation-ko.md
-->

# Most color-blindness simulators are wrong — building one and proving it on 4,913 colors

Search for a color-vision-deficiency (CVD) simulator and you'll find dozens. The problem: many of them are wrong in subtle, unverifiable ways. This is the story of building [dichroma](https://github.com/yeonjin1357/dichroma), a Chrome extension that didn't stop at "we picked the right model" — it proves, with numbers, that the pixels the browser actually renders match the science.

![Before/after — dichroma applying a protanopia filter to a live page](https://raw.githubusercontent.com/yeonjin1357/dichroma/main/docs/img/01-simulation-before-after.png)

## Plenty of simulators, few correct ones

DaltonLens' [review of open-source color blindness simulations](https://daltonlens.org/opensource-cvd-simulation/) — written by an author who is himself a mild protan and compared the methods first-hand — concludes that many widely used implementations are inaccurate. They tend to fail in two ways.

**① Matrix multiplication on top of gamma.** Simulation matrices are defined in *linear* RGB, yet many implementations multiply them straight onto gamma-encoded sRGB values. Skipping that one linearization step changes the result completely (figure below).

**② Matrices of unknown origin.** The classic case is colorjack's ColorMatrix, copy-pasted into countless libraries. Its own author said it was a one-night hack, not accurate, and that nobody should use it — yet it still shows up everywhere.

Even reference implementations have traps. When I generated golden values with [daltonlens-python](https://github.com/DaltonLens/DaltonLens-Python), the [latest PyPI release (0.1.5)](https://pypi.org/project/daltonlens/) predated the Judd-Vos anchor-wavelength fix and disagreed with git master by up to **18/255** per channel (recorded in the header of `tools/gen-golden.py`). I ended up pinning the dependency to a git commit — even "a validated library" is a claim about a specific commit.

## The right science: three models and how they're routed

The engine, [@dichroma/core](https://www.npmjs.com/package/@dichroma/core), routes by type and severity:

- **Viénot 1999** — full protan/deutan dichromacy (severity 1). A single 3×3 matrix projection.
- **Brettel 1997** — tritan only. A dichromat's color space is two half-planes hinged on the achromatic axis, so one matrix isn't enough: you pick a projection matrix depending on which side of the separation plane a color falls. (Machado's published tritan table is known to be inaccurate, so it isn't used.)
- **Machado 2009** — anomalous protan/deutan trichromacy (severity 0–1), interpolating the published 0.1-step matrices.
- Achromatopsia is handled as a blend toward Rec.709 luminance.

The matrix constants come from the public-domain [libDaltonLens](https://github.com/DaltonLens/libDaltonLens), with provenance cited in source comments. And **every matrix operates in linear RGB.** Here is the same Viénot protan matrix applied correctly (after linearization) versus multiplied directly onto sRGB:

![Top: originals; middle: protanopia applied correctly in linear RGB; bottom: the wrong result of multiplying the same matrix on gamma sRGB](https://raw.githubusercontent.com/yeonjin1357/dichroma/main/docs/img/linear-vs-srgb.png)

Pure red `rgb(255,0,0)` becomes `[94,94,13]` in the correct implementation and `[29,29,1]` — nearly black — in the wrong one. The wrong row's numbers were genuinely computed for this figure (`docs/img/make-figures.mjs`).

## Implementation: one SVG filter, the whole page on the GPU

Since every pixel of the page must be transformed in real time, dichroma uses SVG filters (`feColorMatrix`) from CSS. There's a color-space trap here too: per the [Filter Effects spec](https://www.w3.org/TR/filter-effects-1/), CSS shorthand filter functions (`grayscale()` etc.) operate in sRGB, while SVG filter primitives default to linearRGB. Rather than trusting browser defaults, the filter always declares `color-interpolation-filters="linearRGB"` — and the actual result is verified pixel-by-pixel later.

Protan/deutan need just one matrix, but Brettel's tritan "pick a half-plane" logic has to be expressed as a branch-free filter graph. The 7-primitive graph built by `packages/core/src/svgFilter.ts`:

```xml
<filter id="${id}" color-interpolation-filters="linearRGB">
  <feColorMatrix in="SourceGraphic" type="matrix" result="projA" values="${matrixValues(model.m1)}"/>
  <feColorMatrix in="SourceGraphic" type="matrix" result="projB" values="${matrixValues(model.m2)}"/>
  <feColorMatrix in="SourceGraphic" type="matrix" result="sep" values="${sepValues(model.sep)}"/>
  <feComponentTransfer in="sep" result="mask"><feFuncA type="discrete" tableValues="0 1"/></feComponentTransfer>
  <feComposite in="projA" in2="mask" operator="in" result="maskedA"/>
  <feComposite in="projB" in2="mask" operator="out" result="maskedB"/>
  <feComposite in="maskedA" in2="maskedB" operator="over"/>
</filter>
```

It computes both projections, carries the separation-plane dot product in the alpha channel, turns it into a 0/1 mask with a discrete threshold, then composites per pixel.

The filter goes on the `<html>` root only. `filter` turns the element it's applied to into the containing block for fixed/absolute descendants, so putting it on `<body>` breaks `position: fixed` layouts — the [spec](https://www.w3.org/TR/filter-effects-1/) exempts only the document root element.

## The validation chain: how do you prove "it's correct"?

This is the heart of the project. Four layers; every number below was re-run and confirmed in this repository.

![The four-step validation chain](https://raw.githubusercontent.com/yeonjin1357/dichroma/main/docs/img/validation-chain.png)

**① Model math.** The 7-primitive graph's semantics (linearize → two projections → discrete mask → composite) were emulated in Node and compared against the pure function `simulateColor` — all 17³ = 4,913 colors, all three tritan severities: **per-channel delta 0**. The graph and the function are mathematically the same model.

**② Golden test.** Pure function vs git-pinned daltonlens-python — the 17³ grid × 9 (type, severity) combos, all within **delta ≤ 1/255** (measured max 1, rounding error). `packages/core/test/simulate.golden.test.ts`.

**③ Real-browser pixels.** Pixels actually rendered by headless Chrome through the SVG filter vs the pure function's output — 4 combos × inline/data-URL embeddings, threshold 3/255. Latest run: tritan **3**, deutan **0**, protan@0.5 **0**, achromatopsia **1**. `e2e/chrome-filter.test.mjs`.

**④ Permanent regression.** All of it is frozen into **191 unit tests** plus Playwright e2e, run on every change.

## The application: contrast auditing in the simulated color space

WCAG contrast looks at luminance only, and [Understanding 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) states that the inability to distinguish certain colors does not negatively affect light-dark contrast. But a protanope lacks L-cones and loses much of red light's luminance contribution. Counterexample: pure red text on black passes AA at **5.25:1**, yet re-measured after protan simulation it drops to **3.09:1** — a fail.

Existing tools can't catch this — simulators offer no analysis, and contrast checkers only measure the original colors. dichroma takes the text/background pairs found by axe-core, maps them through the CVD model, recomputes the WCAG ratio, and separately flags items that "pass today but fail for color-blind users." These figures are heuristic estimates derived from the models, not a validated psychophysical metric — the UI carries the same disclosure.

![The contrast audit panel — WCAG ratios recomputed in the simulated color space](https://raw.githubusercontent.com/yeonjin1357/dichroma/main/docs/img/03-audit-panel.png)

## Closing

In CVD simulation, choosing the right model is half the battle; the color space is the other half — and the only way to know you got both right is to measure the pixels that actually get rendered.

- Chrome extension: `<CHROME_WEB_STORE_URL>` (currently in review)
- Engine (npm): [@dichroma/core](https://www.npmjs.com/package/@dichroma/core)
- Web demo: <https://yeonjin1357.github.io/dichroma/>
- Full source and tests: [github.com/yeonjin1357/dichroma](https://github.com/yeonjin1357/dichroma)

### References

- Brettel, Viénot & Mollon, 1997, *Computerized simulation of color appearance for dichromats*, J. Opt. Soc. Am. A 14(10) — [DOI](https://doi.org/10.1364/JOSAA.14.002647), [PDF](https://vision.psychol.cam.ac.uk/jdmollon/papers/Dichromatsimulation.pdf)
- Viénot, Brettel & Mollon, 1999, *Digital video colourmaps for checking the legibility of displays by dichromats*, Color Research & Application 24(4) — [PDF](https://vision.psychol.cam.ac.uk/jdmollon/papers/colourmaps.pdf)
- Machado, Oliveira & Fernandes, 2009, *A Physiologically-based Model for Simulation of Color Vision Deficiency*, IEEE TVCG 15(6) — [project page & PDF](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)
- DaltonLens, *Review of Open Source Color Blindness Simulations* — <https://daltonlens.org/opensource-cvd-simulation/>
