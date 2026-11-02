// F1 2025 Telemetry Explorer — routing, state and views.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
const MAX_TEL = 4;

const S = {
  event: null,      // EVENTS entry
  session: null,    // session folder name
  tab: "results",
  drivers: [],      // drivers.json entries + derived summary, in classification order
  byCode: {},
  token: 0,         // guards against stale async session loads
  lapSel: null,     // Set of driver codes shown on the lap-time charts
  cleanLaps: true,
  tel: [],          // [{drv, lap}] telemetry selections
  zoom: null,       // [min, max] distance range for telemetry charts
  rcmFilter: "All",
};

// ---------- Utilities ----------
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function isRaceLike(ses = S.session) {
  return ses === "Race" || ses === "Sprint";
}

function fmtDate(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function sessionHash(ev, ses, tab) {
  return "#/" + [ev, ses, tab].filter(Boolean).map(encodeURIComponent).join("/");
}

function median(arr) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Binary search: index of the last element <= v in a sorted array.
function bisect(arr, v) {
  let lo = 0, hi = arr.length - 1;
  if (v <= arr[0]) return 0;
  if (v >= arr[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid; else hi = mid;
  }
  return lo;
}

function interp(xs, ys, v) {
  const i = bisect(xs, v);
  if (i >= xs.length - 1) return ys[xs.length - 1];
  const f = (v - xs[i]) / (xs[i + 1] - xs[i] || 1);
  return ys[i] + (ys[i + 1] - ys[i]) * f;
}

function avatar(d, cls = "avatar") {
  return d.url ? `<img class="${cls}" src="${esc(d.url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="${cls}"></span>`;
}

// ---------- Theme ----------
function initTheme() {
  let t = null;
  try { t = localStorage.getItem("f1-theme"); } catch (e) { /* ignore */ }
  if (!t) t = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  applyChartTheme();
  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("f1-theme", next); } catch (e) { /* ignore */ }
    applyChartTheme();
    if (S.session) renderPanel();
  });
}

// ---------- Routing ----------
function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { ev: parts[0], ses: parts[1], tab: parts[2] };
}

async function route() {
  const { ev, ses, tab } = parseHash();
  const event = EVENTS.find((e) => e.name === ev);
  if (!event) return showHome();

  const session = event.sessions.includes(ses) ? ses : "Race";
  const changed = S.event !== event || S.session !== session;
  S.event = event;
  S.session = session;
  S.tab = ["results", "laps", "strategy", "telemetry", "info"].includes(tab) ? tab : "results";

  $("#view-home").hidden = true;
  $("#view-session").hidden = false;
  renderCrumbs();
  renderSessionChrome();
  if (changed) {
    window.scrollTo(0, 0);
    await loadSession();
  } else {
    renderPanel();
  }
}

function renderCrumbs() {
  const c = $("#crumbs");
  if (!S.event || $("#view-session").hidden) { c.innerHTML = ""; return; }
  c.innerHTML = `<a href="#/">2025 Season</a><span class="sep">/</span>
    <a href="${sessionHash(S.event.name, "Race")}">${esc(S.event.name)}</a><span class="sep">/</span>
    <span>${esc(S.session)}</span>`;
}

// ---------- Home ----------
function showHome() {
  S.event = null;
  S.session = null;
  $("#view-session").hidden = true;
  $("#view-home").hidden = false;
  renderCrumbs();

  const sprints = EVENTS.filter((e) => e.sessions.includes("Sprint")).length;
  const sessions = EVENTS.reduce((n, e) => n + e.sessions.length, 0);
  $("#heroStats").innerHTML = [
    [EVENTS.length, "Grands Prix"], [sprints, "Sprint weekends"],
    [sessions, "Sessions"], [8, "Telemetry channels"],
  ].map(([v, k]) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("");
  renderCalendar();
}

function renderCalendar(filter = $("#calFilter .active").dataset.filter) {
  const list = EVENTS.filter((e) => filter === "all" || e.sessions.includes("Sprint"));
  $("#eventGrid").innerHTML = list.map((e) => {
    const sprint = e.sessions.includes("Sprint");
    return `<div class="event-card" role="link" tabindex="0" data-href="${sessionHash(e.name, "Race")}">
      <div class="top"><span class="round">Round ${e.round}</span>${sprint ? '<span class="badge-sprint">Sprint</span>' : ""}<span class="flag">${flagImg(e)}</span></div>
      <h3>${esc(e.name.replace(" Grand Prix", ""))} <span style="color:var(--text-3);font-weight:400">GP</span></h3>
      <div class="meta">${esc(e.circuit)} · ${fmtDate(e.date)}</div>
      <div class="chip-row">${e.sessions.map((s) =>
        `<a class="mini-chip ${s.startsWith("Sprint") ? "sprint" : ""}" href="${sessionHash(e.name, s)}">${SESSION_SHORT[s]}</a>`).join("")}</div>
    </div>`;
  }).join("");
}

function initHome() {
  $("#calFilter").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $$("#calFilter button").forEach((x) => x.classList.toggle("active", x === b));
    renderCalendar(b.dataset.filter);
  });
  const go = (e) => {
    if (e.target.closest("a")) return;
    const card = e.target.closest(".event-card");
    if (card) location.hash = card.dataset.href;
  };
  $("#eventGrid").addEventListener("click", go);
  $("#eventGrid").addEventListener("keydown", (e) => { if (e.key === "Enter") go(e); });
}

