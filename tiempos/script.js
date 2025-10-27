// script.js — Fechas/Carreras dinámicas con manifiestos + cache + fallbacks

// ===== Config =====
const RACE_LABELS = {
  serie:       n => `Serie ${n}`,
  repechaje:   n => `Repechaje ${n}`,
  semifinal:   n => `Semifinal ${n}`,
  prefinal:    () => `Prefinal`,
  final:       () => `Final`,
};

// Bases de descarga (Raw -> jsDelivr -> Statically)
const BASES = [
  (p) => `https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/${p}`,
  (p) => `https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main/${p}`,
  (p) => `https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main/${p}`,
];

const PATH_FECHAS = "resultados/fechas.json";
const PATH_INDEX  = (fecha) => `resultados/${encodeURIComponent(fecha)}/index.json`;
const PATH_JSON   = (fecha, race) => `resultados/${encodeURIComponent(fecha)}/${race}.json`;

const CACHE_MS_RESULTS = 60000; // 60s cache resultados

// ===== Utils =====
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const showToast = (msg) => { try { (window.showToast||alert)(msg); } catch { alert(msg); } };

function fetchWithTimeout(url, opts={}, ms=8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' })
    .finally(() => clearTimeout(t));
}

async function fetchJSONFallback(path, retries=2) {
  let delay = 600;
  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const mk of BASES) {
      const url = mk(path);
      try {
        const res = await fetchWithTimeout(url, {}, 9000);
        if (res.ok) return await res.json();
        if (res.status === 404) { const e = new Error('not-found'); e.code = 404; throw e; }
      } catch (err) {
        if (err?.code === 404) throw err;
      }
    }
    await new Promise(r => setTimeout(r, delay + Math.random()*300));
    delay *= 2;
  }
  throw new Error('fetch-failed');
}

function prettyRaceName(race) {
  // race: "serie1", "repechaje2", "semifinal3", "prefinal", "final"
  if (/^serie(\d+)$/i.test(race))      return RACE_LABELS.serie(RegExp.$1);
  if (/^repechaje(\d+)$/i.test(race))  return RACE_LABELS.repechaje(RegExp.$1);
  if (/^semifinal(\d+)$/i.test(race))  return RACE_LABELS.semifinal(RegExp.$1);
  if (race === "prefinal")             return RACE_LABELS.prefinal();
  if (race === "final")                return RACE_LABELS.final();
  return race;
}

// ===== Cargar Fechas desde manifiesto =====
async function loadFechas() {
  const sel = $("#fecha-select");
  if (!sel) return;

  // Limpiar opciones y dejar placeholder
  sel.innerHTML = `<option value="">-- Elegir Fecha --</option>`;

  try {
    const data = await fetchJSONFallback(PATH_FECHAS);  // { fechas: ["Fecha 1","Fecha 3",...] }
    const fechas = Array.isArray(data?.fechas) ? data.fechas : [];

    // Ordenar por número si están en formato "Fecha N"
    fechas.sort((a,b) => {
      const na = parseInt((a.match(/\d+/)||[])[0]||0,10);
      const nb = parseInt((b.match(/\d+/)||[])[0]||0,10);
      return na - nb;
    });

    // Repoblar opciones
    for (const f of fechas) {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    }

    // Restaurar seleccionada si existe en la lista, si no elegir la última (más reciente)
    const saved = localStorage.getItem("selectedFecha");
    if (saved && fechas.includes(saved)) sel.value = saved;
    else if (fechas.length) sel.value = fechas[fechas.length - 1];

    // Cargar carreras para la seleccion actual (si hay)
    if (sel.value) await loadRaces();

  } catch (err) {
    // Sin manifiesto → no mostramos fechas (evitamos falsos positivos)
    console.warn("No se pudo leer fechas.json:", err);
    showToast("Aún no hay Fechas publicadas.");
  }
}

// ===== Cargar Carreras disponibles (index.json de la fecha) =====
async function loadRaces() {
  const fecha = $("#fecha-select")?.value || "";
  const ul    = $("#race-list ul");
  const tbody = $("table tbody");
  if (!fecha || !ul || !tbody) return;

  ul.innerHTML = "";
  tbody.innerHTML = "";
  localStorage.setItem("selectedFecha", fecha);

  try {
    const data = await fetchJSONFallback(PATH_INDEX(fecha)); // { races:["serie1","serie2",...]}
    const races = Array.isArray(data?.races) ? data.races : [];

    if (!races.length) {
      showToast(`No hay carreras publicadas aún en ${fecha}.`);
      return;
    }

    for (const race of races) {
      const li = document.createElement("li");
      li.textContent = prettyRaceName(race);
      li.onclick = () => loadResults(fecha, race);
      ul.appendChild(li);
    }

  } catch (err) {
    if (err?.code === 404) {
      showToast(`No hay índice de carreras para ${fecha}.`);
    } else {
      console.error("Error al cargar index.json:", err);
      showToast("Problema de red al cargar carreras.");
    }
  }
}

// ===== Resultados (1 request por toque) con cache =====
const inflight = new Map();

async function loadResults(fecha, race) {
  const tbody = $("table tbody");
  if (!tbody) return;

  const cacheKey = `${fecha}_${race}`;
  const now = Date.now();

  // Cache
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (now - parsed.timestamp <= CACHE_MS_RESULTS) {
      renderResults(parsed.data, tbody);
      highlightSelectedLI(race);
      return;
    }
  }

  // Evitar dobles llamadas al mismo recurso
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

  const p = (async () => {
    try {
      const data = await fetchJSONFallback(PATH_JSON(fecha, race));
      localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: now }));
      renderResults(data, tbody);
      highlightSelectedLI(race);
    } catch (err) {
      if (err?.code === 404) {
        disableRaceLI(race);
        showToast(`Aún no está publicado ${prettyRaceName(race)} en ${fecha}.`);
      } else {
        console.error('Error loading results:', err);
        if (cached) {
          const parsed = JSON.parse(cached);
          renderResults(parsed.data, tbody);
          showToast('Mostrando datos en caché por problemas de red.');
        } else {
          showToast('No se pudieron cargar los resultados.');
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
  // Borro opciones fijas del HTML y cargo desde manifiesto
  loadFechas();
});

// ===== Botón actualizar =====
document.getElementById("update-btn")?.addEventListener("click", () => {
  const fecha = $("#fecha-select")?.value || "";
  localStorage.clear();
  if (fecha) localStorage.setItem("selectedFecha", fecha);
  location.reload();
});

// Expone funciones si algún otro script las invoca
window.loadRaces   = loadRaces;
window.loadResults = loadResults;
