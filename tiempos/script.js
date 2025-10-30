// ==============================
// CONFIG & HELPERS
// ==============================
const FETCH_TIMEOUT_MS = 12000;

// Repos (no tocar)
const RAW_BASE = 'https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main';
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main';
const ALT_CDN = 'https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main';

// Paths relativos dentro del repo
const R_FECHAS = 'resultados/fechas.json';
const R_INDEX  = (fecha) => `resultados/${fecha}/index.json`;
const R_RACE   = (fecha, raceKey) => `resultados/${fecha}/${raceKey}.json`;

// Buscá el primer elemento que exista entre varios selectores
const pick = (selList) => {
  for (const sel of selList.split(',')) {
    const el = document.querySelector(sel.trim());
    if (el) return el;
  }
  return null;
};

// UI elements (tolerante a distintas IDs usadas antes)
const UI = {
  fechaSelect: pick('#fechaSelect, #fecha, select[name="fecha"]'),
  carrerasList: pick('#carrerasList, #listaCarreras, #racesList'),
  resultados: pick('#resultados, #results, #resultsContainer'),
  actualizado: pick('#actualizado, #updatedAt, #lastUpdated'),
};

// Etiquetas bonitas
function formatRaceLabel(key) {
  const mSerie = key.match(/^serie(\d{1,2})$/i);
  const mRep   = key.match(/^repechaje(\d{1,2})$/i);
  const mSemi  = key.match(/^semifinal(\d{1,2})$/i);
  if (mSerie) return `SERIE ${parseInt(mSerie[1],10)}`;
  if (mRep)   return `REPECHAJE ${parseInt(mRep[1],10)}`;
  if (mSemi)  return `SEMIFINAL ${parseInt(mSemi[1],10)}`;
  if (/^prefinal$/i.test(key)) return 'PREFINAL';
  if (/^final$/i.test(key))    return 'FINAL';
  // fallback
  return key.toUpperCase();
}

// Orden para mostrar carreras
function raceSortKey(key) {
  const norm = key.toLowerCase();
  const num = (re) => (norm.match(re)?.[1] ? parseInt(norm.match(re)[1],10) : 0);
  if (norm.startsWith('serie'))     return [1, num(/^serie(\d+)/)];
  if (norm.startsWith('repechaje')) return [2, num(/^repechaje(\d+)/)];
  if (norm.startsWith('semifinal')) return [3, num(/^semifinal(\d+)/)];
  if (norm === 'prefinal')          return [4, 0];
  if (norm === 'final')             return [5, 0];
  return [9, 0]; // otros al final
}

function hhmmss(d=new Date()) {
  const pad = (n)=> String(n).padStart(2,'0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ==============================
// FETCH sin CORS problemático
// ==============================
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort('timeout'), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { mode: 'cors', signal: controller.signal });
    if (!res.ok) throw new Error(String(res.status || 'fetch-failed'));
    return await res.json();
  } finally {
    clearTimeout(to);
  }
}

