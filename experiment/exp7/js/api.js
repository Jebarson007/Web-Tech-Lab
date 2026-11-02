// Data access for the TracingInsights 2025 archive, fetched live from raw GitHub (CORS-open).
const DATA_BASE = "https://raw.githubusercontent.com/TracingInsights-Archive/2025/main/";

const memCache = new Map();

function dataUrl(...segments) {
  return DATA_BASE + segments.map(encodeURIComponent).join("/");
}

// The archive stores missing values as the string "None".
function clean(v) {
  return v === "None" || v === "" || v === undefined ? null : v;
}

function cleanColumns(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = Array.isArray(v) ? v.map(clean) : clean(v);
  return out;
}

function fetchJSON(...segments) {
  const url = dataUrl(...segments);
  if (memCache.has(url)) return memCache.get(url);

  let stored = null;
  try { stored = sessionStorage.getItem(url); } catch (e) { /* storage unavailable */ }
  if (stored) {
    const p = Promise.resolve(JSON.parse(stored));
    memCache.set(url, p);
    return p;
  }

  const p = fetch(url).then(async (res) => {
    if (!res.ok) throw new Error(`${res.status} – ${segments.join(" / ")}`);
    const text = await res.text();
    // Small files only; telemetry laps would exhaust the storage quota quickly.
    if (text.length < 60000) {
      try { sessionStorage.setItem(url, text); } catch (e) { /* quota full */ }
    }
    return JSON.parse(text);
  });
  p.catch(() => memCache.delete(url));
  memCache.set(url, p);
  return p;
}

const Api = {
  drivers: (ev, ses) => fetchJSON(ev, ses, "drivers.json").then((d) => d.drivers),
  corners: (ev, ses) => fetchJSON(ev, ses, "corners.json").then(cleanColumns),
  weather: (ev, ses) => fetchJSON(ev, ses, "weather.json").then(cleanColumns),
  rcm: (ev, ses) => fetchJSON(ev, ses, "rcm.json").then(cleanColumns),
  laptimes: (ev, ses, drv) => fetchJSON(ev, ses, drv, "laptimes.json").then(cleanColumns),
  telemetry: (ev, ses, drv, lap) => fetchJSON(ev, ses, drv, `${lap}_tel.json`).then((d) => cleanColumns(d.tel)),
};