// ---------- Session chrome ----------
function renderSessionChrome() {
  const e = S.event;
  $("#eventBanner").innerHTML = `<span class="flag">${flagImg(e, 44)}</span>
    <div><div class="round">Round ${e.round} · ${esc(e.country)}</div>
    <h1>${esc(e.name)}</h1>
    <div class="meta">${esc(e.circuit)} · ${fmtDate(e.date)}</div></div>`;
  $("#sessionChips").innerHTML = e.sessions.map((s) =>
    `<a class="session-chip ${s === S.session ? "active" : ""}" href="${sessionHash(e.name, s, S.tab)}">${esc(s)}</a>`).join("");
  $$("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === S.tab));
}

function initTabs() {
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) location.hash = sessionHash(S.event.name, S.session, b.dataset.tab);
  });
}

// ---------- Session data ----------
function summarize(d, L) {
  const n = L.lap.length;
  let best = null, bestIdx = -1;
  for (let i = 0; i < n; i++) {
    const t = L.time[i];
    if (t != null && !L.del[i] && (best == null || t < best)) { best = t; bestIdx = i; }
  }
  let last = n - 1;
  while (last >= 0 && L.time[last] == null) last--;
  let finalPos = null;
  for (let i = n - 1; i >= 0; i--) if (L.pos[i] != null) { finalPos = L.pos[i]; break; }

  // The raw `stint` column also bumps under safety cars, so a new stint is detected from a
  // compound change or the tyre age not continuing from the previous lap.
  const stints = [];
  for (let i = 0; i < n; i++) {
    const cur = stints.at(-1);
    const cmp = L.compound[i] || cur?.compound || "UNKNOWN";
    const continues = cur && cmp === cur.compound && (L.life[i] == null || cur.lastLife == null || L.life[i] > cur.lastLife);
    if (continues) {
      cur.to = L.lap[i];
      cur.lastLife = L.life[i] ?? cur.lastLife;
    } else {
      stints.push({ stint: stints.length + 1, compound: cmp, from: L.lap[i], to: L.lap[i], fresh: L.fresh[i], lastLife: L.life[i] });
    }
  }
  const speeds = (L.vst || []).filter((v) => v != null);
  return {
    best, bestIdx,
    bestLap: bestIdx >= 0 ? L.lap[bestIdx] : null,
    lapsDone: last >= 0 ? L.lap[last] : 0,
    finishT: last >= 0 ? L.sesT[last] : null,
    finalPos,
    stints,
    topSpeed: speeds.length ? Math.max(...speeds) : null,
  };
}

function classify(list) {
  if (isRaceLike()) {
    list.sort((a, b) =>
      (b.sum.lapsDone - a.sum.lapsDone) ||
      ((a.sum.finalPos ?? 99) - (b.sum.finalPos ?? 99)) ||
      ((a.sum.finishT ?? 1e9) - (b.sum.finishT ?? 1e9)));
    const lead = list[0]?.sum;
    const pts = S.session === "Race" ? RACE_POINTS : SPRINT_POINTS;
    list.forEach((d, i) => {
      const down = lead.lapsDone - d.sum.lapsDone;
      d.dnf = d.sum.lapsDone === 0 || down > 2 || (down > 0 && d.sum.finalPos == null);
      d.gap = i === 0 ? null : down === 0 ? d.sum.finishT - lead.finishT : null;
      d.lapsDown = down;
      d.points = !d.dnf && i < pts.length ? pts[i] : 0;
    });
  } else {
    list.sort((a, b) => (a.sum.best ?? 1e9) - (b.sum.best ?? 1e9));
    const best = list[0]?.sum.best;
    list.forEach((d) => { d.gap = d.sum.best != null && best != null ? d.sum.best - best : null; });
  }
  list.forEach((d, i) => { d.cls = i + 1; });

  // Teammates share a colour, so the second driver of a team gets a dashed line.
  const seen = new Set();
  list.forEach((d) => { d.dashed = seen.has(d.team); seen.add(d.team); });
  return list;
}

async function loadSession() {
  const token = ++S.token;
  const ev = S.event.name, ses = S.session;
  S.drivers = [];
  S.byCode = {};
  S.lapSel = null;
  S.tel = [];
  S.zoom = null;
  showPanelSkeleton();

  try {
    const drivers = await Api.drivers(ev, ses);
    const results = await Promise.allSettled(drivers.map((d) => Api.laptimes(ev, ses, d.driver)));
    if (token !== S.token) return;
    const list = [];
    drivers.forEach((d, i) => {
      if (results[i].status !== "fulfilled") return;
      const L = results[i].value;
      if (!L.lap || !L.lap.length) return;
      for (const k of ["time", "del", "pin", "pout", "pos", "stint", "compound", "fresh", "life", "s1", "s2", "s3", "sesT", "lST"]) {
        if (!Array.isArray(L[k])) L[k] = L.lap.map(() => null);
      }
      list.push({ ...d, color: "#" + (d.tc || "888888"), L, sum: summarize(d, L) });
    });
    S.drivers = classify(list);
    S.drivers.forEach((d) => { S.byCode[d.driver] = d; });
    renderPanel();
  } catch (err) {
    if (token !== S.token) return;
    $$(".panel").forEach((p) => { p.innerHTML = `<div class="card empty">Couldn't load this session (${esc(err.message)}).</div>`; });
  }
}

function showPanelSkeleton() {
  $$(".panel").forEach((p) => { p.hidden = p.dataset.panel !== S.tab; });
  const p = $(`.panel[data-panel="${S.tab}"]`);
  p.innerHTML = `<div class="stack"><div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:420px"></div></div>`;
}

function renderPanel() {
  $$(".panel").forEach((p) => { p.hidden = p.dataset.panel !== S.tab; });
  if (!S.drivers.length) return;
  const p = $(`.panel[data-panel="${S.tab}"]`);
  ({ results: renderResults, laps: renderLaps, strategy: renderStrategy, telemetry: renderTelemetry, info: renderInfo })[S.tab](p);
}

