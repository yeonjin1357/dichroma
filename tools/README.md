# tools

## gen-golden.py

Generates `packages/core/test/golden/daltonlens-grid.json`, the golden values
for `@dichroma/core`'s `simulate.golden.test.ts`: the 17³ sRGB grid simulated
by DaltonLens-Python for every (type, severity) combo the engine routes
(Viénot 1999, Machado 2009, Brettel 1997). Regenerate with:

```sh
~/.local/bin/uv run \
  --with 'daltonlens @ git+https://github.com/DaltonLens/DaltonLens-Python@3cba5e6a7c8f0e8199c8f83f1afb58eb6dab7a3d' \
  --with numpy python3 tools/gen-golden.py
```

daltonlens must come from the pinned git commit, not PyPI: the latest PyPI
release (0.1.5) predates the Judd-Vos anchor-wavelength fix, so its Brettel
tritan projection disagrees with the libDaltonLens constants the engine uses
(deltas up to 18/255 on the grid).

The generated JSON is committed; only rerun this when the engine's source
matrices or the grid change.
