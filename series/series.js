/* /series/series.js — Volver abajo, sin Actualizar, sin grilla Fila1/Fila2.
   Inserta filas "Primera fila" y "Segunda fila" dentro de la tabla. */
(() => {
  if (window.__SERIES_LOADED__) return;
  window.__SERIES_LOADED__ = true;

  // ===== Config =====
  const TXT_REL   = "./orden%20de%20partida%20series.txt";          // nombre exacto del archivo en /series/
  const REPO_PATH = "series/orden%20de%20partida%20series.txt";      // ruta en el repo (para CDNs)
  const BASES = [
    (p,q) => `https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main/${p}${q||""}`,
    (p,q) => `https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main/${p}${q||""}`,
    (p,q) => `https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/${p}${q||""}`,
  ];
  const SERIES_MAX = 13;
  const CACHE_VER  = "series.v2";
  const PLAYOFF_NUMBERS = new Set([]); // cuando corresponda, colocar aquí los N° clasificados

  // ===== Utils =====
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

  function fetchWithTimeout(url, opts = {}, ms = 9000) {
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' }).finally(()=>clearTimeout(t));
  }

  function beginLoading(title="Cargando…") {
    const tb = $("table tbody"); if (tb) tb.innerHTML="";
    const sk = $("#skeleton");   if (sk) sk.hidden=false;
    const lu = $("#last-updated"); if (lu) { lu.hidden=false; lu.textContent=title; }
  }
  function endLoading(){ const sk=$("#skeleton"); if (sk) sk.hidden=true; }

  function setUpdated(label, stamp=new Date()){
    const el=$("#last-updated"); if (!el) return;
    const when = `${stamp.toLocaleDateString()} ${stamp.toLocaleTimeString()}`;
    el.hidden=false; el.textContent = `Actualizado: ${when} • ${label}`;
  }

  async function fetchTXT() {
    // A) relativo (mismo host)
    try {
      const r = await fetchWithTimeout(TXT_REL);
      if (r.ok) return await r.text();
    } catch {}
    // B) CDNs del repo con cache-bust
    const q = `?ts=${Date.now()}`;
    for (const mk of BASES) {
      try {
        const r = await fetchWithTimeout(mk(REPO_PATH, q));
        if (r.ok) return await r.text();
      } catch {}
    }
    throw new Error("no-txt");
  }

  // ===== Parser =====
  // Formato:
  // SERIE 1
  // 1 61 APELLIDO Nombre
  function parseSeriesTXT(txt) {
    const lines = txt.replace(/\r\n/g,"\n").split("\n").map(s=>s.trim());
    const bySerie = new Map();
    let cur = null;

    const h   = /^SERIE\s+(\d+)/i;
    const row = /^(\d+)\s+(\d+)\s+(.+)$/;

    for (const ln of lines) {
      if (!ln) continue;
      const mh = ln.match(h);
      if (mh) {
        const n = parseInt(mh[1],10);
        if (n>=1 && n<=SERIES_MAX) {
          cur = `Serie ${n}`;
          if (!bySerie.has(cur)) bySerie.set(cur, []);
        } else cur = null;
        continue;
      }
      if (!cur) continue;
      const m = ln.match(row);
      if (!m) continue;
      const pos  = parseInt(m[1],10);
      const num  = parseInt(m[2],10);
      const name = m[3].replace(/\s+/g,' ').trim();
      bySerie.get(cur).push({ position: pos, number: num, pilot: name });
    }
    return bySerie;
  }

  // ===== Render =====
  function buildButtons(bySerie) {
    const ul = $("#race-list ul"); if (!ul) return;
    ul.innerHTML = "";
    const names = [...bySerie.keys()].sort((a,b)=>{
      const na=parseInt((a.match(/\d+/)||[])[0]||0,10);
      const nb=parseInt((b.match(/\d+/)||[])[0]||0,10);
      return na-nb;
    });
    for (const name of names) {
      const li = document.createElement("li");
      li.textContent = name;
      li.onclick = () => renderSerie(name, bySerie.get(name));
      ul.appendChild(li);
    }
    if (names.length) renderSerie(names[0], bySerie.get(names[0]));
  }

  function addRowLabel(tbody, text){
    const tr = document.createElement("tr");
    tr.className = "row-label";
    tr.innerHTML = `<td colspan="3">${text}</td>`;
    tbody.appendChild(tr);
  }

  function renderSerie(name, rows) {
    beginLoading(`Cargando… • ${name}`);

    // activo
    $$("#race-list li").forEach(li => li.classList.remove("active"));
    const li = $$("#race-list li").find(li => li.textContent.trim()===name);
    if (li) li.classList.add("active");

    // pill
    const pill=$("#selected-pill"); if (pill){ pill.hidden=false; pill.textContent=name; }

    // tabla
    const tbody = $("table tbody"); if (!tbody) return;
    tbody.innerHTML = "";

    // Label "Primera fila"
    addRowLabel(tbody, "Primera fila");

    rows.forEach((r, idx) => {
      // Insertar "Segunda fila" justo después del 4°
      if (idx === 4) addRowLabel(tbody, "Segunda fila");

      const tr = document.createElement("tr");
      if (PLAYOFF_NUMBERS.has(r.number)) tr.setAttribute("style","outline:2px solid #ffdd00");
      tr.innerHTML = `
        <td>${r.position}</td>
        <td>${r.number}</td>
        <td>${r.pilot}</td>
      `;
      tbody.appendChild(tr);
    });

    endLoading();
    setUpdated(name, new Date());
    localStorage.setItem(`${CACHE_VER}:last`, name);
  }

  // búsqueda
  $("#results-search")?.addEventListener("input", (e)=>{
    const q = e.target.value.toLowerCase().trim();
    $$("#results tbody tr").forEach(tr=>{
      if (tr.classList.contains("row-label")) return; // no ocultar etiquetas
      const t = tr.textContent.toLowerCase();
      tr.style.display = t.includes(q) ? "" : "none";
    });
  });

  // init
  async function init(){
    beginLoading("Cargando series…");
    try {
      const txt = await fetchTXT();
      const bySerie = parseSeriesTXT(txt);
      if (!bySerie.size) { window.showToast?.("El TXT no tiene bloques válidos."); endLoading(); return; }
      buildButtons(bySerie);
      const last = localStorage.getItem(`${CACHE_VER}:last`);
      if (last && bySerie.has(last)) renderSerie(last, bySerie.get(last));
      setUpdated("Series", new Date());
    } catch (e) {
      window.showToast?.("No se pudo leer el archivo de series.");
      console.error(e);
    } finally {
      endLoading();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
