#!/usr/bin/env python3
"""Golden-value generator for @dichroma/core's simulate.golden.test.ts.

Runs DaltonLens-Python (https://github.com/DaltonLens/DaltonLens-Python) over
the 17^3 sRGB grid and stores the expected uint8 output bytes (base64) per
(type, severity) combo, mirroring @dichroma/core's model routing:

  - protan/deutan severity 1.0       -> simulate.Simulator_Vienot1999
  - protan/deutan severity 0.3, 0.6  -> simulate.Simulator_Machado2009
  - tritan severity 0.3, 0.6, 1.0    -> simulate.Simulator_Brettel1997

Regenerate with:

  ~/.local/bin/uv run \
    --with 'daltonlens @ git+https://github.com/DaltonLens/DaltonLens-Python@3cba5e6a7c8f0e8199c8f83f1afb58eb6dab7a3d' \
    --with numpy python3 tools/gen-golden.py

NOTE: daltonlens MUST come from the pinned git commit, not PyPI. The latest
PyPI release (0.1.5) predates the Judd-Vos anchor-wavelength fix, so its
Brettel 1997 tritan projection disagrees with the libDaltonLens constants
used by @dichroma/core (deltas up to 18/255 on the grid).

Output: packages/core/test/golden/daltonlens-grid.json (commit it).
"""

import base64
import json
from pathlib import Path

import numpy as np
from daltonlens import simulate

OUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "packages" / "core" / "test" / "golden" / "daltonlens-grid.json"
)

GRID = 17
# Channel values 0..255 in 16 steps; iterated r-major -> g -> b.
vals = [round(i * 255 / 16) for i in range(GRID)]
pixels = [(r, g, b) for r in vals for g in vals for b in vals]
# Pack as a 1 x 4913 RGB uint8 image (daltonlens operates on (M,N,3) uint8).
image = np.array([pixels], dtype=np.uint8)
assert image.shape == (1, GRID**3, 3)

DEFICIENCY = {
    "protan": simulate.Deficiency.PROTAN,
    "deutan": simulate.Deficiency.DEUTAN,
    "tritan": simulate.Deficiency.TRITAN,
}

vienot = simulate.Simulator_Vienot1999()
machado = simulate.Simulator_Machado2009()
brettel = simulate.Simulator_Brettel1997()

COMBOS = [
    ("protan", 1.0, vienot),
    ("deutan", 1.0, vienot),
    ("protan", 0.3, machado),
    ("protan", 0.6, machado),
    ("deutan", 0.3, machado),
    ("deutan", 0.6, machado),
    ("tritan", 0.3, brettel),
    ("tritan", 0.6, brettel),
    ("tritan", 1.0, brettel),
]

combos = []
for cvd_type, severity, simulator in COMBOS:
    out = simulator.simulate_cvd(image, DEFICIENCY[cvd_type], severity=severity)
    assert out.shape == image.shape and out.dtype == np.uint8
    combos.append({
        "type": cvd_type,
        "severity": severity,
        "expected": base64.b64encode(out.tobytes()).decode("ascii"),
    })

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
OUT_PATH.write_text(json.dumps({"grid": GRID, "combos": combos}, indent=1) + "\n")
print(f"wrote {OUT_PATH} ({OUT_PATH.stat().st_size} bytes, {len(combos)} combos)")