// ---------- Results ----------
function renderResults(p) {
  const D = S.drivers;
  const race = isRaceLike();
  const fastest = D.filter((d) => d.sum.best != null).sort((a, b) => a.sum.best - b.sum.best)[0];
  const topSpeed = D.filter((d) => d.sum.topSpeed != null).sort((a, b) => b.sum.topSpeed - a.sum.topSpeed)[0];
  const totalLaps = Math.max(...D.map((d) => d.sum.lapsDone));

  // Overall best sectors, for purple highlighting.
  const bestSec = [1, 2, 3].map((k) => Math.min(...D.map((d) => d.sum.bestIdx >= 0 ? d.L["s" + k][d.sum.bestIdx] ?? 1e9 : 1e9)));

  const podium = D.slice(0, 3);
  const order = [1, 0, 2].filter((i) => podium[i]);
  const podiumHtml = `<div class="podium">${order.map((i) => {
    const d = podium[i];
    const gap = i === 0 ? (race ? "Winner" : fmtLap(d.sum.best)) : fmtGap(d.gap);
    return `<div class="pod p${i + 1}" style="--tc:${d.color}">
      <div class="pnum">${i + 1}</div>
      <div class="who"><span class="fn">${esc(d.fn)}</span><span class="ln">${esc(d.ln)}</span>
      <span class="tm">${esc(d.team)}</span><span class="gap">${gap}</span></div>
      ${d.url ? `<img src="${esc(d.url)}" alt="${esc(d.fn + " " + d.ln)}" onerror="this.remove()">` : ""}
    </div>`;
  }).join("")}</div>`;

  const hl = [
    [race ? "Winner" : "Fastest", `${esc(D[0].ln)}`, esc(D[0].team)],
    ["Fastest lap", fastest ? fmtLap(fastest.sum.best) : "—", fastest ? `${esc(fastest.driver)} · Lap ${fastest.sum.bestLap}` : ""],
    ["Top speed (trap)", topSpeed ? `${topSpeed.sum.topSpeed} km/h` : "—", topSpeed ? esc(topSpeed.driver) : ""],
    [race ? "Race laps" : "Most laps", race ? totalLaps : Math.max(...D.map((d) => d.L.lap.length)), `${D.length} drivers classified`],
  ];
  const hlHtml = `<div class="grid-4" style="margin-bottom:18px">${hl.map(([k, v, s]) =>
    `<div class="card"><div class="round">${k}</div><div style="font-size:26px;font-weight:900;line-height:1.2">${v}</div><div class="sub" style="margin:0">${s}</div></div>`).join("")}</div>`;

  const head = race
    ? "<th>Pos</th><th>Driver</th><th>Team</th><th class='num'>Laps</th><th class='num'>Time / Gap</th><th class='num'>Best lap</th><th class='num'>Stops</th><th class='num'>Pts</th>"
    : "<th>Pos</th><th>Driver</th><th>Team</th><th class='num'>Best lap</th><th class='num'>Gap</th><th class='num'>S1</th><th class='num'>S2</th><th class='num'>S3</th><th>Tyre</th><th class='num'>Laps</th><th class='num'>Trap</th>";

  const rows = D.map((d) => {
    const s = d.sum;
    const drv = `<div class="drv-cell" style="--tc:${d.color}"><span class="tbar"></span>${avatar(d)}
      <span class="drv-name"><span>${esc(d.fn)}</span> <b>${esc(d.ln)}</b></span></div>`;
    const isFl = fastest && d === fastest;
    const bestCell = `<span class="${isFl ? "purple" : ""}">${fmtLap(s.best)}</span>${isFl ? ' <span class="tag fl">FL</span>' : ""}`;
    if (race) {
      let gap;
      if (d.dnf) gap = '<span class="tag dnf">DNF</span>';
      else if (d.cls === 1) gap = fmtLap(s.finishT - d.L.lST[0]);
      else if (d.lapsDown > 0) gap = `+${d.lapsDown} Lap${d.lapsDown > 1 ? "s" : ""}`;
      else gap = fmtGap(d.gap);
      return `<tr><td class="pos">${d.dnf ? "—" : d.cls}</td><td>${drv}</td><td>${esc(d.team)}</td>
        <td class="num">${s.lapsDone}</td><td class="num">${gap}</td><td class="num">${bestCell}</td>
        <td class="num">${Math.max(0, s.stints.length - 1)}</td><td class="num"><b>${d.points || ""}</b></td></tr>`;
    }
    const sec = [1, 2, 3].map((k) => {
      const v = s.bestIdx >= 0 ? d.L["s" + k][s.bestIdx] : null;
      return `<td class="num ${v != null && v === bestSec[k - 1] ? "purple" : ""}">${v != null ? v.toFixed(3) : "—"}</td>`;
    }).join("");
    const cmp = s.bestIdx >= 0 ? d.L.compound[s.bestIdx] : null;
    return `<tr><td class="pos">${s.best != null ? d.cls : "—"}</td><td>${drv}</td><td>${esc(d.team)}</td>
      <td class="num">${bestCell}</td><td class="num">${d.cls === 1 ? "" : fmtGap(d.gap)}</td>${sec}
      <td>${cmp ? `<span class="legend"><span style="--c:${compoundColor(cmp)}"><i></i>${esc(cmp[0] + cmp.slice(1).toLowerCase())}</span></span>` : "—"}</td>
      <td class="num">${d.L.lap.length}</td><td class="num">${s.topSpeed ?? "—"}</td></tr>`;
  }).join("");

  p.innerHTML = podiumHtml + hlHtml + `<div class="card"><h3>${race ? "Classification" : "Timesheet"}</h3>
    <p class="sub">${race ? "Derived from lap data — order by laps completed and final position." : "Ordered by each driver's best valid lap. Purple = fastest overall."}</p>
    <div class="table-wrap"><table class="results"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// ---------- Lap times ----------
function driverChips(selected, attr = "data-drv") {
  return S.drivers.map((d) =>
    `<button class="drv-chip" ${attr}="${d.driver}" aria-pressed="${selected.has(d.driver)}" style="--tc:${d.color}"><i></i>${d.driver}</button>`).join("");
}

function sessionBest() {
  return Math.min(...S.drivers.map((d) => d.sum.best ?? 1e9));
}

function isCleanLap(L, i, threshold) {
  const t = L.time[i];
  return t != null && !L.del[i] && L.pin[i] == null && L.pout[i] == null && t <= threshold;
}

function renderLaps(p) {
  if (!S.lapSel) S.lapSel = new Set(S.drivers.slice(0, 5).map((d) => d.driver));
  const race = isRaceLike();
  p.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar"><span class="label">Drivers</span>
        <button class="btn" data-act="top5">Top 5</button><button class="btn" data-act="all">All</button><button class="btn" data-act="none">Clear</button>
        <span style="flex:1"></span>
        <label class="switch"><input type="checkbox" id="cleanToggle" ${S.cleanLaps ? "checked" : ""}> Hide pit, SC &amp; slow laps (&gt;107%)</label>
      </div>
      <div class="drv-chips" id="lapChips">${driverChips(S.lapSel)}</div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><h3>Lap times</h3><p class="sub">Point colour = tyre compound. Dashed line = second driver of a team.</p></div>
      <div class="legend">${["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].map((c) => `<span style="--c:${compoundColor(c)}"><i></i>${c[0] + c.slice(1).toLowerCase()}</span>`).join("")}</div></div>
      <div class="chart-box"><canvas id="lapChart"></canvas></div>
    </div>
    <div class="grid-2">
      ${race ? `<div class="card"><h3>Positions</h3><p class="sub">Running order at the end of each lap.</p><div class="chart-box"><canvas id="posChart"></canvas></div></div>` : ""}
      <div class="card" ${race ? "" : 'style="grid-column:1/-1"'}><h3>Median clean-lap pace</h3><p class="sub">Excludes in/out laps, deleted laps and laps over 107% of the session best.</p><div class="chart-box"><canvas id="paceChart"></canvas></div></div>
    </div>`;

  p.querySelector(".toolbar").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "top5") S.lapSel = new Set(S.drivers.slice(0, 5).map((d) => d.driver));
    if (act === "all") S.lapSel = new Set(S.drivers.map((d) => d.driver));
    if (act === "none") S.lapSel = new Set();
    renderLaps(p);
  });
  $("#lapChips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-drv]");
    if (!c) return;
    const code = c.dataset.drv;
    S.lapSel.has(code) ? S.lapSel.delete(code) : S.lapSel.add(code);
    c.setAttribute("aria-pressed", S.lapSel.has(code));
    drawLapCharts();
  });
  $("#cleanToggle").addEventListener("change", (e) => { S.cleanLaps = e.target.checked; drawLapCharts(); });
  drawLapCharts();
}

