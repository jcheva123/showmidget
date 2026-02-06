/* /series/series.js
   Lee primero "Nuevo orden de partida.txt" (formato nuevo),
   si no lo encuentra usa "orden de partida series.txt" (formato viejo).
   Soporta hasta 13 series y muestra "Primera fila" / "Segunda fila".
*/
(() => {
  if (window.__SERIES_LOADED__) return;
  window.__SERIES_LOADED__ = true;

  // ===== Config =====
  const LOCAL_FILES = [
    "./Nuevo%20orden%20de%20partida.txt",     // formato nuevo (tabs) :contentReference[oaicite:0]{index=0}
    "./orden%20de%20partida%20series.txt"     // formato viejo (pos num nombre) :contentReference[oaicite:1]{index=1}
  ];
  // mismas rutas pero en el repo/CDN
  const REMOTE_FILES = [
    "series/Nuevo%20orden%20de%20partida.txt",
    "series/orden%20de%20partida%20series.txt"
  ];
  const BASES = [
    p => `https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main/${p}?ts=${Date.now()}`,
    p => `https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main/${p}?ts=${Date.now()}`,
    p => `https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/${p}?ts=${Date.now()}`
  ];
  const SERIES_MAX = 22;
  const CACHE_VER  = "series.v3";
  // cuando empiece el playoff, metés los N° acá para resaltarlos
  const PLAYOFF_NUMBERS = new Set([]);

  
  // === Playoffs (por NOMBRE) ===
  // Normalizamos (minúsculas, sin acentos, sin puntos) y matcheamos por apellido / keyword.
  const PLAYOFF_MATCHERS = [
    /\bfranchi\b/,
    /\bvallejos\b/,
    /\baltamirano\b/,
    /\boyola\b/,
    /\bmeler\b/,          // "Pérez Meler" (evita marcar cualquier "Pérez")
    /\bsaldamando\b/,
    /\bresola\b/,
    /\bschmit\b/,
    /\bburgos\b/,
    /\bbonivardo\b/,
    /\broth\b/,
    /\bmancini\b/,
    /\bcolaneri\b/,
    /\bpuccinelli\b/,
    /\bschiebelbein\b/,
    /\bpaglialunga\b/,
    /\btodino\b/
  ];

  function normalizeName(s) {
    return String(s ?? "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // sin acentos
      .replace(/[\.:,;'"()\[\]{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isPlayoffPilot(pilot) {
    const n = normalizeName(pilot);
    if (!n) return false;
    return PLAYOFF_MATCHERS.some(re => re.test(n));
  }
// ===== Utils =====
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function fetchWithTimeout(url, ms=9000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, {signal: ctrl.signal, cache: "no-store"})
      .finally(() => clearTimeout(t));
  }

  function beginLoading(label="Cargando…") {
    const tb = $("#results tbody");
    if (tb) tb.innerHTML = "";
    const sk = $("#skeleton");
    if (sk) sk.hidden = false;
    const lu = $("#last-updated");
    if (lu) {
      lu.hidden = false;
      lu.textContent = label;
    }
  }
  function endLoading() {
    const sk = $("#skeleton");
    if (sk) sk.hidden = true;
  }

  function setUpdated(label, stamp=new Date()) {
    const el = $("#last-updated");
    if (!el) return;
    const fecha = stamp.toLocaleDateString();
    const hora  = stamp.toLocaleTimeString();
    el.hidden = false;
    el.textContent = `Actualizado: ${fecha} ${hora} • ${label}`;
  }

  // ===== 1) Conseguir el TXT (local -> remoto) =====
  async function fetchTXT() {
    // primero probamos los 2 locales
    for (const lf of LOCAL_FILES) {
      try {
        const r = await fetchWithTimeout(lf);
        if (r.ok) return await r.text();
      } catch (_) {}
    }
    // después probamos los remotos
    for (const rf of REMOTE_FILES) {
      for (const base of BASES) {
        try {
          const r = await fetchWithTimeout(base(rf));
          if (r.ok) return await r.text();
        } catch (_) {}
      }
    }
    throw new Error("No se pudo leer ningún TXT de series");
  }

  // ===== 2) Parser que aguanta los 2 formatos =====
  // Formato viejo (el primero):            :contentReference[oaicite:2]{index=2}
  // SERIE 1
  // 1 61 CAMILLI Martin
  //
  // Formato nuevo (el que te pasan ahora): :contentReference[oaicite:3]{index=3}
  // SERIE 1    22    TODINO
  //   29    PAGLIALUNGA
  //   62    ONORATO
  //
  function parseSeriesTXT(txt) {
    const lines = txt.replace(/\r\n/g, "\n").split("\n").map(s => s.trim());
    const bySerie = new Map();
    let current = null;
    let autoPos = 1;

    const headerRe = /^SERIE\s+(\d+)/i;
    const oldRowRe = /^(\d+)\s+(\d+)\s+(.+)$/;           // 1 61 CAMILLI Martin
    // en el nuevo a veces la primera línea del header ya trae piloto:
    // "SERIE 1\t22\tTODINO"  o  "SERIE 1  22  TODINO"
    for (let raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      const h = line.match(headerRe);
      if (h) {
        const n = parseInt(h[1], 10);
        if (n >= 1 && n <= SERIES_MAX) {
          current = `Serie ${n}`;
          if (!bySerie.has(current)) bySerie.set(current, []);
          autoPos = 1;
          // revisar si después del "SERIE n" ya viene un piloto en la misma línea
          const after = line.replace(headerRe, "").trim();
          if (after) {
            const drv = parseNewLine(after, autoPos);
            if (drv) {
              bySerie.get(current).push(drv);
              autoPos++;
            }
          }
        } else {
          current = null;
        }
        continue;
      }

      // si no estamos en una serie, ignoramos
      if (!current) continue;

      // 1) probar formato viejo
      const mOld = line.match(oldRowRe);
      if (mOld) {
        const pos  = parseInt(mOld[1], 10);
        const num  = parseInt(mOld[2], 10);
        const name = mOld[3].replace(/\s+/g, " ").trim();
        bySerie.get(current).push({
          position: pos,
          number: num,
          pilot: name
        });
        // mantener autoPos actualizado por si vienen líneas nuevas sin pos
        autoPos = Math.max(autoPos, pos + 1);
        continue;
      }

      // 2) probar formato nuevo (solo número + nombre)
      const drv = parseNewLine(line, autoPos);
      if (drv) {
        bySerie.get(current).push(drv);
        autoPos++;
      }
      // si no matchea, la ignoramos (puede ser línea vacía o separador)
    }

    return bySerie;
  }

  // intenta parsear una línea del formato nuevo: "22  TODINO" o "\t29\tPAGLIALUNGA"
  function parseNewLine(str, posFallback) {
    // quitar guiones o filas vacías
    if (!str || str === "-" || str === "–") return null;
    // separar por tabs primero, si no por espacios
    let parts = str.split(/\t+/).filter(Boolean);
    if (parts.length === 1) {
      // no había tabs, probamos con espacios
      parts = str.trim().split(/\s+/);
    }
    if (parts.length < 2) return null;

    const num = parseInt(parts[0], 10);
    if (Number.isNaN(num)) return null;

    const name = parts.slice(1).join(" ").replace(/\s+/g, " ").trim();
    if (!name) return null;

    return {
      position: posFallback,
      number: num,
      pilot: name
    };
  }

  // ===== 3) Render =====
  function buildButtons(bySerie) {
    const ul = $("#race-list ul");
    if (!ul) return;
    ul.innerHTML = "";

    // ordenar por nro de serie
    const names = [...bySerie.keys()].sort((a,b) => {
      const na = parseInt((a.match(/\d+/)||["0"])[0], 10);
      const nb = parseInt((b.match(/\d+/)||["0"])[0], 10);
      return na - nb;
    });

    for (const name of names) {
      const li = document.createElement("li");
      li.textContent = name;
      li.onclick = () => renderSerie(name, bySerie.get(name));
      ul.appendChild(li);
    }

    // mostrar la primera de una
    if (names.length) {
      renderSerie(names[0], bySerie.get(names[0]));
    }
  }

  function addRowLabel(tbody, text) {
    const tr = document.createElement("tr");
    tr.className = "row-label";
    tr.innerHTML = `<td colspan="3">${text}</td>`;
    tbody.appendChild(tr);
  }

  function renderSerie(name, rows=[]) {
    beginLoading(`Cargando… • ${name}`);

    // marcar activa
    $$("#race-list li").forEach(li => li.classList.remove("active"));
    const liActive = $$("#race-list li").find(li => li.textContent.trim() === name);
    if (liActive) liActive.classList.add("active");

    // pill
    const pill = $("#selected-pill");
    if (pill) {
      pill.hidden = false;
      pill.textContent = name;
    }

    const tbody = $("#results tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    // etiqueta "Primera fila"
    addRowLabel(tbody, "Primera fila");

    rows.forEach((r, idx) => {
      // insertar "Segunda fila" después del 4º
      if (idx === 4) {
        addRowLabel(tbody, "Segunda fila");
      }
      const tr = document.createElement("tr");
      if (PLAYOFF_NUMBERS.has(r.number) || isPlayoffPilot(r.pilot)) {
        tr.classList.add("playoff");
      }
      tr.innerHTML = `
        <td>${r.position ?? (idx+1)}</td>
        <td>${r.number}</td>
        <td>${r.pilot}</td>
      `;
      tbody.appendChild(tr);
    });

    endLoading();
    setUpdated(name, new Date());
    // recordar la última vista
    localStorage.setItem(`${CACHE_VER}:last`, name);
  }

  // búsqueda en vivo
  $("#results-search")?.addEventListener("input", e => {
    const q = e.target.value.toLowerCase().trim();
    $$("#results tbody tr").forEach(tr => {
      if (tr.classList.contains("row-label")) return; // no ocultar etiquetas
      const t = tr.textContent.toLowerCase();
      tr.style.display = t.includes(q) ? "" : "none";
    });
  });

  // ===== 4) init =====
  async function init() {
    beginLoading("Cargando series…");
    try {
      const txt = await fetchTXT();
      const bySerie = parseSeriesTXT(txt);
      if (!bySerie.size) {
        window.showToast?.("No hay datos");
        endLoading();
        return;
      }
      buildButtons(bySerie);

      // si hay última vista, ir a esa
      const last = localStorage.getItem(`${CACHE_VER}:last`);
      if (last && bySerie.has(last)) {
        renderSerie(last, bySerie.get(last));
      }

      setUpdated("Series", new Date());
    } catch (err) {
      console.error(err);
      window.showToast?.("No se pudo leer el archivo de series.");
    } finally {
      endLoading();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();


