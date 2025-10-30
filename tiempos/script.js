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
  const elRaceListUL = document.querySelector('#race-list ul');
  const elBody = $('#results-body');
  const elUpdated = $('#last-updated');
  const elSkeleton = $('#skeleton');

  // ---------- Texto de carrera ----------
  const RACE_LABELS = { final: 'Final', prefinal: 'Prefinal', repechaje: 'Repechaje', semifinal: 'Semifinal', serie: 'Serie' };
  const prettyRace = (key) => {
    const m = key.match(/^(serie|semifinal|repechaje)(\d+)$/i);
    if (m) return `${RACE_LABELS[m[1].toLowerCase()]} ${parseInt(m[2],10)}`;
    if (/^prefinal$/i.test(key)) return RACE_LABELS.prefinal;
    if (/^final$/i.test(key)) return RACE_LABELS.final;
    return key;
  };

  // ---------- Network ----------
  async function fetchWithTimeout(url, opts = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort('timeout'), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal, cache: 'no-store', headers: { 'Cache-Control': 'no-store' } });
      if (!res.ok) throw new Error(String(res.status || 'fetch-failed'));
      return await res.json();
    } finally { clearTimeout(t); }
  }
  async function fetchJSON(pathRel) {
    const ts = Date.now();
    try { return await fetchWithTimeout(`${RAW_BASE}/${pathRel}?ts=${ts}`); }
    catch { return await fetchWithTimeout(`${CDN_BASE}/${pathRel}?ts=${ts}`); }
  }

  // ---------- Estado ----------
  let currentFecha = null;
  let inflight = null;

  function setLoading(isLoading) {
    if (elSkeleton) elSkeleton.hidden = !isLoading;
    if (isLoading && elBody) elBody.innerHTML = '';
  }

  function setUpdated(fecha, raceKey) {
    if (!elUpdated) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const raceTxt = raceKey ? ` – ${fecha} · ${prettyRace(raceKey)}` : '';
    elUpdated.hidden = false;
    elUpdated.textContent = `Actualizado: ${hh}:${mm}:${ss}${raceTxt}`;
  }

  // ---------- Render ----------
  function renderRaceButtons(keys) {
    if (!elRaceListUL) return;
    elRaceListUL.innerHTML = '';
    const frag = document.createDocumentFragment();
    keys.forEach(k => {
      const li = document.createElement('li');
      li.textContent = prettyRace(k);
      li.dataset.race = k;
      li.tabIndex = 0;
      li.className = 'race-item';
      li.onclick = () => loadResults(currentFecha, k);
      li.onkeydown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); li.click(); }
      };
      frag.appendChild(li);
    });
    elRaceListUL.appendChild(frag);
  }
  function markActiveRace(raceKey) {
    if (!elRaceListUL) return;
    elRaceListUL.querySelectorAll('.race-item').forEach(li => {
      li.classList.toggle('active', li.dataset.race === raceKey);
    });
  }
  function renderResults(json) {
    if (!elBody) return;
    elBody.innerHTML = '';
    if (!json || !Array.isArray(json.results)) return;

    const frag = document.createDocumentFragment();
    json.results.forEach(r => {
      const tr = document.createElement('tr');
      const tdPos = document.createElement('td');   tdPos.textContent = r.position ?? '';
      const tdNum = document.createElement('td');   tdNum.textContent = r.number ?? '';
      const tdName = document.createElement('td');  tdName.textContent = r.name ?? '';
      const tdTotal = document.createElement('td'); tdTotal.textContent = (r.t_final ?? r.total ?? '').toString();
      tr.append(tdPos, tdNum, tdName, tdTotal);
      frag.appendChild(tr);
    });
    elBody.appendChild(frag);
  }

  // ---------- Carga de datos ----------
  function naturalRaceSort(a, b) {
    const toKey = (x) => {
      const m = x.match(/^(serie|semifinal|repechaje)(\d+)$/i);
      if (m) return { kind: m[1].toLowerCase(), n: parseInt(m[2],10) };
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

      const saved = localStorage.getItem(LS_SELECTED_FECHA);
      const toSelect = fechas.includes(saved) ? saved : (fechas[0] || null);
      if (toSelect) {
        elFecha.value = toSelect;
        currentFecha = toSelect;
        await loadIndex(currentFecha);
      } else {
        if (elRaceListUL) elRaceListUL.innerHTML = '';
        if (elBody) elBody.innerHTML = '';
        setUpdated('', '');
      }
    } catch {
      if (elFecha) elFecha.innerHTML = '';
      if (elRaceListUL) elRaceListUL.innerHTML = '';
      if (elBody) elBody.innerHTML = '';
      setUpdated('', '');
    }
  }

  async function loadIndex(fecha) {
    if (!fecha) return;
    setUpdated(fecha, '');
    const idx = await fetchJSON(`resultados/${encodeURIComponent(fecha)}/index.json`);
    let races = [];
    if (Array.isArray(idx)) races = idx;
    else if (idx && Array.isArray(idx.races)) races = idx.races;
    races = [...new Set(races)].sort(naturalRaceSort);
    renderRaceButtons(races);
    if (races.length) loadResults(fecha, races[0]);
    else if (elBody) elBody.innerHTML = '';
  }

  async function loadResults(fecha, raceKey) {
    if (!fecha || !raceKey) return;

    if (inflight) { try { inflight.abort(); } catch {} inflight = null; }
    inflight = new AbortController();

    setLoading(true);
    markActiveRace(raceKey);
    setUpdated(fecha, raceKey);

    try {
      const path = `resultados/${encodeURIComponent(fecha)}/${raceKey.toLowerCase()}.json`;
      const data = await fetchJSON(path);
      renderResults(data);
    } catch {
      if (elBody) elBody.innerHTML = '';
    } finally {
      setLoading(false);
      inflight = null;
    }
  }

  // ---------- Eventos ----------
  on(document, 'DOMContentLoaded', () => {
    if (window.__tw_booted__) return;
    window.__tw_booted__ = true;

    on(elFecha, 'change', async (e) => {
      const val = e.target.value;
      localStorage.setItem(LS_SELECTED_FECHA, val);
      currentFecha = val;
      await loadIndex(currentFecha);
    });

    // Botón “Actualizar Datos” opcional
    const updateBtn = $('#update-btn');
    on(updateBtn, 'click', async () => {
      if (!currentFecha) return;
      await loadIndex(currentFecha);
    });

    loadFechas();
  });
})();