function drawLapCharts() {
  destroyCharts("laps");
  const sel = S.drivers.filter((d) => S.lapSel.has(d.driver));
  const thr = sessionBest() * 1.07;

  const lapSets = sel.map((d) => {
    const L = d.L;
    const pts = [];
    L.lap.forEach((lap, i) => {
      if (L.time[i] == null) return;
      if (S.cleanLaps && !isCleanLap(L, i, thr)) return;
      pts.push({ x: lap, y: L.time[i], c: L.compound[i], age: L.life[i] });
    });
    return {
      label: d.driver, data: pts, borderColor: d.color, borderWidth: 1.6, borderDash: d.dashed ? [5, 4] : [],
      pointRadius: 3.5, pointHoverRadius: 6, pointBorderColor: d.color, pointBorderWidth: 1,
      pointBackgroundColor: pts.map((pt) => compoundColor(pt.c)), tension: 0.15, spanGaps: false,
    };
  });
  makeChart("laps", $("#lapChart"), {
    type: "line",
    data: { datasets: lapSets },
    options: {
      parsing: false,
      interaction: { mode: "nearest", intersect: false },
      scales: {
        x: { type: "linear", title: { display: true, text: "Lap" }, ticks: { precision: 0 } },
        y: { title: { display: true, text: "Lap time" }, ticks: { callback: (v) => fmtLap(v) } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: (items) => `Lap ${items[0].raw.x}`,
            label: (it) => ` ${it.dataset.label}  ${fmtLap(it.raw.y)}  ·  ${it.raw.c ?? "?"} (${it.raw.age ?? "?"} laps old)`,
          },
        },
      },
    },
  });

  if ($("#posChart")) {
    makeChart("laps", $("#posChart"), {
      type: "line",
      data: {
        datasets: sel.map((d) => ({
          label: d.driver, borderColor: d.color, borderWidth: 2, borderDash: d.dashed ? [5, 4] : [], pointRadius: 0, stepped: false,
          data: d.L.lap.map((lap, i) => ({ x: lap, y: d.L.pos[i] })).filter((pt) => pt.y != null),
        })),
      },
      options: {
        parsing: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { type: "linear", title: { display: true, text: "Lap" }, ticks: { precision: 0 } },
          y: {
            reverse: true, min: 0.5, max: S.drivers.length + 0.5, title: { display: true, text: "Position" },
            afterBuildTicks: (s) => { s.ticks = S.drivers.map((_, i) => ({ value: i + 1 })).filter((t) => t.value === 1 || t.value % 2 === 0); },
          },
        },
        plugins: { tooltip: { itemSort: (a, b) => a.raw.y - b.raw.y, callbacks: { label: (it) => ` P${it.raw.y}  ${it.dataset.label}` } } },
      },
    });
  }

  const pace = sel.map((d) => {
    const clean = d.L.time.filter((_, i) => isCleanLap(d.L, i, thr));
    return { d, m: median(clean), n: clean.length };
  }).filter((x) => x.m != null).sort((a, b) => a.m - b.m);
  makeChart("laps", $("#paceChart"), {
    type: "bar",
    data: {
      labels: pace.map((x) => x.d.driver),
      datasets: [{ data: pace.map((x) => x.m), backgroundColor: pace.map((x) => x.d.color), borderRadius: 4, barPercentage: 0.75 }],
    },
    options: {
      indexAxis: "y",
      scales: {
        x: { min: pace.length ? Math.floor(pace[0].m - 0.5) : undefined, ticks: { callback: (v) => fmtLap(v) } },
        y: { grid: { display: false } },
      },
      plugins: {
        tooltip: { callbacks: { label: (it) => ` ${fmtLap(it.raw)}  (${fmtGap(it.raw - pace[0].m)}, ${pace[it.dataIndex].n} laps)` } },
      },
    },
  });
}

