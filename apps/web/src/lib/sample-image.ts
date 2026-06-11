// Built-in sample: an inline SVG bar chart (no third-party assets). The
// first bar is solid PURE RED at a fixed position so the e2e suite can read
// a known pixel — e2e/web.spec.mjs hardcodes the region center; keep these
// numbers in sync with it.

export const SAMPLE_WIDTH = 480;
export const SAMPLE_HEIGHT = 300;

/** Solid #ff0000 rect (the first bar). Center: (68, 222). */
export const SAMPLE_RED_REGION = { x: 24, y: 168, width: 88, height: 108 } as const;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SAMPLE_WIDTH}" height="${SAMPLE_HEIGHT}" ` +
  `viewBox="0 0 ${SAMPLE_WIDTH} ${SAMPLE_HEIGHT}" shape-rendering="crispEdges">` +
  `<rect width="${SAMPLE_WIDTH}" height="${SAMPLE_HEIGHT}" fill="#f1f5f9"/>` +
  `<text x="24" y="36" font-family="sans-serif" font-size="20" fill="#1e293b">Fruit harvest by color</text>` +
  // gridlines
  `<line x1="24" y1="204" x2="456" y2="204" stroke="#cbd5e1" stroke-width="1"/>` +
  `<line x1="24" y1="132" x2="456" y2="132" stroke="#cbd5e1" stroke-width="1"/>` +
  `<line x1="24" y1="60" x2="456" y2="60" stroke="#cbd5e1" stroke-width="1"/>` +
  // bars (all end on the baseline y=276); the red one is the e2e probe
  `<rect x="${SAMPLE_RED_REGION.x}" y="${SAMPLE_RED_REGION.y}" width="${SAMPLE_RED_REGION.width}" height="${SAMPLE_RED_REGION.height}" fill="#ff0000"/>` +
  `<rect x="136" y="96" width="88" height="180" fill="#16a34a"/>` +
  `<rect x="248" y="132" width="88" height="144" fill="#2563eb"/>` +
  `<rect x="360" y="60" width="88" height="216" fill="#f59e0b"/>` +
  // baseline axis
  `<line x1="24" y1="276" x2="456" y2="276" stroke="#475569" stroke-width="2"/>` +
  `</svg>`;

export const SAMPLE_IMAGE_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
