<script>
/* ========= Config ========= */
const CDNS = [
  'https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main',
  'https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main',
  'https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main'
];
const BASE = 'resultados'; // carpeta raíz de JSONs
const FECHAS_URL = `${BASE}/fechas.json`;

const RACE_LABELS = {
  serie: n => `SERIE ${n}`,
  repechaje: n => `REPECHAJE ${n}`,
  semifinal: n => `SEMIFINAL ${n}`,
  prefinal: () => 'PREFINAL',
  final: () => 'FINAL'
};

/* ========= Helpers DOM ========= */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const UI = {
  fechaSelect: () => $('#fechaSelect') || $('#fecha') || document.getElementById('fechaSelect'),
  carrerasList: () => $('#carrerasList') || $('#listadoCarreras') || $('#carreras'),
  tableBody: () => $('#resultadosBody') || $('#tablaResultados tbody') || $('#resultBody'),
  actualizado: () => $('#actualizado') || $('#lastUpdated') || $('#actualizacion'),
  toast: () => $('#toast') // opcional si tu enhancements.js lo usa
};

/* ========= Fetch con fallbacks ========= */
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithTimeout(url, { timeout = 8000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchJSON(pathRel, { timeout = 8000, ts = Date.now() } = {}) {
  const path = pathRel.startsWith('/') ? pathRel.slice(1) : pathRel;
  const urls = CDNS.map(base => `${base}/${path}?ts=${ts}`);
  let lastErr = null;
  for (let i = 0; i < urls.length; i++) {
    try {
      return await fetchWithTimeout(urls[i], { timeout });
    } catch (e) {
      lastErr = e;
      // backoff suave entre CDNs para evitar 429
      await sleep(300 + i * 300);
    }
  }
  const err = new Error('fetch-failed');
  err.cause = lastErr;
  throw err;
}

/* ========= Estado ========= */
let currentFecha = null;
let currentRace = null;

/* ========= Render ========= */
function clearResultados() {
  const tb = UI.tableBody();
  if (tb) tb.innerHTML = '';
}

function setActualizado({ fecha, carrera, fromJsonTime }) {
  const el = UI.actualizado();
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const when = `${hh}:${mm}:${ss}`;
  const extra = fromJsonTime ? ` • ${fromJsonTime}` : '';
  el.textContent = `Actualizado: ${when} — ${fecha}${carrera ? ` — ${carrera}` : ''}${extra}`;
}

function renderCarrerasList(keys) {
  const ul = UI.carrerasList();
  if (!ul) return;

  ul.innerHTML = '';
  keys.forEach(key => {
    const li = document.createElement('li');
    li.className = 'race-item';
    li.textContent = toHumanRace(key);
    li.dataset.key = key;
    li.onclick = () => loadResults(currentFecha, key);
    ul.appendChild(li);
  });
}

function toHumanRace(basename) {
  // mapea nombres de archivo → etiqueta legible
  // ejemplos: serie1, repechaje3, semifinal2, prefinal, final
  const mSerie = basename.match(/^serie(\d+)$/i);
  if (mSerie) return RACE_LABELS.serie(Number(mSerie[1]));
  const mRep = basename.match(/^repechaje(\d+)$/i);
  if (mRep) return RACE_LABELS.repechaje(Number(mRep[1]));
  const mSemi = basename.match(/^semifinal(\d+)$/i);
  if (mSemi) return RACE_LABELS.semifinal(Number(mSemi[1]));
  if (/^prefinal$/i.test(basename)) return RACE_LABELS.prefinal();
  if (/^final$/i.test(basename)) return RACE_LABELS.final();
  return basename.toUpperCase();
}

/* ========= Carga de datos ========= */
async function checkFechaTieneIndex(fecha, ts) {
  try {
    const idx = await fetchJSON(`${BASE}/${fecha}/index.json`, { ts });
    const keys = Array.isArray(idx) ? idx : Array.isArray(idx?.races) ? idx.races : Object.keys(idx || {});
    return keys && keys.length > 0;
  } catch {
    return false;
  }
}

async function loadFechas() {
  const sel = UI.fechaSelect();
  if (!sel) return;

  sel.disabled = true;
  sel.innerHTML = `<option>Cargando fechas...</option>`;

  let fechas = [];
  try {
    const raw = await fetchJSON(FECHAS_URL);
    fechas = Array.isArray(raw) ? raw : (raw?.fechas || []);
  } catch {
    // fallback: nada
    fechas = [];
  }

  // Filtrar solo las fechas que tengan index.json válido (secuencial para evitar 429)
  const ts = Date.now();
  const filtradas = [];
  for (const f of fechas) {
    // Ritmo lento para no gatillar límites
    /* eslint-disable no-await-in-loop */
    const ok = await checkFechaTieneIndex(f, ts);
    if (ok) filtradas.push(f);
    await sleep(150);
    /* eslint-enable no-await-in-loop */
  }

  if (filtradas.length === 0) {
    sel.innerHTML = `<option value="">Sin datos</option>`;
    sel.disabled = true;
    return;
  }

  sel.innerHTML = filtradas.map(f => `<option value="${f}">${f}</option>`).join('');
  sel.disabled = false;

  // Selección inicial: si había currentFecha y sigue existiendo, respetar; si no, la más reciente (última)
  const initial = currentFecha && filtradas.includes(currentFecha)
    ? currentFecha
    : filtradas[filtradas.length - 1];

  sel.value = initial;
  await loadCarreras(initial);
}

// Compatibilidad con tu HTML: onchange="loadRaces(this.value)"
window.loadRaces = async function(fecha) {
  await loadCarreras(fecha);
};

async function loadCarreras(fecha) {
  currentFecha = fecha;

  // Limpio resultados de la carrera anterior para que no quede información vieja
  clearResultados();
  setActualizado({ fecha, carrera: null });

  const ul = UI.carrerasList();
  if (ul) ul.innerHTML = '<li class="race-item loading">Cargando carreras...</li>';

  let keys = [];
  try {
    const idx = await fetchJSON(`${BASE}/${fecha}/index.json`);
    // Soportar tres formatos:
    // 1) array simple: ["serie1","serie2",...]
    // 2) objeto { races: [...] }
    // 3) objeto con claves { serie1: "...", final: "..." } → usar nombres de clave
    if (Array.isArray(idx)) {
      keys = idx;
    } else if (Array.isArray(idx?.races)) {
      keys = idx.races;
    } else {
      keys = Object.keys(idx || {});
    }
  } catch (e) {
    if (ul) ul.innerHTML = '<li class="race-item error">No se pudo cargar carreras</li>';
    return;
  }

  // Orden amigable: series asc, repechajes asc, semifinales asc, prefinal, final
  const orderKey = (k) => {
    const pad = n => String(n).padStart(2, '0');
    const s = k.toLowerCase();
    let m;
    if ((m = s.match(/^serie(\d+)$/))) return `1-${pad(+m[1])}`;
    if ((m = s.match(/^repechaje(\d+)$/))) return `2-${pad(+m[1])}`;
    if ((m = s.match(/^semifinal(\d+)$/))) return `3-${pad(+m[1])}`;
    if (s === 'prefinal') return `4-00`;
    if (s === 'final') return `5-00`;
    return `9-${s}`;
    };
  keys.sort((a, b) => orderKey(a).localeCompare(orderKey(b)));

  renderCarrerasList(keys);

  // No autoabrir nada si querés obligar a elegir; si preferís autoabrir la primera, descomenta:
  // if (keys.length) loadResults(fecha, keys[0]);
}

// Compatibilidad con enhancements.js que llama window.loadResults
window.loadResults = async function(fecha, raceKey) {
  await loadResults(fecha, raceKey);
};

async function loadResults(fecha, raceKey) {
  currentFecha = fecha;
  currentRace = raceKey;

  // Borro inmediatamente lo viejo para evitar confusión
  clearResultados();
  setActualizado({ fecha, carrera: toHumanRace(raceKey) });

  // Marcar selección en la lista
  const ul = UI.carrerasList();
  if (ul) {
    $$('.race-item', ul).forEach(li => li.classList.remove('active'));
    const li = Array.from(ul.children).find(el => el.dataset?.key === raceKey);
    if (li) li.classList.add('active');
  }

  // Muestro "cargando" en la tabla si existe
  const tb = UI.tableBody();
  if (tb) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = 'Cargando...';
    tr.appendChild(td);
    tb.appendChild(tr);
  }

  // Cargar JSON de la carrera
  let data;
  try {
    data = await fetchJSON(`${BASE}/${fecha}/${raceKey}.json`);
  } catch (e) {
    if (tb) tb.innerHTML = `<tr><td colspan="4">No se pudo cargar ${toHumanRace(raceKey)}</td></tr>`;
    return;
  }

  // Render resultados (adaptado a tu formato clásico)
  // Esperado: { time?: "21:04", results: [{position, number, name, t_final, ...}, ...] }
  const rows = Array.isArray(data?.results) ? data.results : [];
  if (tb) {
    tb.innerHTML = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      const cPos = document.createElement('td');
      const cNum = document.createElement('td');
      const cNom = document.createElement('td');
      const cTot = document.createElement('td');

      cPos.textContent = r.position ?? '';
      cNum.textContent = r.number ?? '';
      cNom.textContent = r.name ?? '';
      cTot.textContent = r.t_final ?? '';

      tr.append(cPos, cNum, cNom, cTot);
      tb.appendChild(tr);
    }
  }

  // “Actualizado” con hora del JSON si existe
  const jsonTime = (data?.time && typeof data.time === 'string') ? `(${data.time})` : '';
  setActualizado({ fecha, carrera: toHumanRace(raceKey), fromJsonTime: jsonTime });
}

/* ========= Inicio ========= */
document.addEventListener('DOMContentLoaded', () => {
  // Enlazo también el onchange por si NO usás inline en el HTML (ambos conviven)
  const sel = UI.fechaSelect();
  if (sel) sel.onchange = (e) => loadCarreras(e.target.value);

  // Carga inicial
  loadFechas();
});
</script>