// ---------- Strategy ----------
function renderStrategy(p) {
  const total = Math.max(...S.drivers.map((d) => d.L.lap.at(-1)));
  const rows = S.drivers.map((d) => {
    const stints = d.sum.stints.map((s) => {
      const laps = s.to - s.from + 1;
      const title = `${d.driver} · Stint ${s.stint ?? "?"}: ${s.compound} · laps ${s.from}–${s.to} (${laps})${s.fresh === false ? " · used set" : " · new set"}`;
      return `<div class="stint" title="${esc(title)}" style="--c:${compoundColor(s.compound)};width:${(laps / total) * 100}%;${s.fresh === false ? "background-image:repeating-linear-gradient(-45deg,transparent 0 5px,rgba(0,0,0,.18) 5px 7px)" : ""}">${laps >= 3 ? laps : ""}</div>`;
    }).join("");
    return `<div class="strat-row"><div class="who" style="--tc:${d.color}"><span class="tbar" style="height:16px"></span>${d.driver}</div><div class="strat-track">${stints}</div></div>`;
  }).join("");
  p.innerHTML = `<div class="card">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><h3>Tyre strategy</h3><p class="sub">Each bar is a stint; numbers are stint length in laps. Striped = used set.</p></div>
    <div class="legend">${["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].map((c) => `<span style="--c:${compoundColor(c)}"><i></i>${c[0] + c.slice(1).toLowerCase()}</span>`).join("")}</div></div>
    <div class="strat">${rows}
      <div class="strat-axis"><span></span><div><span>Lap 1</span><span>Lap ${Math.round(total / 2)}</span><span>Lap ${total}</span></div></div>
    </div></div>`;
}

// ---------- Telemetry ----------
const TEL_CHARTS = [
  { key: "speed", label: "Speed", unit: "km/h", cls: "", step: false },
  { key: "delta", label: "Delta to reference", unit: "s", cls: "sm", step: false },
  { key: "throttle", label: "Throttle", unit: "%", cls: "xs", step: false },
  { key: "brake", label: "Brake", unit: "", cls: "xs", step: true },
  { key: "gear", label: "Gear", unit: "", cls: "xs", step: true },
  { key: "rpm", label: "RPM", unit: "", cls: "xs", step: false },
  { key: "drs", label: "DRS", unit: "", cls: "xs", step: true },
];

// Teammates share a team colour; give repeated colours a distinct alternative in comparisons.
const ALT_COLORS = ["#00d2ff", "#ff4fd8", "#a3e635", "#ffd000"];
function telColors() {
  const used = [];
  return S.tel.map((s) => {
    let c = S.byCode[s.drv].color.toLowerCase();
    if (used.includes(c)) c = ALT_COLORS.find((a) => !used.includes(a));
    used.push(c);
    return c;
  });
}

function defaultTel() {
  return S.drivers.filter((d) => d.sum.bestLap != null).slice(0, 2).map((d) => ({ drv: d.driver, lap: d.sum.bestLap }));
}

function lapOptions(d, selected) {
  const L = d.L;
  return L.lap.map((lap, i) => {
    const t = L.time[i];
    const star = i === d.sum.bestIdx ? "★ " : "";
    const label = `${star}Lap ${lap} · ${t != null ? fmtLap(t) : "no time"}${L.compound[i] ? " · " + L.compound[i][0] : ""}${L.del[i] ? " · deleted" : ""}`;
    return `<option value="${lap}" ${lap === selected ? "selected" : ""}>${label}</option>`;
  }).join("");
}

