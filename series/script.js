/* script.js (carga limpia + "Actualizado" completo + revalidación contra RAW) */
(() => {
  if (window.__APP_LOADED__) return;
  window.__APP_LOADED__ = true;

  // ===== Config =====
  const BASES = [
    (p, q) => `https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main/${p}${q||""}`,
    (p, q) => `https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main/${p}${q||""}`,
    (p, q) => `https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/${p}${q||""}`,
  ];
  const RAW_ONLY = (p, q) => `https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/${p}${q||""}`;

  const PATH_FECHAS = "resultados/fechas.json";
  const PATH_INDEX  = (fecha) => `resultados/${encodeURIComponent(fecha)}/index.json`;
  const PATH_JSON   = (fecha, race) => `resultados/${encodeURIComponent(fecha)}/${race}.json`;

  const CACHE_MS_RESULTS = 60_000; // cache suave 60s por carrera
  const CACHE_VER = "v2";          // cambia para invalidar localStorage viejo

  // ===== Utils =====
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

  function fetchWithTimeout(url, opts = {}, ms = 9000) {
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' }).finally(()=>clearTimeout(t));
  }

  async function fetchJSONFallback(path, {fresh=false, rawPrefer=false, retries=2} = {}) {
    // fresh: agrega ?ts para intentar saltar caché; rawPrefer: intenta RAW primero
    const makeQuery = fresh ? `?ts=${Date.now()}` : "";
    const bases = rawPrefer ? [BASES[2], BASES[0], BASES[1]] : BASES;
    let delay = 500;

    for (let attempt = 0; attempt <= retries; attempt++) {
      for (const mk of bases) {
        const url = mk(path, makeQuery);
        try {
          const res = await fetchWithTimeout(url);
          if (res.ok) return await res.json();
          if (res.status === 404) { const e=new Error('not-found'); e.code=404; throw e; }
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

  // ===== Estado de carga: limpia tabla y muestra "Cargando…" =====
  function beginLoading(fecha, race) {
    const tbody = $("table tbody");
    if (tbody) tbody.innerHTML = "";
    const last = $("#last-updated");
    if (last) {
      last.hidden = false;
      last.textContent = `Cargando… • ${fecha} · ${prettyRaceName(race)}`;
    }
    const skl = $("#skeleton");
    if (skl) skl.hidden = false;
  }
  function endLoading() {
    const skl = $("#skeleton");
    if (skl) skl.hidden = true;
  }

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

  // ===== Fechas desde manifiesto =====
  async function loadFechas() {
    const sel = $("#fecha-select");
    if (!sel) return;
    sel.innerHTML = `<option value="">-- Elegir Fecha --</option>`;
    try {
      // 1) CDN rápido
      let data = await fetchJSONFallback(PATH_FECHAS, {fresh:false, rawPrefer:false});
      let fechas = Array.isArray(data?.fechas) ? data.fechas : [];

      // 2) Revalidación RAW (si trae más/otras fechas, actualiza)
      try {
        const fresh = await fetchJSONFallback(PATH_FECHAS, {fresh:true, rawPrefer:true, retries:1});
        const fres = Array.isArray(fresh?.fechas) ? fresh.fechas : [];
        if (fres.length !== fechas.length || JSON.stringify(fres) !== JSON.stringify(fechas)) {
          fechas = fres;
          window.showToast?.("Fecha actualizada");
        }
      } catch {}

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

  // ===== Carreras de la fecha =====
  async function loadRaces() {
    const fecha = $("#fecha-select")?.value || "";
    const ul = $("#race-list ul");
    const tbody = $("table tbody");
    if (!fecha || !ul || !tbody) return;
    ul.innerHTML = ""; tbody.innerHTML = "";
    localStorage.setItem("selectedFecha", fecha);

    let races = [];
    try {
      // 1) CDN
      const data = await fetchJSONFallback(PATH_INDEX(fecha), {fresh:false, rawPrefer:false});
      races = Array.isArray(data?.races) ? data.races : [];
    } catch (e) {
      if (e?.code === 404) window.showToast?.(`No hay índice de carreras para ${fecha}.`);
      else window.showToast?.("Problema de red al cargar carreras (CDN).");
    }

    // 2) Revalidar RAW con cache-bust (puede traer la nueva carrera recién subida)
    try {
      const fresh = await fetchJSONFallback(PATH_INDEX(fecha), {fresh:true, rawPrefer:true, retries:1});
      const fr = Array.isArray(fresh?.races) ? fresh.races : [];
      if (JSON.stringify(fr) !== JSON.stringify(races)) {
        races = fr;
        window.showToast?.(`Carreras actualizadas en ${fecha}`);
      }
    } catch {}

    if (!races.length) { window.showToast?.(`No hay carreras publicadas aún en ${fecha}.`); return; }

    for (const race of races) {
      const li = document.createElement("li");
      li.textContent = prettyRaceName(race);
      li.onclick = () => loadResults(fecha, race);
      ul.appendChild(li);
    }
  }

  // ===== Resultados por carrera (con cache local y revalidación RAW) =====
  const inflight = new Map();
  const keyOf = (f,r) => `${CACHE_VER}:${f}_${r}`;

  async function loadResults(fecha, race) {
    const tbody = $("table tbody");
    if (!tbody) return;

    beginLoading(fecha, race);

    const cacheKey = keyOf(fecha, race);
    const now = Date.now();

    // 1) Mostrar cache instantáneo (si no venció), para que el usuario vea algo YA
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (now - parsed.timestamp <= CACHE_MS_RESULTS) {
          renderResults(parsed.data, tbody);
          setUpdated(fecha, race, parsed.data);
        } else {
          localStorage.removeItem(cacheKey);
        }
      } catch { localStorage.removeItem(cacheKey); }
    }

    // 2) Evitar múltiples llamadas simultáneas a la misma carrera
    if (inflight.has(cacheKey)) {
      await inflight.get(cacheKey);
      endLoading();
      highlightSelectedLI(race);
      return;
    }

    // 3) Traer del CDN y actualizar pantalla (si no había cache fresco)
    const p = (async () => {
      let cdnData = null;
      try {
        cdnData = await fetchJSONFallback(PATH_JSON(fecha, race), {fresh:false, rawPrefer:false});
        // Si no había cache fresco o cambió, renderizo
        const prev = cached ? JSON.parse(cached).data : null;
        if (!prev || JSON.stringify(prev) !== JSON.stringify(cdnData)) {
          renderResults(cdnData, tbody);
          setUpdated(fecha, race, cdnData);
        }
        localStorage.setItem(cacheKey, JSON.stringify({ data: cdnData, timestamp: now }));
      } catch (err) {
        if (!cached) window.showToast?.('No se pudieron cargar los resultados (CDN).');
      }

      // 4) Revalidar RAW con ?ts=... (si trae datos distintos/más nuevos, re-render)
      try {
        const fresh = await fetchJSONFallback(PATH_JSON(fecha, race), {fresh:true, rawPrefer:true, retries:1});
        if (!cdnData || JSON.stringify(fresh) !== JSON.stringify(cdnData)) {
          renderResults(fresh, tbody);
          setUpdated(fecha, race, fresh);
          localStorage.setItem(cacheKey, JSON.stringify({ data: fresh, timestamp: Date.now() }));
          window.showToast?.('Datos nuevos disponibles');
        }
      } catch {}
    })();

    inflight.set(cacheKey, p);
    await p;
    inflight.delete(cacheKey);
    endLoading();
    highlightSelectedLI(race);
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

  // ===== Inicio =====
  document.addEventListener("DOMContentLoaded", loadFechas);

  // Botón actualizar duro: borra cache y reconsulta
  document.getElementById("update-btn")?.addEventListener("click", () => {
    const fecha = $("#fecha-select")?.value || "";
    Object.keys(localStorage).forEach(k => { if (k.startsWith(`${CACHE_VER}:`)) localStorage.removeItem(k); });
    if (fecha) localStorage.setItem("selectedFecha", fecha);
    location.reload();
  });

  // Exponer si enhancements.js envuelve loadResults
  window.loadRaces   = loadRaces;
  window.loadResults = loadResults;
})();
