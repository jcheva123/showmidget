/* script.js — tiempos web (mobile-first)
   - RAW GitHub primero (refleja borrados al instante), con fallbacks
   - Cache-bust agresivo para que aparezcan rápido las carreras nuevas
   - Muestra solo fechas/races realmente existentes (fechas.json + index.json)
   - Limpia la UI al cambiar de carrera para evitar confusión
*/

(() => {
  'use strict';

  /* ==============================
     Config & utilidades
  ===============================*/

  // Bases en orden de preferencia
  const BASES = [
    'https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main',
    'https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main',
    'https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main'
  ];

  // Cache suave en memoria (por si el usuario cambia y vuelve a la misma carrera)
  const CACHE_MS_FECHAS = 30 * 1000;   // 30s
  const CACHE_MS_INDEX  = 45 * 1000;   // 45s por fecha
  const CACHE_MS_RESULTS = 60 * 1000;  // 60s por carrera

  // Auto-refresh del detalle de la carrera seleccionada
  const AUTO_REFRESH_MS = 7000; // refresca la carrera activa cada 7s

  // Labels legibles
  const RACE_LABELS = {
    final:       'Final',
    prefinal:    'Prefinal',
    repechaje1:  'Repechaje 1',
    repechaje2:  'Repechaje 2',
    repechaje3:  'Repechaje 3',
    repechaje4:  'Repechaje 4',
    repechaje5:  'Repechaje 5',
    repechaje6:  'Repechaje 6',
    semifinal1:  'Semifinal 1',
    semifinal2:  'Semifinal 2',
    semifinal3:  'Semifinal 3',
    semifinal4:  'Semifinal 4',
    serie1:  'Serie 1',  serie2:  'Serie 2',  serie3:  'Serie 3',
    serie4:  'Serie 4',  serie5:  'Serie 5',  serie6:  'Serie 6',
    serie7:  'Serie 7',  serie8:  'Serie 8',  serie9:  'Serie 9',
    serie10: 'Serie 10', serie11: 'Serie 11', serie12: 'Serie 12',
    serie13: 'Serie 13'
  };

  const qs  = (sel, scope = document) => scope.querySelector(sel);
  const qsa = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const nowStr = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const buildPathFechas = () => `/resultados/fechas.json`;
  const buildPathIndex  = (fecha) => `/resultados/${fecha}/index.json`;
  const buildPathRace   = (fecha, key) => `/resultados/${fecha}/${key}.json`;

  async function fetchJSONWithFallback(path, { timeout = 8500, retries = 1 } = {}) {
    // Cache-bust agresivo
    const bust = Date.now();

    for (let attempt = 0; attempt <= retries; attempt++) {
      for (const base of BASES) {
        const url = `${base}${path}?t=${bust}`;
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), timeout);
          const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
          clearTimeout(to);
          if (res.ok) {
            return await res.json();
          }
        } catch (_) {
          // Intentar siguiente base
        }
      }
      // pequeña espera antes de reintentar toda la ronda
      if (attempt < retries) await sleep(350);
    }
    throw new Error('fetch-failed');
  }

  /* ==============================
     Estado y caches
  ===============================*/

  const memCache = {
    fechas: { data: null, ts: 0 },
    indexByFecha: new Map(),   // fecha -> { data, ts }
    results: new Map()         // key: `${fecha}|${race}` -> { data, ts }
  };

  let currentFecha = null;
  let currentRaceKey = null;
  let autoRefreshTimer = null;

  /* ==============================
     DOM refs
  ===============================*/

  const elFechaSelect   = qs('#fechaSelect');     // <select>
  const elRacesList     = qs('#racesList');       // <ul> o <div>
  const elResults       = qs('#results');         // contenedor del detalle
  const elUpdated       = qs('#lastUpdated');     // span o div para “Actualizado: …”
  const elRaceTitle     = qs('#raceTitle');       // h2/h3 para el nombre de la carrera (opcional)

  // Helpers de UI
  function clearNode(node) { if (node) node.innerHTML = ''; }

  function setUpdatedMeta({ fecha, raceLabel }) {
    if (!elUpdated) return;
    const time = nowStr();
    if (fecha && raceLabel) {
      elUpdated.textContent = `Actualizado: ${time} — ${fecha} — ${raceLabel}`;
    } else if (fecha) {
      elUpdated.textContent = `Actualizado: ${time} — ${fecha}`;
    } else {
      elUpdated.textContent = `Actualizado: ${time}`;
    }
  }

  function showLoading(message = 'Cargando…') {
    if (!elResults) return;
    elResults.innerHTML = `<div class="loading">${message}</div>`;
  }

  function showError(message = 'No se pudo cargar la información.') {
    if (!elResults) return;
    elResults.innerHTML = `<div class="error">${message}</div>`;
  }

  /* ==============================
     Render
  ===============================*/

  function renderRacesList(keys, fecha) {
    if (!elRacesList) return;
    clearNode(elRacesList);

    // Evitar duplicados manteniendo el orden original
    const seen = new Set();
    const uniqueKeys = [];
    for (const k of keys) {
      if (!seen.has(k)) { seen.add(k); uniqueKeys.push(k); }
    }

    uniqueKeys.forEach((key) => {
      const label = RACE_LABELS[key] || key;
      const li = document.createElement('li');
      li.className = 'race-item';
      li.textContent = label;
      li.tabIndex = 0;
      li.setAttribute('data-key', key);
      li.onclick = () => {
        // Limpiar inmediatamente para evitar confusión
        if (elRaceTitle) elRaceTitle.textContent = label;
        showLoading('Cargando…');
        loadResults(fecha, key);
      };
      li.onkeypress = (e) => { if (e.key === 'Enter') li.onclick(); };
      elRacesList.appendChild(li);
    });
  }

  function renderResults(json, { fecha, raceKey }) {
    if (!elResults) return;
    clearNode(elResults);

    const raceLabel = RACE_LABELS[raceKey] || raceKey;
    if (elRaceTitle) elRaceTitle.textContent = raceLabel;

    if (!json || !Array.isArray(json.results) || json.results.length === 0) {
      elResults.innerHTML = `<div class="empty">Sin datos para mostrar.</div>`;
      setUpdatedMeta({ fecha, raceLabel });
      return;
    }

    // Construcción de tabla simple: Pos / Nº / Nombre / Total
    const table = document.createElement('table');
    table.className = 'tabla-resultados';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Pos.</th>
          <th>N°</th>
          <th>Nombre</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = qs('tbody', table);

    json.results.forEach((r) => {
      const tr = document.createElement('tr');
      const total = r.t_final || r.rec_str || (typeof r.rec === 'number' ? String(r.rec) : '');
      tr.innerHTML = `
        <td>${r.position ?? ''}</td>
        <td>${r.number ?? ''}</td>
        <td>${r.name ?? ''}</td>
        <td>${total}</td>
      `;
      tbody.appendChild(tr);
    });

    elResults.appendChild(table);
    setUpdatedMeta({ fecha, raceLabel });
  }

  /* ==============================
     Cargas (fechas, index, results)
  ===============================*/

  async function loadFechas() {
    const now = Date.now();
    if (memCache.fechas.data && (now - memCache.fechas.ts) < CACHE_MS_FECHAS) {
      return memCache.fechas.data;
    }
    const data = await fetchJSONWithFallback(buildPathFechas(), { retries: 1 });
    // data esperado: { fechas: ["Fecha 01","Fecha 02", ...] } o ["Fecha 01", ...]
    const fechas = Array.isArray(data) ? data : (data?.fechas || []);
    memCache.fechas = { data: fechas, ts: now };
    return fechas;
  }

  async function loadIndex(fecha) {
    const now = Date.now();
    const cache = memCache.indexByFecha.get(fecha);
    if (cache && (now - cache.ts) < CACHE_MS_INDEX) return cache.data;

    const data = await fetchJSONWithFallback(buildPathIndex(fecha), { retries: 1 });
    // index.json esperado: { races: ["serie1","serie2",...]} o un array directo
    const races = Array.isArray(data) ? data : (data?.races || data?.keys || []);
    const pack = { races };
    memCache.indexByFecha.set(fecha, { data: pack, ts: now });
    return pack;
  }

  async function loadResults(fecha, raceKey, { force = false } = {}) {
    currentFecha = fecha;
    currentRaceKey = raceKey;

    // limpiar UI de inmediato para que no quede el resultado anterior
    showLoading('Cargando…');

    const cacheKey = `${fecha}|${raceKey}`;
    const now = Date.now();
    const cache = memCache.results.get(cacheKey);
    if (!force && cache && (now - cache.ts) < CACHE_MS_RESULTS) {
      renderResults(cache.data, { fecha, raceKey });
      restartAutoRefresh();
      return;
    }

    try {
      const json = await fetchJSONWithFallback(buildPathRace(fecha, raceKey), { retries: 2 });
      memCache.results.set(cacheKey, { data: json, ts: Date.now() });
      renderResults(json, { fecha, raceKey });
    } catch (err) {
      showError('No se pudo cargar esta carrera. Intentá nuevamente.');
    }
    restartAutoRefresh();
  }

  function restartAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    if (!AUTO_REFRESH_MS || AUTO_REFRESH_MS < 2000) return;
    autoRefreshTimer = setInterval(async () => {
      if (!currentFecha || !currentRaceKey) return;
      try {
        // Forzar solo cuando el cache ya venció; si no, respetar cache
        const cacheKey = `${currentFecha}|${currentRaceKey}`;
        const cache = memCache.results.get(cacheKey);
        const expired = !cache || (Date.now() - cache.ts) >= CACHE_MS_RESULTS;
        await loadResults(currentFecha, currentRaceKey, { force: expired });
      } catch (_) { /* noop */ }
    }, AUTO_REFRESH_MS);
  }

  /* ==============================
     UI wiring
  ===============================*/

  async function init() {
    try {
      const fechas = await loadFechas();

      // Poblar <select> solo con lo que realmente existe
      if (elFechaSelect) {
        clearNode(elFechaSelect);
        fechas.forEach((f) => {
          const opt = document.createElement('option');
          opt.value = f;
          opt.textContent = f;
          elFechaSelect.appendChild(opt);
        });

        // Elegir última fecha (la mayor) por defecto
        const def = fechas.length ? fechas[fechas.length - 1] : null;
        if (def) elFechaSelect.value = def;

        elFechaSelect.onchange = async () => {
          const f = elFechaSelect.value;
          await onFechaSelected(f);
        };
      }

      const initialFecha = elFechaSelect ? elFechaSelect.value : (fechas[fechas.length - 1] || null);
      if (initialFecha) await onFechaSelected(initialFecha);
      setUpdatedMeta({ fecha: initialFecha });
    } catch (err) {
      showError('No se pudieron cargar las fechas. Reintentá más tarde.');
    }
  }

  async function onFechaSelected(fecha) {
    currentFecha = fecha;
    setUpdatedMeta({ fecha });

    // Cargar index de la fecha y pintar lista de carreras existentes
    try {
      const pack = await loadIndex(fecha);
      const keys = pack.races || [];
      renderRacesList(keys, fecha);

      // Si había una carrera previa y sigue existiendo, mantenerla
      if (currentRaceKey && keys.includes(currentRaceKey)) {
        await loadResults(fecha, currentRaceKey);
      } else {
        // O seleccionar la primera disponible
        if (keys.length) {
          await loadResults(fecha, keys[0]);
        } else {
          clearNode(elResults);
          if (elRaceTitle) elRaceTitle.textContent = '';
          elResults.innerHTML = `<div class="empty">Aún no hay carreras cargadas para ${fecha}.</div>`;
        }
      }
    } catch (err) {
      renderRacesList([], fecha);
      showError(`No se pudo cargar el índice de ${fecha}.`);
    }
  }

  // Exponer para compatibilidad con otros scripts que llaman window.loadResults(...)
  window.loadResults = (fecha, key) => loadResults(fecha, key);

  document.addEventListener('DOMContentLoaded', init);
})();