function renderTelemetry(p) {
  if (!S.tel.length) S.tel = defaultTel();
  destroyCharts("tel");
  const colors = telColors();
  const selRows = S.tel.map((s, i) => {
    const d = S.byCode[s.drv];
    return `<div class="sel-row" data-i="${i}" style="--tc:${colors[i]}">
      <select data-role="drv" aria-label="Driver">${S.drivers.map((x) => `<option value="${x.driver}" ${x.driver === s.drv ? "selected" : ""}>${x.driver} – ${esc(x.ln)}</option>`).join("")}</select>
      <select data-role="lap" aria-label="Lap">${lapOptions(d, s.lap)}</select>
      ${S.tel.length > 1 ? `<button class="x" data-role="rm" aria-label="Remove">×</button>` : ""}
    </div>`;
  }).join("");

  p.innerHTML = `<div class="tel-layout">
    <div class="tel-charts stack" id="telCharts">${TEL_CHARTS.map((c) =>
      `<div class="card" data-chart="${c.key}"><div class="ct"><span>${c.label}</span><span>${c.unit}</span></div><div class="chart-box ${c.cls}"><canvas></canvas></div></div>`).join("")}
      <p class="sub" style="margin:0">Tip: drag across any chart to zoom into a section, double-click to reset.</p>
    </div>
    <aside class="tel-side">
      <div class="card"><h3>Compare laps</h3><p class="sub">First row is the reference for the delta trace.</p>
        <div class="sel-list" id="selList">${selRows}</div>
        <div class="toolbar" style="margin:10px 0 0">
          ${S.tel.length < MAX_TEL ? '<button class="btn" id="addSel">+ Add driver</button>' : ""}
          <button class="btn" id="resetSel">Fastest laps</button>
        </div>
      </div>
      <div class="card"><h3 id="mapTitle">Track map</h3><p class="sub" id="mapSub"></p><canvas class="track-canvas" id="trackMap"></canvas><div class="legend" id="mapLegend" style="margin-top:8px"></div></div>
      <div class="card"><h3>Readout</h3><p class="sub" id="roDist">Hover a chart</p><div class="readout" id="readout"></div></div>
      <div class="card"><h3>Lap summary</h3><div class="lap-summary" id="lapSummary"></div></div>
    </aside></div>`;

  $("#selList").addEventListener("change", (e) => {
    const row = e.target.closest(".sel-row");
    const i = +row.dataset.i;
    if (e.target.dataset.role === "drv") {
      const d = S.byCode[e.target.value];
      S.tel[i] = { drv: d.driver, lap: d.sum.bestLap ?? d.L.lap[0] };
    } else {
      S.tel[i].lap = +e.target.value;
    }
    renderTelemetry(p);
  });
  $("#selList").addEventListener("click", (e) => {
    if (e.target.dataset.role !== "rm") return;
    S.tel.splice(+e.target.closest(".sel-row").dataset.i, 1);
    renderTelemetry(p);
  });
  $("#addSel")?.addEventListener("click", () => {
    const used = new Set(S.tel.map((s) => s.drv));
    const d = S.drivers.find((x) => !used.has(x.driver) && x.sum.bestLap != null) || S.drivers[0];
    S.tel.push({ drv: d.driver, lap: d.sum.bestLap ?? d.L.lap[0] });
    renderTelemetry(p);
  });
  $("#resetSel").addEventListener("click", () => { S.tel = defaultTel(); S.zoom = null; renderTelemetry(p); });

  loadTelemetry();
}

async function loadTelemetry() {
  const ev = S.event.name, ses = S.session, token = S.token;
  const want = S.tel.map((s) => ({ ...s }));
  const results = await Promise.allSettled(want.map((s) => Api.telemetry(ev, ses, s.drv, s.lap)));
  if (token !== S.token || S.tab !== "telemetry" || JSON.stringify(want) !== JSON.stringify(S.tel)) return;
  const [corners] = await Promise.allSettled([Api.corners(ev, ses)]);

  const traces = [];
  const colors = telColors();
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.distance?.length) {
      traces.push({ ...want[i], d: S.byCode[want[i].drv], color: colors[i], T: r.value });
    } else {
      toast(`No telemetry for ${want[i].drv} lap ${want[i].lap}`);
    }
  });
  if (!traces.length) {
    $("#telCharts").innerHTML = '<div class="card empty">No telemetry available for this selection.</div>';
    return;
  }
  const C = corners.status === "fulfilled" ? corners.value : null;
  drawTelemetry(traces, C);
}

function drawTelemetry(traces, C) {
  const ref = traces[0];
  const maxD = Math.max(...traces.map((t) => t.T.distance.at(-1)));
  const cornerList = C ? C.CornerNumber.map((n, i) => ({ n, d: C.Distance[i], x: C.X[i], y: C.Y[i] })) : [];

  // Delta vs reference: time difference at equal distance.
  traces.forEach((t) => {
    t.T.delta = t.T.distance.map((dist, i) => t.T.time[i] - interp(ref.T.distance, ref.T.time, dist));
    t.T.brake = t.T.brake.map((b) => (b === true ? 1 : b === false ? 0 : b));
    t.T.drs = t.T.drs.map((v) => (v >= 10 ? 1 : 0)); // FastF1 DRS codes: 10/12/14 = open
  });

  const charts = [];
  TEL_CHARTS.forEach((cfg) => {
    const box = $(`#telCharts [data-chart="${cfg.key}"]`);
    if (cfg.key === "delta" && traces.length < 2) { box.hidden = true; return; }
    const chart = makeChart("tel", box.querySelector("canvas"), {
      type: "line",
      data: {
        datasets: traces.map((t) => ({
          label: `${t.drv} L${t.lap}`,
          data: t.T.distance.map((x, i) => ({ x, y: t.T[cfg.key][i] })),
          borderColor: t.color, borderWidth: cfg.key === "speed" ? 2 : 1.5,
          borderDash: traces.filter((o) => o.d.team === t.d.team).indexOf(t) > 0 ? [5, 4] : [],
          pointRadius: 0, stepped: cfg.step, tension: 0,
        })),
      },
      options: {
        parsing: false, normalized: true, events: [],
        layout: { padding: { left: 4 } },
        scales: {
          x: { type: "linear", min: S.zoom?.[0] ?? 0, max: S.zoom?.[1] ?? maxD, display: cfg.key === "drs",
               title: { display: cfg.key === "drs", text: "Distance (m)" }, ticks: { maxTicksLimit: 12 } },
          y: {
            afterFit: (s) => { s.width = 46; },
            ...(cfg.key === "throttle" ? { min: 0, max: 100, ticks: { stepSize: 50 } } : {}),
            ...(cfg.key === "brake" || cfg.key === "drs" ? { min: 0, max: 1, ticks: { stepSize: 1, callback: (v) => (v ? "On" : "Off") } } : {}),
            ...(cfg.key === "gear" ? { min: 1, max: 8, ticks: { stepSize: 2 } } : {}),
          },
        },
        plugins: {
          tooltip: { enabled: false },
          crosshair: { enabled: true },
          corners: { list: cornerList, labels: cfg.key === "speed" },
        },
      },
    });
    charts.push(chart);
  });

  const update = (hx) => {
    charts.forEach((c) => { c.$hoverX = hx; c.draw(); });
    drawTelSide(traces, cornerList, C, hx);
  };
  wireTelInteractions(charts, maxD, update);
  update(null);
}

