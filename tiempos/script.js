<script>
(() => {
  // ---------- Config ----------
  const OWNER_REPO_BRANCH = 'jcheva123/tiemposweb-2025@main';
  const RAW_BASE = 'https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main';
  const CDN_BASE = `https://cdn.jsdelivr.net/gh/${OWNER_REPO_BRANCH}`;
  const LS_SELECTED_FECHA = 'tw_selected_fecha';
  const FETCH_TIMEOUT_MS = 12000;

  // ---------- Utiles DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  const elFecha = $('#fecha-select');
  const elRaceList = $('#race-list');
  const elBody = $('#results-body');
  const elUpdated = $('#last-updated');
  const elSkeleton = $('#skeleton'); // opcional: si no está, no pasa nada

  // ---------- Texto de carrera ----------
  const RACE_LABELS = {
    final: 'Final',
    prefinal: 'Prefinal',
    repechaje: 'Repechaje',
    semifinal: 'Semifinal',
    serie: 'Serie'
  };
  const prettyRace = (key) => {
    // key ejemplos: "serie1", "semifinal4", "repechaje2", "prefinal", "final"
    const m = key.match(/^(serie|semifinal|repechaje)(\d+)$/i);
    if (m) {
      const base = m[1].toLowerCase();
      const n = parseInt(m[2], 10);
      return `${RACE_LABELS[base]} ${n}`;
    }
    if (/^prefinal$/i.test(key)) return RACE_LABELS.prefinal;
    if (/^final$/i.test(key)) return RACE_LABELS.final;
    return key;
  };

  // ---------- Network helpers ----------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function fetchWithTimeout(url, opts = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort('timeout'), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...opts,
        signal: controller.signal,
        // cache bust + no-store para ver cambios al toque
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-store' }
      });
      if (!res.ok) throw new Error(String(res.status || 'fetch-failed'));
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchJSON(pathRel) {
    // RAW primero (más fresco), si falla vamos a CDN
    const ts = Date.now();
    const rawURL = `${RAW_BASE}/${pathRel}?ts=${ts}`;
    try {
      return await fetchWithTimeout(rawURL);
    } catch (e) {
      // fallback CDN (algunas veces más permisivo ante 429 de RAW)
      const cdnURL = `${CDN_BASE}/${pathRel}?ts=${ts}`;
      return await fetchWithTimeout(cdnURL);
    }
  }

  // ---------- Estado ----------
  let currentFecha = null;
  let inflight = null; // AbortController para carrera en curso

  function setLoading(isLoading) {
    if (elSkeleton) elSkeleton.hidden = !isLoading;
    if (elBody) elBody.innerHTML = isLoading ? '' : elBody.innerHTML;
  }

  function setUpdated(fecha, raceKey) {
    if (!elUpdated) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const raceTxt = raceKey ? ` – ${fecha} · ${prettyRace(raceKey)}` : '';
    elUpdated.textContent = `Actualizado: ${hh}:${mm}:${ss}${raceTxt}`;
  }

  // ---------- Render ----------
  function renderRaceButtons(keys) {
    if (!elRaceList) return;
    elRaceList.innerHTML = '';
    const frag = document.createDocumentFragment();
    keys.forEach(k => {
      const li = document.createElement('li');
      li.textContent = prettyRace(k);
      li.dataset.race = k;
      li.tabIndex = 0;
      li.className = 'race-item';
      li.onclick = () => loadResults(currentFecha, k);
      li.onkeydown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          li.click();
        }
      };
      frag.appendChild(li);
    });
    elRaceList.appendChild(frag);
  }

  function markActiveRace(raceKey) {
    if (!elRaceList) return;
    elRaceList.querySelectorAll('.race-item').forEach(li => {
      li.classList.toggle('active', li.dataset.race === raceKey);
    });
  }

  function renderResults(json) {
    if (!elBody) return;
    elBody.innerHTML = '';
    if (!json || !Array.isArray(json.results)) {
      return;
    }
    const frag = document.createDocumentFragment();
    json.results.forEach(r => {
      const tr = document.createElement('tr');

      // Columnas: Pos. | N° | Nombre | Total
      const tdPos = document.createElement('td');
      tdPos.textContent = r.position ?? '';
      const tdNum = document.createElement('td');
      tdNum.textContent = r.number ?? '';
      const tdName = document.createElement('td');
      tdName.textContent = r.name ?? '';
      const tdTotal = document.createElement('td');
      tdTotal.textContent = (r.t_final ?? r.total ?? '').toString();

      tr.appendChild(tdPos);
      tr.appendChild(tdNum);
      tr.appendChild(tdName);
      tr.appendChild(tdTotal);

      frag.appendChild(tr);
    });
    elBody.appendChild(frag);
  }

  // ---------- Carga de datos ----------
  function naturalRaceSort(a, b) {
    const toKey = (x) => {
      const m = x.match(/^(serie|semifinal|repechaje)(\d+)$/i);
      if (m) return { kind: m[1].toLowerCase(), n: parseInt(m[2], 10) };
      if (/^prefinal$/i.test(x)) return { kind: 'prefinal', n: 0 };
      if (/^final$/i.test(x)) return { kind: 'final', n: 0 };
      return { kind: 'zzz', n: 9999 };
    };
    const ka = toKey(a), kb = toKey(b);
    const order = ['serie', 'repechaje', 'semifinal', 'prefinal', 'final', 'zzz'];
    if (ka.kind !== kb.kind) return order.indexOf(ka.kind) - order.indexOf(kb.kind);
    return ka.n - kb.n;
  }

  async function loadFechas() {
    // Solo lo que exista en resultados/fechas.json
    try {
      const data = await fetchJSON('resultados/fechas.json');
      const fechas = Array.isArray(data) ? data : [];
      if (!elFecha) return;
      elFecha.innerHTML = '';
      fechas.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        elFecha.appendChild(opt);
      });

      // Selección persistida o primera
      const saved = localStorage.getItem(LS_SELECTED_FECHA);
      const toSelect = fechas.includes(saved) ? saved : (fechas[0] || null);
      if (toSelect) {
        elFecha.value = toSelect;
        currentFecha = toSelect;
        await loadIndex(currentFecha);
      } else {
        // Sin fechas -> limpiar UI
        if (elRaceList) elRaceList.innerHTML = '';
        if (elBody) elBody.innerHTML = '';
        setUpdated('', '');
      }
    } catch {
      // Si falla, UI vacía sin romper
      if (elFecha) elFecha.innerHTML = '';
      if (elRaceList) elRaceList.innerHTML = '';
      if (elBody) elBody.innerHTML = '';
      setUpdated('', '');
    }
  }

  async function loadIndex(fecha) {
    if (!fecha) return;
    setUpdated(fecha, '');
    // index.json puede venir como {races: ["serie1", ...]} o ["serie1", ...]
    const idx = await fetchJSON(`resultados/${encodeURIComponent(fecha)}/index.json`);
    let races = [];
    if (Array.isArray(idx)) races = idx;
    else if (idx && Array.isArray(idx.races)) races = idx.races;
    races = [...new Set(races)].sort(naturalRaceSort);
    renderRaceButtons(races);
    // Si hay alguna, cargar la primera para evitar “pantalla vieja”
    if (races.length) {
      loadResults(fecha, races[0]);
    } else {
      if (elBody) elBody.innerHTML = '';
    }
  }

  async function loadResults(fecha, raceKey) {
    if (!fecha || !raceKey) return;

    // Cancelar una carga anterior si estaba en curso
    if (inflight) {
      try { inflight.abort(); } catch {}
      inflight = null;
    }
    // AbortController por si quisiéramos abortar luego (aquí fetch ya usa timeout, igualmente protegemos)
    inflight = new AbortController();

    // Reset UI antes de pedir datos (evita ver la carrera anterior)
    setLoading(true);
    markActiveRace(raceKey);
    setUpdated(fecha, raceKey);

    try {
      const path = `resultados/${encodeURIComponent(fecha)}/${raceKey.toLowerCase()}.json`;
      const data = await fetchJSON(path);
      renderResults(data);
    } catch {
      // Si falló la carga de la carrera, vaciamos tabla para no mostrar anterior
      if (elBody) elBody.innerHTML = '';
    } finally {
      setLoading(false);
      inflight = null;
    }
  }

  // ---------- Eventos ----------
  on(document, 'DOMContentLoaded', () => {
    // Evitamos dobles bindings si el script se incluye dos veces accidentalmente
    if (window.__tw_booted__) return;
    window.__tw_booted__ = true;

    on(elFecha, 'change', async (e) => {
      const val = e.target.value;
      localStorage.setItem(LS_SELECTED_FECHA, val);
      currentFecha = val;
      await loadIndex(currentFecha);
    });

    loadFechas(); // arranque
  });
})();
</script>
