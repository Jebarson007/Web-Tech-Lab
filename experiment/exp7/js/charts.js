// Chart.js helpers, formatting and the canvas track-map renderer.

const COMPOUNDS = {
  SOFT: "#ff3b3b", MEDIUM: "#ffd12e", HARD: "#e8e8e3",
  INTERMEDIATE: "#43b02a", WET: "#2a7fd4", UNKNOWN: "#8a8f9c", TEST_UNKNOWN: "#8a8f9c",
};
const compoundColor = (c) => COMPOUNDS[c] || COMPOUNDS.UNKNOWN;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fmtLap(sec) {
  if (sec == null || isNaN(sec)) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec - h * 3600) / 60);
  const s = (sec - h * 3600 - m * 60).toFixed(3).padStart(6, "0");
  if (h) return `${h}:${String(m).padStart(2, "0")}:${s}`;
  return m ? `${m}:${s}` : s;
}

function fmtGap(sec) {
  if (sec == null) return "—";
  return (sec >= 0 ? "+" : "−") + Math.abs(sec).toFixed(3);
}

function applyChartTheme() {
  if (!window.Chart) return;
  Chart.defaults.color = cssVar("--text-2");
  Chart.defaults.borderColor = cssVar("--grid");
  Chart.defaults.font.family = "'Titillium Web', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.animation = false;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.plugins.legend.display = false;
  const tt = Chart.defaults.plugins.tooltip;
  tt.backgroundColor = cssVar("--surface-2");
  tt.titleColor = cssVar("--text");
  tt.bodyColor = cssVar("--text");
  tt.borderColor = cssVar("--border");
  tt.borderWidth = 1;
  tt.padding = 10;
  tt.cornerRadius = 8;
  tt.boxPadding = 4;
}

// Draws a vertical guide at chart.$hoverX (a value on the x scale) — used to sync telemetry charts.
const crosshairPlugin = {
  id: "crosshair",
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts || !opts.enabled) return;
    const { top, bottom, left, right } = chart.chartArea;
    const ctx = chart.ctx;
    if (chart.$drag) {
      const [a, b] = chart.$drag.map((v) => chart.scales.x.getPixelForValue(v));
      ctx.save();
      ctx.fillStyle = "rgba(225, 6, 0, 0.12)";
      ctx.fillRect(Math.min(a, b), top, Math.abs(b - a), bottom - top);
      ctx.restore();
    }
    if (chart.$hoverX == null) return;
    const x = chart.scales.x.getPixelForValue(chart.$hoverX);
    if (x < left || x > right) return;
    ctx.save();
    ctx.strokeStyle = cssVar("--text-2");
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

// Vertical corner-number markers along a distance axis.
const cornersPlugin = {
  id: "corners",
  beforeDatasetsDraw(chart, _args, opts) {
    if (!opts || !opts.list || !opts.list.length) return;
    const { top, bottom, left, right } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = cssVar("--grid");
    ctx.fillStyle = cssVar("--text-3");
    ctx.font = "600 10px 'Titillium Web', sans-serif";
    ctx.textAlign = "center";
    for (const c of opts.list) {
      const x = chart.scales.x.getPixelForValue(c.d);
      if (x < left || x > right) continue;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      if (opts.labels) ctx.fillText(c.n, x, top + 10);
    }
    ctx.restore();
  },
};

if (window.Chart) Chart.register(crosshairPlugin, cornersPlugin);

// Charts are grouped so a panel can tear down its charts before re-rendering.
const chartGroups = {};
function makeChart(group, canvas, config) {
  (chartGroups[group] ||= []).push(new Chart(canvas, config));
  return chartGroups[group].at(-1);
}
function destroyCharts(group) {
  (chartGroups[group] || []).forEach((c) => c.destroy());
  chartGroups[group] = [];
}

// ---------- Track map ----------
const SPEED_STOPS = [
  [0, [48, 64, 255]], [0.35, [0, 200, 255]], [0.6, [60, 230, 120]], [0.8, [255, 210, 40]], [1, [255, 40, 40]],
];
function speedColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < SPEED_STOPS.length; i++) {
    const [p1, c1] = SPEED_STOPS[i];
    const [p0, c0] = SPEED_STOPS[i - 1];
    if (t <= p1) {
      const f = (t - p0) / (p1 - p0);
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * f)).join(",")})`;
    }
  }
  return "rgb(255,40,40)";
}

function rotatePt(x, y, deg) {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
}

/**
 * Draws a circuit outline on a canvas.
 * opts: { xs, ys, segColors(i) -> css colour, rotation, corners: [{n,x,y}], marker: [{x,y,color}] }
 * Returns a projector so callers can map world coordinates to canvas pixels.
 */
function drawTrack(canvas, opts) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const rot = opts.rotation || 0;
  const pts = opts.xs.map((x, i) => rotatePt(x, opts.ys[i], rot));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const pad = 30;
  const scale = Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1));
  const ox = (w - (maxX - minX) * scale) / 2, oy = (h - (maxY - minY) * scale) / 2;
  const project = (x, y) => {
    const [rx, ry] = rotatePt(x, y, rot);
    return [ox + (rx - minX) * scale, h - (oy + (ry - minY) * scale)];
  };
  const P = pts.map(([x, y]) => [ox + (x - minX) * scale, h - (oy + (y - minY) * scale)]);

  // Underlay for contrast
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = cssVar("--surface-2");
  ctx.lineWidth = 12;
  ctx.beginPath();
  P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();

  ctx.lineWidth = 5;
  for (let i = 1; i < P.length; i++) {
    ctx.strokeStyle = opts.segColors(i);
    ctx.beginPath();
    ctx.moveTo(P[i - 1][0], P[i - 1][1]);
    ctx.lineTo(P[i][0], P[i][1]);
    ctx.stroke();
  }

  // Start/finish
  if (P.length) {
    ctx.fillStyle = cssVar("--text");
    ctx.beginPath();
    ctx.arc(P[0][0], P[0][1], 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Corner numbers, pushed slightly outward from the circuit centre
  if (opts.corners) {
    const cx = w / 2, cy = h / 2;
    ctx.font = "700 10px 'Titillium Web', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const c of opts.corners) {
      let [x, y] = project(c.x, c.y);
      const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy) || 1;
      x += (dx / len) * 16; y += (dy / len) * 16;
      ctx.fillStyle = cssVar("--surface");
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cssVar("--text-2");
      ctx.fillText(c.n, x, y + 0.5);
    }
  }

  for (const m of opts.marker || []) {
    const [x, y] = project(m.x, m.y);
    ctx.fillStyle = m.color;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  return project;
}