function wireTelInteractions(charts, maxD, update) {
  S.telAbort?.abort();
  S.telAbort = new AbortController();
  const { signal } = S.telAbort;
  let raf = 0, dragFrom = null, dragChart = null;
  const valueAt = (chart, e) => {
    const rect = chart.canvas.getBoundingClientRect();
    const sc = chart.scales.x;
    return Math.max(sc.min, Math.min(sc.max, sc.getValueForPixel(e.clientX - rect.left)));
  };
  const setZoom = (z) => {
    S.zoom = z;
    charts.forEach((c) => {
      c.options.scales.x.min = z ? z[0] : 0;
      c.options.scales.x.max = z ? z[1] : maxD;
      c.$drag = null;
      c.update("none");
    });
  };
  charts.forEach((chart) => {
    const cv = chart.canvas;
    cv.style.cursor = "crosshair";
    cv.addEventListener("mousemove", (e) => {
      const v = valueAt(chart, e);
      if (dragFrom != null) charts.forEach((c) => { c.$drag = [dragFrom, v]; });
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => update(v));
    });
    cv.addEventListener("mouseleave", () => { cancelAnimationFrame(raf); update(null); });
    cv.addEventListener("mousedown", (e) => { e.preventDefault(); dragFrom = valueAt(chart, e); dragChart = chart; });
    cv.addEventListener("dblclick", () => setZoom(null));
  });
  window.addEventListener("mouseup", (e) => {
    if (dragFrom == null) return;
    const to = valueAt(dragChart, e), from = dragFrom;
    dragFrom = null;
    if (Math.abs(to - from) > maxD * 0.01) setZoom([Math.min(from, to), Math.max(from, to)]);
    else charts.forEach((c) => { c.$drag = null; c.draw(); });
  }, { signal });
}

function drawTelSide(traces, cornerList, C, hx) {
  const ref = traces[0];
  const canvas = $("#trackMap");
  if (!canvas) return;
  const T = ref.T;
  let segColors, legend = "";

  if (traces.length === 1) {
    const lo = Math.min(...T.speed), hi = Math.max(...T.speed);
    segColors = (i) => speedColor((T.speed[i] - lo) / (hi - lo || 1));
    $("#mapTitle").textContent = "Speed map";
    $("#mapSub").textContent = `${ref.drv} lap ${ref.lap}: ${Math.round(lo)}–${Math.round(hi)} km/h`;
    legend = `<span style="flex:1;height:8px;border-radius:4px;background:linear-gradient(90deg,${[0, .35, .6, .8, 1].map(speedColor).join(",")})"></span>`;
  } else {
    // Mini-sector dominance: which lap was fastest through each 1/25th of the lap.
    const N = 25, len = T.distance.at(-1);
    const winners = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * len, b = ((k + 1) / N) * len;
      let bestT = Infinity, w = 0;
      traces.forEach((t, j) => {
        const dt = interp(t.T.distance, t.T.time, b) - interp(t.T.distance, t.T.time, a);
        if (dt < bestT) { bestT = dt; w = j; }
      });
      winners.push(w);
    }
    segColors = (i) => traces[winners[Math.min(N - 1, Math.floor((T.distance[i] / len) * N))]].color;
    const counts = traces.map((_, j) => winners.filter((w) => w === j).length);
    $("#mapTitle").textContent = "Track dominance";
    $("#mapSub").textContent = "Fastest driver through each of 25 mini-sectors";
    legend = traces.map((t, j) => `<span style="--c:${t.color}"><i style="background:${t.color}"></i>${t.drv} · ${counts[j]}</span>`).join("");
  }

  const markers = hx == null ? [] : traces.map((t) => {
    const i = bisect(t.T.distance, hx);
    return { x: t.T.x[i], y: t.T.y[i], color: t.color };
  });
  drawTrack(canvas, { xs: T.x, ys: T.y, segColors, rotation: C?.Rotation ?? 0, corners: cornerList, marker: markers });
  $("#mapLegend").innerHTML = legend;

  // Readout
  if (hx == null) {
    $("#roDist").textContent = "Hover a chart to inspect values";
    $("#readout").innerHTML = "";
  } else {
    $("#roDist").textContent = `At ${Math.round(hx)} m`;
    $("#readout").innerHTML = `<div class="r h"><span></span><span>km/h</span><span>Gear</span><span>Thr %</span><span>Δ s</span></div>` +
      traces.map((t) => {
        const i = bisect(t.T.distance, hx);
        const dl = interp(t.T.distance, t.T.delta, hx);
        return `<div class="r" style="--tc:${t.color}"><b>${t.drv}</b><span>${Math.round(t.T.speed[i])}</span><span>${t.T.gear[i]}</span><span>${Math.round(t.T.throttle[i])}</span><span>${t === ref ? "ref" : fmtGap(dl)}</span></div>`;
      }).join("");
  }

  // Lap summary
  $("#lapSummary").innerHTML = traces.map((t) => {
    const L = t.d.L, i = L.lap.indexOf(t.lap);
    const time = L.time[i];
    return `<div class="r"><span><b style="color:${t.color}">${t.drv}</b> · Lap ${t.lap} · ${L.compound[i] ?? "?"}</span>
      <span class="mono">${fmtLap(time)}${t !== ref && time != null && ref.d.L.time[ref.d.L.lap.indexOf(ref.lap)] != null ? " (" + fmtGap(time - ref.d.L.time[ref.d.L.lap.indexOf(ref.lap)]) + ")" : ""}</span></div>
      <div class="r" style="color:var(--text-2);font-size:12px;margin-bottom:6px"><span>S1 ${L.s1[i]?.toFixed(3) ?? "—"} · S2 ${L.s2[i]?.toFixed(3) ?? "—"} · S3 ${L.s3[i]?.toFixed(3) ?? "—"}</span><span>Vmax ${Math.round(Math.max(...t.T.speed))}</span></div>`;
  }).join("");
}

