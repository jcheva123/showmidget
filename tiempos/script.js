/* script.js (sin datos viejos + “Actualizado: fecha, hora, Fecha · Carrera”) */
(() => {
  if (window.__APP_LOADED__) return;
  window.__APP_LOADED__ = true;

  // ===== Config =====
  const BASES = [
    (p) => `https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main/${p}`,
    (p) => `https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main/${p}`,
    (p) => `https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/${p}`,
  ];
  const PATH_FECHAS = "resultados/fechas.json";
  const PATH_INDEX  = (fecha) => `resultados/${encodeURIComponent(fecha)}/index.json`;
  const PATH_JSON   = (fecha, race) => `resultados/${encodeURIComponent(fecha)}/${race}.json`;
  const CACHE_MS_RESULTS = 60_000; // 60s

  // ===== Utils =====
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

  function fetchWithTimeout(url, opts = {}, ms = 9000) {
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' }).finally(()=>clearTimeout(t));
  }

  async function fetchJSONFallback(path, retries = 2) {
    let delay = 600;
    for (let attempt = 0; attempt <= retries; attempt++) {
      for (const mk of BASES) {
        const url = mk(path);
        try {
          const res = await fetchWithTimeout(url);
          if (res.ok) return await res.json();
          if (res.status === 404) { const e = new Error('not-found'); e.code = 404; throw e; }
        } catch (err) {
          if (err?.code === 404) throw err;
        }
      }
      await sleep(delay + Math.random()*300);
      delay *= 2;
    }
    throw new Error('fetch-failed');
  }

  function prettyRaceName(r) {
    return r.replace(/^serie(\d+)$/,'Serie $1')
            .replace(/^repechaje(\d+)$/,'Repechaje $1')
            .replace(/^semifinal(\d+)$/,'Semifinal $1')
            .replace('prefinal','Prefinal').replace('final','Final');
  }

  // ===== Estado de carga (limpia tabla y muestra skeleton inmediatamente) =====
  let isLoading = false;
  function beginLoading(fecha, race) {
    isLoading = true;
    const tbody = $("table tbody");
    const skl = $("#skeleton");
    if (tbody) tbody.innerHTML = "";          // ← sin datos viejos
    if (skl) skl.hidden = false;              // ← muestra skeleton
    const last = $("#last-updated");
    if (last) {
      last.hidden = false;
      last.textContent = `Cargando… • ${fecha} · ${prettyRaceName(race)}`;
    }
    // (opcional) bloquear clicks mientras carga para evitar spam:
    // $("#race-list")?.classList.add("busy");
  }
  function endLoading() {
    isLoading = false;
    const skl = $("#skeleton");
    if (skl) skl.hidden = true;
    // $("#race-list")?.classList.remove("busy");
  }

  // ===== Fechas desde manifiesto =====
  async function loadFechas() {
    const sel = $("#fecha-select");
    if (!sel) return;
    sel.innerHTML = `<option value="">-- Elegir Fecha --</option>`;
    try {
      const data = await fetchJSONFallback(PATH_FECHAS);
      const fechas = Array.isArray(data?.fechas) ? data.fechas : [];
      fechas.sort((a,b)=>{
        const na = parseInt((a.match(/\d+/)||[])[0]||0,10);
        const nb = parseInt((b.match(/\d+/)||[])[0]||0,10);
        return na - nb;
      });
      for (const f of fechas) {
        const opt = document.createElement('option'); opt.value=f; opt.textContent=f; sel.appendChild(opt);
      }
      const saved = localStorage.getItem("selectedFecha");
      if (saved && fechas.includes(saved)) sel.value = saved;
      else if (fechas.length) sel.value = fechas[fechas.length-1];
      if (sel.value) await loadRaces();
    } catch (e) {
      console.warn("No se pudo leer fechas.json", e);
      window.showToast?.("Aún no hay Fechas publicadas.");
    }
  }

  // ===== Carreras de la fecha (index.json) =====
  async function loadRaces() {
    const fecha = $("#fecha-select")?.value || "";
    const ul = $("#race-list ul");
    const tbody = $("table tbody");
    if (!fecha || !ul || !tbody) return;
    ul.innerHTML = ""; tbody.innerHTML = "";
    localStorage.setItem("selectedFecha", fecha);
    try {
      const data = await fetchJSONFallback(PATH_INDEX(fecha));
      const races = Array.isArray(data?.races) ? data.races : [];
      if (!races.length) { window.showToast?.(`No hay carreras publicadas aún en ${fecha}.`); return; }
      for (const race of races) {
        const li = document.createElement("li");
        li.textContent = prettyRaceName(race);
        li.onclick = () => loadResults(fecha, race);
        ul.appendChild(li);
      }
    } catch (e) {
      if (e?.code === 404) window.showToast?.(`No hay índice de carreras para ${fecha}.`);
      else { console.error("Error index.json:", e); window.showToast?.("Problema de red al cargar carreras."); }
    }
  }

  // ===== Resultados (1 request por toque) con cache y “Actualizado:” =====
  const inflight = new Map();

  function setUpdated(fecha, race, data) {
    const el = $("#last-updated");
    if (!el) return;
    const stamp = data?.generated_at || null;
    let when;
    if (stamp) {
      const dt = new Date(stamp);
      when = `${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}`;
    } else {
      const dt = new Date();
      when = `${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}`;
    }
    el.hidden = false;
    el.textContent = `Actualizado: ${when} • ${fecha} · ${prettyRaceName(race)}`;
  }

  async function loadResults(fecha, race) {
    const tbody = $("table tbody");
    if (!tbody) return;

    beginLoading(fecha, race);

    const cacheKey = `${fecha}_${race}`;
    const now = Date.now();

    // cache
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (now - parsed.timestamp <= CACHE_MS_RESULTS) {
        renderResults(parsed.data, tbody);
        setUpdated(fecha, race, parsed.data);
        endLoading();
        highlightSelectedLI(race);
        return;
      }
    }

    // evitar dobles llamadas para el mismo recurso
    if (inflight.has(cacheKey)) {
      await inflight.get(cacheKey);
      const again = localStorage.getItem(cacheKey);
      if (again) {
        const parsed = JSON.parse(again);
        renderResults(parsed.data, tbody);
        setUpdated(fecha, race, parsed.data);
      }
      endLoading();
      highlightSelectedLI(race);
      return;
    }

    const p = (async () => {
      try {
        const data = await fetchJSONFallback(PATH_JSON(fecha, race));
        localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: now }));
        renderResults(data, tbody);
        setUpdated(fecha, race, data);
      } catch (err) {
        if (err?.code === 404) {
          disableRaceLI(race);
          window.showToast?.(`Aún no está publicado ${prettyRaceName(race)} en ${fecha}.`);
        } else {
          console.error('Error loading results:', err);
          if (cached) {
            const parsed = JSON.parse(cached);
            renderResults(parsed.data, tbody);
            setUpdated(fecha, race, parsed.data);
            window.showToast?.('Mostrando datos en caché por problemas de red.');
          } else {
            window.showToast?.('No se pudieron cargar los resultados.');
          }
        }
      } finally {
        inflight.delete(cacheKey);
        endLoading();
        highlightSelectedLI(race);
      }
    })();

    inflight.set(cacheKey, p);
    await p;
  }

  function renderResults(data, tbody) {
    tbody.innerHTML = "";
    for (const r of (data?.results || [])) {
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
    if (li) { li.style.opacity='.5'; li.style.pointerEvents='none'; li.title='No disponible'; }
  }

  // ===== Inicio =====
  document.addEventListener("DOMContentLoaded", loadFechas);

  // Botón actualizar
  document.getElementById("update-btn")?.addEventListener("click", () => {
    const fecha = $("#fecha-select")?.value || "";
    localStorage.clear();
    if (fecha) localStorage.setItem("selectedFecha", fecha);
    location.reload();
  });

  // Exponer funciones si otro script las llama
  window.loadRaces   = loadRaces;
  window.loadResults = loadResults;
})();