async function fetchJSON(pathRel) {
  const ts = Date.now();
  const urls = [
    `${RAW_BASE}/${pathRel}?ts=${ts}`,
    `${CDN_BASE}/${pathRel}?ts=${ts}`,
    `${ALT_CDN}/${pathRel}?ts=${ts}`,
  ];
  let lastErr;
  for (const u of urls) {
    try {
      return await fetchWithTimeout(u);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('fetch-failed');
}

// Reintentos para JSON de carrera (429/502 intermitentes)
async function fetchRaceJSON(fecha, raceKey, maxRetries=2) {
  let attempt = 0;
  let delay = 600;
  while (true) {
    try {
      return await fetchJSON(R_RACE(fecha, raceKey));
    } catch (e) {
      const is429 = String(e.message).includes('429');
      const is502 = String(e.message).includes('502');
      if (attempt < maxRetries && (is429 || is502)) {
        await new Promise(r => setTimeout(r, delay));
        attempt++;
        delay *= 1.6;
        continue;
      }
      throw e;
    }
  }
}

// ==============================
// RENDER
// ==============================
function renderCarrerasList(fecha, keys) {
  if (!UI.carrerasList) return;
  UI.carrerasList.innerHTML = '';

  // único y ordenado
  const unique = [...new Set(keys)];
  unique.sort((a,b) => {
    const A = raceSortKey(a), B = raceSortKey(b);
    return (A[0]-B[0]) || (A[1]-B[1]);
  });

  for (const key of unique) {
    const li = document.createElement('li');
    li.className = 'race-item';
    li.textContent = formatRaceLabel(key);
    li.onclick = () => loadResults(fecha, key);
    UI.carrerasList.appendChild(li);
  }
}

function renderLoading(fecha, key) {
  if (UI.resultados) {
    UI.resultados.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <div class="loading-text">Cargando… <span class="muted">(${fecha} · ${formatRaceLabel(key)})</span></div>
      </div>
    `;
  }
  if (UI.actualizado) {
    UI.actualizado.textContent = `Actualizando… ${fecha} · ${formatRaceLabel(key)}`;
  }
}

function renderResultados(fecha, key, data) {
  if (!UI.resultados) return;

  // data.results: [{position, number, name, t_final, laps, ...}]
  const rows = (data?.results || []).map(r => `
    <tr>
      <td class="col-pos">${r.position ?? ''}</td>
      <td class="col-num">${r.number ?? ''}</td>
      <td class="col-name">${r.name ?? ''}</td>
      <td class="col-total">${r.t_final ?? ''}</td>
    </tr>
  `).join('');

  UI.resultados.innerHTML = `
    <div class="race-title">${formatRaceLabel(key)}</div>
    <table class="tabla-resultados">
      <thead>
        <tr>
          <th>Pos.</th>
          <th>N°</th>
          <th>Nombre</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4" class="muted">Sin datos aún</td></tr>`}</tbody>
    </table>
  `;

  if (UI.actualizado) {
    UI.actualizado.textContent = `Actualizado: ${hhmmss()} · ${fecha} · ${formatRaceLabel(key)}`;
  }
}

// ==============================
// FLOW
// ==============================
async function loadFechas() {
  if (UI.fechaSelect) {
    UI.fechaSelect.innerHTML = `<option value="">Cargando fechas…</option>`;
  }

  const obj = await fetchJSON(R_FECHAS);
  const fechas = Array.isArray(obj) ? obj : (obj?.fechas || []);
  fechas.sort(); // "Fecha 01"..."Fecha 18"

  if (!UI.fechaSelect) return fechas;

  UI.fechaSelect.innerHTML = '';
  for (const f of fechas) {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    UI.fechaSelect.appendChild(opt);
  }

  // Default: última fecha disponible
  if (fechas.length) {
    UI.fechaSelect.value = fechas[fechas.length - 1];
  }
  return fechas;
}

async function loadCarreras(fecha) {
  // Limpio resultados y updated al cambiar de fecha
  if (UI.resultados) UI.resultados.innerHTML = '';
  if (UI.actualizado) UI.actualizado.textContent = '';

  const idx = await fetchJSON(R_INDEX(fecha));

  // idx puede ser: { carreras: ["serie1","..."] } o array plano
  const keys = Array.isArray(idx) ? idx : (idx?.carreras || Object.keys(idx || {}));
  renderCarrerasList(fecha, keys);

  // Autocargar la primera carrera si existe
  if (keys.length) {
    await loadResults(fecha, keys[0]);
  }
}

async function loadResults(fecha, raceKey) {
  try {
    renderLoading(fecha, raceKey);
    const data = await fetchRaceJSON(fecha, raceKey, 2);
    renderResultados(fecha, raceKey, data);
  } catch (e) {
    if (UI.resultados) {
      UI.resultados.innerHTML = `
        <div class="error">
          No se pudo cargar <b>${formatRaceLabel(raceKey)}</b> de <b>${fecha}</b>.
          <div class="muted">${String(e.message || e)}</div>
        </div>
      `;
    }
    if (UI.actualizado) {
      UI.actualizado.textContent = `Error al actualizar: ${fecha} · ${formatRaceLabel(raceKey)}`;
    }
  }
}

// Exponer para otros scripts (ej. enhancements.js)
window.loadResults = loadResults;

// Init
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const fechas = await loadFechas();
    const currentFecha = UI.fechaSelect ? UI.fechaSelect.value : (fechas?.slice(-1)[0] || null);
    if (currentFecha) await loadCarreras(currentFecha);

    if (UI.fechaSelect) {
      UI.fechaSelect.onchange = async (e) => {
        const f = e.target.value;
        if (f) await loadCarreras(f);
      };
    }
  } catch (e) {
    // Falla al cargar fechas
    if (UI.fechaSelect) {
      UI.fechaSelect.innerHTML = `<option value="">No se pudo cargar</option>`;
    }
    if (UI.resultados) {
      UI.resultados.innerHTML = `
        <div class="error">No se pudieron cargar las fechas. Reintentá en unos segundos.</div>
      `;
    }
  }
});