// ---------- Weather & race control ----------
const FLAG_COLORS = {
  GREEN: "#22c55e", CLEAR: "#22c55e", YELLOW: "#facc15", "DOUBLE YELLOW": "#f59e0b",
  RED: "#ef4444", BLUE: "#3b82f6", CHEQUERED: "#ffffff", "BLACK AND WHITE": "#9ca3af",
};

async function renderInfo(p) {
  p.innerHTML = `<div class="grid-2"><div class="skeleton" style="height:420px"></div><div class="skeleton" style="height:420px"></div></div>`;
  const ev = S.event.name, ses = S.session, token = S.token;
  const [wx, rcm] = await Promise.allSettled([Api.weather(ev, ses), Api.rcm(ev, ses)]);
  if (token !== S.token || S.tab !== "info") return;
  destroyCharts("info");

  let wxHtml = '<div class="card empty">No weather data.</div>';
  const W = wx.status === "fulfilled" ? wx.value : null;
  if (W && W.wT?.length) {
    const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const rain = W.wR.some(Boolean);
    const stats = [
      ["Air", `${avg(W.wAT).toFixed(1)}°C`], ["Track", `${avg(W.wTT).toFixed(1)}°C`], ["Humidity", `${Math.round(avg(W.wH))}%`],
      ["Wind", `${avg(W.wWS).toFixed(1)} m/s`], ["Pressure", `${Math.round(avg(W.wP))} hPa`], ["Rain", rain ? "Yes 🌧" : "No"],
    ];
    wxHtml = `<div class="card"><h3>Weather</h3><p class="sub">Session averages and trends (minutes from first reading).</p>
      <div class="wx-now">${stats.map(([k, v]) => `<div class="stat"><div class="v" style="font-size:22px">${v}</div><div class="k">${k}</div></div>`).join("")}</div>
      <div class="stack">
        <div><div class="ct round">Temperature °C</div><div class="chart-box sm"><canvas id="wxTemp"></canvas></div></div>
        <div><div class="ct round">Humidity % · Wind m/s</div><div class="chart-box sm"><canvas id="wxHum"></canvas></div></div>
      </div></div>`;
  }

  const R = rcm.status === "fulfilled" ? rcm.value : null;
  const cats = R ? ["All", ...new Set(R.cat.filter(Boolean))] : [];
  if (!cats.includes(S.rcmFilter)) S.rcmFilter = "All";
  const rcmHtml = R ? `<div class="card"><h3>Race control</h3><p class="sub">${R.msg.length} messages from the race director.</p>
    <div class="seg" id="rcmFilter" style="margin-bottom:10px;flex-wrap:wrap">${cats.map((c) => `<button data-c="${esc(c)}" class="${c === S.rcmFilter ? "active" : ""}">${esc(c)}</button>`).join("")}</div>
    <div class="rcm" id="rcmList"></div></div>` : '<div class="card empty">No race control messages.</div>';

  p.innerHTML = `<div class="grid-2">${wxHtml}${rcmHtml}</div>`;

  if (W && W.wT?.length) {
    const t0 = W.wT[0];
    const xy = (arr) => arr.map((v, i) => ({ x: (W.wT[i] - t0) / 60, y: v }));
    const base = (extra) => ({
      parsing: false, interaction: { mode: "index", intersect: false },
      scales: { x: { type: "linear", ticks: { callback: (v) => `${Math.round(v)}m` } } },
      plugins: { legend: { display: true, labels: { boxWidth: 10, boxHeight: 10 } } }, ...extra,
    });
    const line = (label, data, color) => ({ label, data, borderColor: color, backgroundColor: color, pointRadius: 0, borderWidth: 2, tension: 0.3 });
    makeChart("info", $("#wxTemp"), { type: "line", data: { datasets: [line("Track", xy(W.wTT), "#e10600"), line("Air", xy(W.wAT), "#3b82f6")] }, options: base() });
    makeChart("info", $("#wxHum"), {
      type: "line",
      data: { datasets: [line("Humidity %", xy(W.wH), "#22c55e"), { ...line("Wind m/s", xy(W.wWS), "#f59e0b"), yAxisID: "y2" }] },
      options: base({ scales: { x: { type: "linear", ticks: { callback: (v) => `${Math.round(v)}m` } }, y: {}, y2: { position: "right", grid: { display: false } } } }),
    });
  }

  if (R) {
    const drawRcm = () => {
      const items = R.msg.map((m, i) => i).filter((i) => S.rcmFilter === "All" || R.cat[i] === S.rcmFilter);
      $("#rcmList").innerHTML = items.map((i) => {
        const fc = FLAG_COLORS[R.flag[i]];
        return `<div class="rcm-item"><span class="t">${esc((R.time[i] || "").slice(11, 19))}</span>
          <span class="l">${R.lap[i] != null ? "L" + R.lap[i] : ""}</span>
          <span>${fc ? `<span class="flagdot" style="--c:${fc}"></span>` : ""}${esc(R.msg[i])}</span></div>`;
      }).join("") || '<div class="empty">No messages in this category.</div>';
    };
    $("#rcmFilter").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      S.rcmFilter = b.dataset.c;
      $$("#rcmFilter button").forEach((x) => x.classList.toggle("active", x === b));
      drawRcm();
    });
    drawRcm();
  }
}

// ---------- Boot ----------
initTheme();
initHome();
initTabs();
window.addEventListener("hashchange", route);
let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (S.tab === "telemetry" && S.session) renderPanel(); }, 250);
});
route();
