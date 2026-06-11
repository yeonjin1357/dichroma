// Self-made, brand-free dashboard page ("Pulseboard" — fictional) shared by
// the e2e server (route /demo) and store-assets/make-screenshots.mjs. Static
// HTML/CSS only (no JS, no webfonts) so headless captures are deterministic.
//
// Besides looking like a real product, the page doubles as an audit fixture —
// every color below is deliberate (ratios from @dichroma/core):
//   - Incident banner   #dc2626 on #fffbeb  4.66:1 → deutan 3.94:1
//     (passes WCAG for typical vision, fails under deuteranopia — the
//     cvd-only group dichroma exists to surface)
//   - Masthead stat     #ff4444 on #171b26  5.05:1 → protan 3.36:1
//     (same story under protanopia; feeds the P summary chip)
//   - Footer timestamp  #b8b8b8 on #ffffff  ≈2.0:1
//     (already failing WCAG for everyone)
//   - Promo strip       #ffffff on a gradient → axe cannot resolve the
//     background (needs-review group)
// The red/green/amber badges and chart bars make the before/after simulation
// shot dramatic: under deuteranopia they collapse into the same olive band.
export const DEMO_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Pulseboard — Service status</title>
<style>
  :root {
    --navy: #171b26;
    --ink: #1f2733;
    --muted: #6b7280;
    --line: #e5e1d8;
    --canvas: #faf8f2;
    --card: #ffffff;
    --green: #16a34a;
    --red: #dc2626;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--canvas);
    color: var(--ink);
    font: 15px/1.5 ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  }
  .wrap { max-width: 860px; margin: 0 auto; padding: 0 28px; }

  /* ---- masthead -------------------------------------------------------- */
  .masthead { background: var(--navy); color: #f5f3ec; padding: 18px 0; }
  .masthead .wrap { display: flex; align-items: center; gap: 14px; }
  .logo { display: flex; align-items: center; gap: 9px; font-weight: 700; letter-spacing: .01em; }
  .logo-mark {
    width: 22px; height: 22px; border-radius: 6px; flex: none;
    background: linear-gradient(135deg, #22c55e 50%, #ef4444 50%);
  }
  .crumb { color: #8b93a5; font-size: 13px; }
  .masthead-stats { margin-left: auto; display: flex; gap: 18px; font-size: 13px; font-weight: 600; }
  .stat-fail { color: #ff4444; }   /* fixture: protan cvd-only failure */
  .stat-pass { color: #34d399; }

  /* ---- incident banner (fixture: deutan cvd-only failure) -------------- */
  .incident {
    background: #fffbeb; color: #dc2626;
    border: 1px solid #f3e8c8; border-radius: 10px;
    padding: 13px 18px; margin: 26px 0 0;
    font-size: 15px;
  }

  /* ---- promo strip (fixture: gradient → needs-review) ------------------ */
  .promo {
    margin: 14px 0 0; padding: 11px 18px; border-radius: 10px;
    background: linear-gradient(100deg, #0e7490, #4f46e5);
    color: #ffffff; font-size: 14px;
  }
  .promo a { color: #ffffff; }

  /* ---- toolbar --------------------------------------------------------- */
  .toolbar { display: flex; align-items: center; gap: 12px; margin: 26px 0 0; }
  .toolbar h1 { font-size: 21px; letter-spacing: -0.01em; }
  .toolbar .actions { margin-left: auto; display: flex; align-items: center; gap: 10px; }
  .btn {
    font: 600 13.5px/1 inherit; border-radius: 8px; padding: 10px 16px;
    border: 1px solid transparent; cursor: pointer;
  }
  .btn-primary { background: #2563eb; color: #ffffff; }
  .btn-danger { background: var(--card); color: #dc2626; border-color: #dc2626; }
  .toolbar a { color: #2563eb; font-size: 13.5px; }

  /* ---- status cards ----------------------------------------------------- */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin: 18px 0 0; }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    padding: 16px; box-shadow: 0 1px 2px rgba(23, 27, 38, .05);
  }
  .card h2 { font-size: 14.5px; margin-bottom: 9px; }
  .badge {
    display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .03em;
    border-radius: 999px; padding: 3px 10px;
  }
  .badge-ok   { background: #dcfce7; color: #166534; }
  .badge-warn { background: #ffedd5; color: #9a3412; }
  .badge-down { background: #fee2e2; color: #b91c1c; }
  .card .meta { margin-top: 10px; font-size: 12.5px; color: var(--muted); }

  /* ---- chart + uptime --------------------------------------------------- */
  .panels { display: grid; grid-template-columns: 1fr 200px; gap: 14px; margin: 14px 0 0; }
  .panel-label { font-size: 11px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
  .chart { display: flex; align-items: flex-end; gap: 8px; height: 110px; margin-top: 14px; border-bottom: 2px solid var(--line); }
  .chart .bar { flex: 1; border-radius: 4px 4px 0 0; background: #22c55e; }
  .chart .bar.fail { background: #ef4444; }
  .chart .bar.slow { background: #f59e0b; }
  .chart-days { display: flex; gap: 8px; margin-top: 6px; }
  .chart-days span { flex: 1; text-align: center; font-size: 10.5px; color: var(--muted); }
  .uptime { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .donut {
    width: 84px; height: 84px; border-radius: 50%; margin-top: 12px;
    background: conic-gradient(#22c55e 0 78%, #f59e0b 78% 91%, #ef4444 91% 100%);
    -webkit-mask: radial-gradient(circle, transparent 26px, #000 27px);
    mask: radial-gradient(circle, transparent 26px, #000 27px);
  }
  .uptime .pct { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
  .uptime .meta { font-size: 12px; color: var(--muted); text-align: center; }

  /* ---- footer (fixture: fails WCAG for everyone) ------------------------ */
  .foot { margin: 26px 0 34px; font-size: 13px; color: #b8b8b8; }
</style>
</head>
<body>

<header class="masthead">
  <div class="wrap">
    <span class="logo"><span class="logo-mark"></span>Pulseboard</span>
    <span class="crumb">acme-corp / production</span>
    <span class="masthead-stats">
      <span class="stat-fail">3 checks failing</span>
      <span class="stat-pass">47 passing</span>
    </span>
  </div>
</header>

<div class="wrap">
  <p class="incident" id="incident">
    Incident #4127 — elevated error rate on the edge cache. On-call has been paged.
  </p>

  <p class="promo">New: canary deployments are now generally available. <a href="#docs">Read the rollout guide</a></p>

  <div class="toolbar">
    <h1>Service status</h1>
    <span class="actions">
      <a href="#history">Incident history</a>
      <button class="btn btn-danger" type="button">Rollback</button>
      <button class="btn btn-primary" type="button">New deployment</button>
    </span>
  </div>

  <div class="cards">
    <div class="card">
      <h2>API Gateway</h2>
      <span class="badge badge-ok">Operational</span>
      <p class="meta">p95 142 ms · 0.01% errors</p>
    </div>
    <div class="card">
      <h2>Build pipeline</h2>
      <span class="badge badge-warn">Degraded</span>
      <p class="meta">queue 14 min · 2 retries</p>
    </div>
    <div class="card">
      <h2>Edge cache</h2>
      <span class="badge badge-down">Down</span>
      <p class="meta">hit rate 0% · failover active</p>
    </div>
  </div>

  <div class="panels">
    <div class="card">
      <span class="panel-label">Deploys, last 14 days</span>
      <div class="chart">
        <div class="bar" style="height:52%"></div>
        <div class="bar" style="height:71%"></div>
        <div class="bar fail" style="height:38%"></div>
        <div class="bar" style="height:64%"></div>
        <div class="bar" style="height:89%"></div>
        <div class="bar slow" style="height:47%"></div>
        <div class="bar" style="height:58%"></div>
        <div class="bar" style="height:76%"></div>
        <div class="bar fail" style="height:30%"></div>
        <div class="bar fail" style="height:44%"></div>
        <div class="bar" style="height:67%"></div>
        <div class="bar" style="height:95%"></div>
        <div class="bar slow" style="height:55%"></div>
        <div class="bar" style="height:82%"></div>
      </div>
      <div class="chart-days">
        <span>29</span><span>30</span><span>31</span><span>1</span><span>2</span><span>3</span><span>4</span>
        <span>5</span><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span><span>11</span>
      </div>
    </div>
    <div class="card uptime">
      <span class="panel-label">Uptime, 90 days</span>
      <div class="donut"></div>
      <span class="pct">99.97%</span>
      <p class="meta">green: healthy · amber: degraded · red: outage</p>
    </div>
  </div>

  <p class="foot">Last updated 2 minutes ago · build #4821 · region eu-west-1</p>
</div>

</body>
</html>`;
