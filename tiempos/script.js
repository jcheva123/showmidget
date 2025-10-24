// script.js — robusto (timeout, múltiples CDNs, cache, no probes)

// ===== Config =====
const RACE_TYPES = [
  "serie1","serie2","serie3","serie4","serie5","serie6","serie7","serie8","serie9","serie10","serie11","serie12","serie13",
  "repechaje1","repechaje2","repechaje3","repechaje4","repechaje5","repechaje6",
  "semifinal1","semifinal2","semifinal3","semifinal4",
  "prefinal","final"
];

// Las 3 rutas en cascada
const BASES = [
  (fecha, race) => `https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/resultados/${encodeURIComponent(fecha)}/${race}.json`,
  (fecha, race) => `https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main/resultados/${encodeURIComponent(fecha)}/${race}.json`,
  (fecha, race) => `https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main/resultados/${encodeURIComponent(fecha)}/${race}.json`,
];

const CACHE_MS_RESULTS = 60000; // 60s

// ===== Utils =====
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];

function prettyRaceName(race) {
  return race
    .replace(/^serie(\d+)$/, "Serie $1")
    .replace(/^repechaje(\d+)$/, "Repechaje $1")
    .replace(/^semifinal(\d+)$/, "Semifinal $1")
    .replace("prefinal", "Prefinal")
    .replace("final", "Final");
}

function showAlert(msg){ try{ (window.showToast||alert)(msg); }catch{ alert(msg); } }

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function fetchWithTimeout(url, opts={}, ms=8000) {
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), ms);
  return fetch(url, {...opts, signal: ctrl.signal, cache:'no-store'}).finally(()=>clearTimeout(t));
}

// Descarga con fallback RAW->CDNs + backoff (429/502/red)
async function fetchJSONWithFallback(fecha, race, retries = 2) {
  let delay = 600;
  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const make of BASES) {
      const url = make(fecha, race);
      try {
        const res = await fetchWithTimeout(url, {}, 9000);
        if (res.ok) return await res.json();
        if (res.status === 404) { const e = new Error('not-found'); e.code=404; throw e; }
        // 429/5xx caen al catch
      } catch (err) {
        if (err?.code === 404) throw err; // no reintentar si no existe
        // intenta siguiente base o backoff
      }
    }
    // Backoff con jitter
    await sleep(delay + Math.random()*300);
    delay *= 2;
  }
  throw new Error('fetch-failed');
}

// ===== Poblado de lista SIN probes =====
async function loadRaces() {
  const fecha = $("#fecha-select")?.value || "";
  const ul = $("#race-list ul");
  const tbody = $("table tbody");
  if (!ul || !tbody) return;

  ul.innerHTML = "";
  tbody.innerHTML = "";

  if (!fecha) return;

  localStorage.setItem("selectedFecha", fecha);

  for (const race of RACE_TYPES) {
    const li = document.createElement("li");
    li.textContent = prettyRaceName(race);
    li.onclick = () => loadResults(fecha, race);
    ul.appendChild(li);
  }
}

// ===== Cargar resultados al toque (con cache y guardas) =====
const inflight = new Map(); // evita dobles llamadas al mismo key

async function loadResults(fecha, race) {
  const tbody = $("table tbody");
  if (!tbody) return;

  const cacheKey = `${fecha}_${race}`;
  const now = Date.now();

  // Cache hit
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (now - parsed.timestamp <= CACHE_MS_RESULTS) {
      renderResults(parsed.data, tbody);
      highlightSelectedLI(race);
      return;
    }
  }

  // Evitar dobles llamadas para el mismo key
  if (inflight.has(cacheKey)) {
    await inflight.get(cacheKey);
    const again = localStorage.getItem(cacheKey);
    if (again) {
      const parsed = JSON.parse(again);
      renderResults(parsed.data, tbody);
      highlightSelectedLI(race);
    }
    return;
  }

  // Request única con fallback/timeout
  const p = (async () => {
    try {
      const data = await fetchJSONWithFallback(fecha, race);
      localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: now }));
      renderResults(data, tbody);
      highlightSelectedLI(race);
    } catch (err) {
      if (err?.code === 404) {
        disableRaceLI(race);
        showAlert(`No hay datos para ${prettyRaceName(race)} en ${fecha}.`);
      } else {
        console.error('Error loading results:', err);
        // Si hay cache viejo, mostrarlo en emergencia
        if (cached) {
          const parsed = JSON.parse(cached);
          renderResults(parsed.data, tbody);
          showAlert('Mostrando datos en caché por problemas de red.');
        } else {
          showAlert('No se pudieron cargar los resultados. Probá nuevamente.');
        }
      }
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, p);
  await p;
}

function renderResults(data, tbody) {
  tbody.innerHTML = "";
  const rows = (data?.results || []);
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.position ?? ""}</td>
      <td>${r.number ?? ""}</td>
      <td>${r.name ?? ""}</td>
      <td>${r.rec ?? ""}</td>
      <td>${r.t_final || "N/A"}</td>
      <td>${r.laps || "N/A"}</td>
      <td class="${r.penalty ? 'penalty' : ''}">${r.penalty ?? "N/A"}</td>
    `;
    tbody.appendChild(tr);
  }
}

function highlightSelectedLI(race) {
  $$("#race-list li").forEach(li => li.classList.remove("active"));
  const pretty = prettyRaceName(race);
  const li = $$("#race-list li").find(li => li.textContent.trim() === pretty);
  if (li) li.classList.add("active");
}

function disableRaceLI(race) {
  const pretty = prettyRaceName(race);
  const li = $$("#race-list li").find(li => li.textContent.trim() === pretty);
  if (li) { li.style.opacity = '.5'; li.style.pointerEvents = 'none'; li.title = 'No disponible'; }
}

// ===== Estado inicial =====
document.addEventListener("DOMContentLoaded", () => {
  const sel = $("#fecha-select");
  const saved = localStorage.getItem("selectedFecha");
  if (sel && saved) sel.value = saved;
  loadRaces();
});

// ===== Botón actualizar =====
document.getElementById("update-btn")?.addEventListener("click", () => {
  const fecha = $("#fecha-select")?.value || "";
  localStorage.clear();
  if (fecha) localStorage.setItem("selectedFecha", fecha);
  location.reload();
});
