/* /series/series.js */
(() => {
  if (window.__SERIES_LOADED__) return;
  window.__SERIES_LOADED__ = true;

  // === Config ===
  const BASES = [
    (p,q) => `https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main/${p}${q||""}`,
    (p,q) => `https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main/${p}${q||""}`,
    (p,q) => `https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/${p}${q||""}`,
  ];
  // Intenta varias ubicaciones posibles para tu TXT (podés dejar solo la primera si fijás el path)
  const TXT_CANDIDATES = [
    "series/orden.txt",
    "resultados/series/orden.txt",
    "series/orden%20de%20partida%20series.txt",
    "resultados/series/orden%20de%20partida%20series.txt",
  ];

  const CACHE_VER = "series.v1";
  const SERIES_MAX = 13;
  const PLAYOFF_NUMBERS = new Set([]); // ← luego llenamos con los ~15 números que clasifican (fecha 13+)

  // === Utils ===
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

  function fetchWithTimeout(url, opts = {}, ms = 9000) {
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' }).finally(()=>clearTimeout(t));
  }
  async function fetchTextFallback(path, {fresh=false, rawPrefer=false, retries=2} = {}) {
    const q = fresh ? `?ts=${Date.now()}` : "";
    const bases = rawPrefer ? [BASES[2], BASES[0], BASES[1]] : BASES;
    let delay=400;
    for (let a=0;a<=retries;a++) {
      for (const mk of bases) {
        try {
          const res = await fetchWithTimeout(mk(path, q));
          if (res.ok) return await res.text();
          if (res.status===404){ const e=new Error('not-found'); e.code=404; throw e; }
        } catch(e){ if (e?.code===404) throw e; }
      }
      await sleep(delay + Math.random()*200); delay*=2;
    }
    throw new Error('fetch-failed');
  }

  function beginLoading(title="Cargando…") {
    const tb = $("table tbody"); if (tb) tb.innerHTML="";
    const sk = $("#skeleton"); if (sk) sk.hidden=false;
    const lu = $("#last-updated"); if (lu) { lu.hidden=false; lu.textContent=title; }
  }
  function endLoading() {
    const sk = $("#skeleton"); if (sk) sk.hidden=true;
  }
  function setUpdated(serieName, stamp=new Date()) {
    const el = $("#last-updated"); if (!el) return;
    const when = `${stamp.toLocaleDateString()} ${stamp.toLocaleTimeString()}`;
    el.hidden = false;
    el.textContent = `Actualizado: ${when} • ${serieName}`;
  }

  // === Parser del TXT ===
  // Formato esperado (ejemplo):
  // SERIE 1
  // 1 61 CAMILLI Martin
  // 2 121 PEREZ Sebastian
  // (líneas en blanco separan series)  — ver archivo de ejemplo
  function parseSeriesTXT(txt) {
    const lines = txt.replace(/\r\n/g, "\n").split("\n").map(s=>s.trim()).filter(s=>s.length>0);
    const bySerie = new Map();
    let current = null;

    const serieHeader = /^SERIE\s+(\d+)/i;
    const rowLine     = /^(\d+)\s+(\d+)\s+(.+)$/;

    for (const ln of lines) {
      const h = ln.match(serieHeader);
      if (h) {
        const n = parseInt(h[1],10);
        if (n>=1 && n<=SERIES_MAX) {
          current = `Serie ${n}`;
          if (!bySerie.has(current)) bySerie.set(current, []);
        } else {
          current = null;
        }
        continue;
      }
      if (current) {
        const m = ln.match(rowLine);
        if (m) {
          const pos = parseInt(m[1],10);
          const num = parseInt(m[2],10);
          const name= m[3].replace(/\s+/g,' ').trim(); // "APELLIDO Nombre" (se muestra como viene)
          bySerie.get(current).push({ position: pos, number: num, pilot: name });
        }
      }
    }
    return bySerie;
  }

  // === Render ===
  function buildSeriesButtons(bySerie) {
    const ul = $("#race-list ul"); if (!ul) return;
    ul.innerHTML = "";
    const names = [...bySerie.keys()].sort((a,b)=>{
      const na = parseInt((a.match(/\d+/)||[])[0]||0,10);
      const nb = parseInt((b.match(/\d+/)||[])[0]||0,10);
      return na-nb;
    });
    for (const name of names) {
      const li = document.createElement("li");
      li.textContent = name;
      li.onclick = () => renderSerie(name, bySerie.get(name));
      ul.appendChild(li);
    }
    if (names.length) renderSerie(names[0], bySerie.get(names[0])); // auto-selección primera
  }

  function renderSerie(name, rows) {
    beginLoading(`Cargando… • ${name}`);
    // resaltar activo
    $$("#race-list li").forEach(li => li.classList.remove("active"));
    const li = $$("#race-list li").find(li => li.textContent.trim()===name);
    if (li) li.classList.add("active");

    const tbody = $("table tbody");
    if (!tbody) return;

    // Tabla (Pos, N°, Piloto)
    tbody.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      const playoffClass = PLAYOFF_NUMBERS.has(r.number) ? "playoff" : "";
      tr.className = playoffClass;
      tr.innerHTML = `
        <td>${r.position}</td>
        <td>${r.number}</td>
        <td>${r.pilot}</td>
      `;
      tbody.appendChild(tr);
    }

    // Visual Fila 1 / Fila 2
    const g = $("#grid-largada");
    const f1 = $("#fila1"); const f2 = $("#fila2");
    if (g && f1 && f2) {
      g.hidden = false; f1.innerHTML=""; f2.innerHTML="";
      rows.forEach(r => {
        const chip = document.createElement("div");
        chip.className = `piloto-chip ${PLAYOFF_NUMBERS.has(r.number) ? "playoff":""}`;
        chip.innerHTML = `<span>#${r.position}</span><strong class="chip-nro">${r.number}</strong><span>${r.pilot}</span>`;
        if (r.position<=4) f1.appendChild(chip); else f2.appendChild(chip);
      });
    }

    endLoading();
    setUpdated(name, new Date());
    // Guardar última serie vista
    localStorage.setItem(`${CACHE_VER}:last`, name);
  }

  // Búsqueda rápida por nombre/N°
  $("#results-search")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    $$("#results tbody tr").forEach(tr => {
      const t = tr.textContent.toLowerCase();
      tr.style.display = t.includes(q) ? "" : "none";
    });
  });

  // === Carga inicial del TXT con CDN→RAW y cache-bust ===
  async function loadTXT() {
    beginLoading("Cargando series…");
    // 1) intenta CDN con las rutas candidatas
    let text = null, pathUsed = null;
    for (const p of TXT_CANDIDATES) {
      try {
        text = await fetchTextFallback(p, {fresh:false, rawPrefer:false});
        pathUsed = p; break;
      } catch {}
    }
    // 2) revalidar en RAW (cache-bust) para captar actualizaciones inmediatas
    if (pathUsed) {
      try {
        const fresh = await fetchTextFallback(pathUsed, {fresh:true, rawPrefer:true, retries:1});
        if (fresh && fresh !== text) {
          text = fresh; window.showToast?.("Series actualizadas (RAW)");
        }
      } catch {}
    }
    if (!text) { window.showToast?.("No se pudo leer el archivo de series."); endLoading(); return; }

    const bySerie = parseSeriesTXT(text);
    if (!bySerie.size) { window.showToast?.("El TXT no tiene bloques de series válidos."); endLoading(); return; }

    buildSeriesButtons(bySerie);

    // restaurar última seleccionada (si existe)
    const last = localStorage.getItem(`${CACHE_VER}:last`);
    if (last && bySerie.has(last)) renderSerie(last, bySerie.get(last));

    endLoading();
    $("#selected-pill").hidden = false;
    $("#selected-pill").textContent = "Series – orden de partida";
    setUpdated("Series", new Date());
  }

  // Botón actualizar: cache-bust duro
  $("#update-btn")?.addEventListener("click", () => {
    // no almacenamos cache de contenido aquí, solo forzamos recarga
    loadTXT();
  });

  document.addEventListener("DOMContentLoaded", loadTXT);
})();
