/* script.js — RAW-first para detectar borrados, cache v3, carga limpia + “Actualizado” */
(() => {
  if (window.__APP_LOADED__) return;
  window.__APP_LOADED__ = true;

  // ===== Config =====
  const BASES = [
    (p, q) => `https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main/${p}${q || ""}`,
    (p, q) => `https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main/${p}${q || ""}`,
    (p, q) => `https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/${p}${q || ""}`,
  ];
  const PATH_FECHAS = "resultados/fechas.json";
  const PATH_INDEX  = (fecha) => `resultados/${encodeURIComponent(fecha)}/index.json`;
  const PATH_JSON   = (fecha, race) => `resultados/${encodeURIComponent(fecha)}/${race}.json`;

  const CACHE_MS_RESULTS = 60_000; // 60s cache suave por carrera
  const CACHE_VER = "v3";          // ← subir versión para forzar limpieza de cache local

  // ===== Utils =====
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

  function fetchWithTimeout(url, opts = {}, ms = 9000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal, cache: "no-store" }).finally(() => clearTimeout(t));
  }

  // fresh: agrega ?ts para intentar saltar caché; rawPrefer: intenta RAW primero
  async function fetchJSONFallback(path, { fresh = false, rawPrefer = false, retries = 2 } = {}) {
    const makeQuery = fresh ? `?ts=${Date.now()}` : "";
    const bases = rawPrefer ? [BASES[2], BASES[0], BASES[1]] : BASES;
    let delay = 500;

    for (let attempt = 0; attempt <= retries; attempt++) {
      for (const mk of bases) {
        const url = mk(path, makeQuery);
        try {
          const res = await fetchWithTimeout(url);
          if (res.ok) return await res.json();
          if (res.status === 404) { const e = new Error("not-found"); e.code = 404; throw e; }
        } catch (err) {
          if (err?.code === 404) throw err;
        }
      }
      await sleep(delay + Math.random() * 300);
      delay *= 2;
    }
    throw new Error("fetch-failed");
  }

  function prettyRaceName(r) {
    return r.replace(/^serie(\d+)$/,"Serie $1")
            .replace(/^repechaje(\d+)$/,"Repechaje $1")
            .replace(/^semifinal(\d+)$/,"Semifinal $1")
            .replace("prefinal","Prefinal").replace("final","Final");
  }

  // ===== Estado de carga (limpia tabla y muestra skeleton inmediatamente) =====
  function beginLoading(fecha, race) {
    const tbody = $("table tbody");
    if (tbody) tbody.innerHTML = "";      // no mostrar datos viejos
    const skl = $("#skeleton");
    if (skl) skl.hidden = false;          // skeleton visible
    const last = $("#last-updated");
    if (last) {
      last.hidden = false;
      last.textContent = race
        ? `Cargando… • ${fecha} · ${prettyRaceName(race)}`
        : "Cargando…";
    }
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
    el.textContent = race
      ? `Actualizado: ${when} • ${fecha} · ${prettyRaceName(race)}`
      : `Actualizado: ${when} • ${fecha}`;
  }

  // ===== Fechas (RAW primero para reflejar borrados al instante) =====
  async function loadFechas() {
    const sel = $("#fecha-select");
    if (!sel) return;
    sel.innerHTML = `<option value="">-- Elegir Fecha --</option>`;

    let fechas = [];
    // RAW con cache-bust
    try {
      const fresh = await fetchJSONFallback(PATH_FECHAS, { fresh: true, rawPrefer: true, retries: 1 });
      fechas = Array.isArray(fresh?.fechas) ? fresh.fechas : [];
    } catch {
      // fallback CDN
      try {
        const data = await fetchJSONFallback(PATH_FECHAS, { fresh: false, rawPrefer: false });
        fechas = Array.isArray(data?.fechas) ? data.fechas : [];
      } catch {}
    }

    if (!fechas.length) {
      window.showToast?.("Aún no hay Fechas publicadas.");
      return;
    }

    fechas.sort((a,b)=>{
      const na = parseInt((a.match(/\d+/)||[])[0]||0,10);
      const nb = parseInt((b.match(/\d+/)||[])[0]||0,10);
      return na - nb;
    });

    for (const f of fechas) {
      const opt = document.createElement("option");
      opt.value = f; opt.textContent = f;
      sel.appendChild(opt);
    }

    const saved = localStorage.getItem("selectedFecha");
    if (saved && fechas.includes(saved)) sel.value = saved;
    else if (fechas.length) sel.value = fechas[fechas.length - 1];

    if (sel.value) await loadRaces();
  }

  // ===== Carreras de la fecha (si RAW 404 ⇒ ocultar todo) =====
  async function loadRaces() {
    const fecha = $("#fecha-select")?.value || "";
    const ul = $("#race-list ul");
    const tbody = $("table tbody");
    if (!fecha || !ul || !tbody) return;

    ul.innerHTML = "";
    tbody.innerHTML = "";
    localStorage.setItem("selectedFecha", fecha);

    let races = [];

    // RAW con cache-bust para detectar eliminaciones al toque
    try {
      const fresh = await fetchJSONFallback(PATH_INDEX(fecha), { fresh: true, rawPrefer: true, retries: 1 });
      races = Array.isArray(fresh?.races) ? fresh.races : [];
    } catch (e) {
      if (e?.code === 404) {
        // Índice inexistente en RAW ⇒ fecha borrada
        window.showToast?.(`No hay índice de carreras para ${fecha}.`);
        return;
      }
      // fallback CDN si RAW falló por otra razón
      try {
        const data = await fetchJSONFallback(PATH_INDEX(fecha), { fresh: false, rawPrefer: false });
        races = Array.isArray(data?.races) ? data.races : [];
      } catch {
        races = [];
      }
    }

    if (!races.length) return;

    for (const race of races) {
      const li = document.createElement("li");
      li.textContent = prettyRaceName(race);
      li.onclick = () => loadResults(fecha, race);
      ul.appendChild(li);
    }
  }

  // ===== Resultados por carrera (cache local + revalidación RAW) =====
  const inflight = new Map();
  const keyOf = (f, r) => `${CACHE_VER}:${f}_${r}`;

  async function loadResults(fecha, race) {
    const tbody = $("table tbody");
    if (!tbody) return;

    beginLoading(fecha, race);

    const cacheKey = keyOf(fecha, race);
    const now = Date.now();

    // Mostrar cache inmediato si está fresco
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

    // Evitar dobles llamadas simultáneas
    if (inflight.has(cacheKey)) {
      await inflight.get(cacheKey);
      endLoading();
      highlightSelectedLI(race);
      return;
    }

    const p = (async () => {
      let cdnData = null;

      // 1) CDN “rápido”
      try {
        cdnData = await fetchJSONFallback(PATH_JSON(fecha, race), { fresh: false, rawPrefer: false });
        const prev = cached ? JSON.parse(cached).data : null;
        if (!prev || JSON.stringify(prev) !== JSON.stringify(cdnData)) {
          renderResults(cdnData, tbody);
          setUpdated(fecha, race, cdnData);
        }
        localStorage.setItem(cacheKey, JSON.stringify({ data: cdnData, timestamp: now }));
      } catch (err) {
        if (!cached) window.showToast?.("No se pudieron cargar los resultados (CDN).");
      }

      // 2) Revalidación RAW con cache-bust (detecta updates al instante)
      try {
        const fresh = await fetchJSONFallback(PATH_JSON(fecha, race), { fresh: true, rawPrefer: true, retries: 1 });
        if (!cdnData || JSON.stringify(fresh) !== JSON.stringify(cdnData)) {
          renderResults(fresh, tbody);
          setUpdated(fecha, race, fresh);
          localStorage.setItem(cacheKey, JSON.stringify({ data: fresh, timestamp: Date.now() }));
          window.showToast?.("Datos nuevos disponibles");
        }
      } catch (err) {
        // Si RAW devuelve 404, deshabilitamos ese botón (todavía listado por CDN)
        if (err?.code === 404) {
          disableRaceLI(race);
          if (!cached) {
            tbody.innerHTML = "";
            window.showToast?.(`${prettyRaceName(race)} aún no está publicada en ${fecha}.`);
          }
        }
      }
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
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.position ?? ""}</td>
        <td>${r.number ?? ""}</td>
        <td>${r.name ?? ""}</td>
        <td>${r.rec ?? ""}</td>
        <td>${r.t_final || "N/A"}</td>
        <td>${r.laps || "N/A"}</td>
        <td class="${r.penalty ? "penalty" : ""}">${r.penalty ?? "N/A"}</td>
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
    if (li) { li.style.opacity = ".5"; li.style.pointerEvents = "none"; li.title = "No disponible"; }
  }

  // ===== Inicio =====
  document.addEventListener("DOMContentLoaded", loadFechas);

  // Botón "Actualizar Datos" del header (si existe): limpia cache v3 y recarga
  document.getElementById("update-btn")?.addEventListener("click", () => {
    Object.keys(localStorage).forEach(k => { if (k.startsWith(`${CACHE_VER}:`)) localStorage.removeItem(k); });
    const fecha = $("#fecha-select")?.value || "";
    if (fecha) localStorage.setItem("selectedFecha", fecha);
    location.reload();
  });

  // Exponer para enhancements.js (si lo necesita)
  window.loadRaces   = loadRaces;
  window.loadResults = loadResults;
})();
