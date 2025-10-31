// ================== CONFIG ==================
const BASES = [
  'https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/resultados',
  'https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main/resultados',
  'https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main/resultados'
];

// Mapa clave -> etiqueta
const RACE_LABELS = { prefinal: 'PREFINAL', final: 'FINAL' };
for (let i = 1; i <= 13; i++) RACE_LABELS[`serie${i}`] = `SERIE ${i}`;
for (let i = 1; i <= 6;  i++) RACE_LABELS[`repechaje${i}`] = `REPECHAJE ${i}`;
for (let i = 1; i <= 4;  i++) RACE_LABELS[`semifinal${i}`] = `SEMIFINAL ${i}`;

const ORDER = [
  ...Array.from({length:13}, (_,i)=>`serie${i+1}`),
  ...Array.from({length:6},  (_,i)=>`repechaje${i+1}`),
  ...Array.from({length:4},  (_,i)=>`semifinal${i+1}`),
  'prefinal','final'
];
// Aceptamos claves tipo "serie1", "repechaje2", "semifinal3", "prefinal", "final"
const RACE_KEY_RE = /^(?:serie(?:0?[1-9]|1[0-3])|repechaje[1-6]|semifinal[1-4]|prefinal|final)$/i;

function toRaceKey(x) {
  if (x == null) return null;
  let s = String(x).trim().toLowerCase();
  // normalizo "serie 1" -> "serie1", idem otras
  s = s.replace(/\s+/g, '');
  if (RACE_KEY_RE.test(s)) return s;
  return null;
}

// Devuelve array de claves de carreras a partir del index crudo
function normalizeIndex(raw) {
  if (!raw) return [];

  // Caso array directo
  if (Array.isArray(raw)) {
    return raw.map(toRaceKey).filter(Boolean);
  }

  // Caso con contenedor "races"
  if (raw && raw.races != null) {
    const r = raw.races;
    if (Array.isArray(r)) return r.map(toRaceKey).filter(Boolean);
    if (typeof r === 'object') {
      return Object.keys(r).map(toRaceKey).filter(Boolean);
    }
  }

  // Caso objeto plano con flags por carrera
  if (typeof raw === 'object') {
    return Object.keys(raw)
      .map(toRaceKey)
      .filter(Boolean)
      .filter(k => {
        const v = raw[k];
        // si hay boolean true o un objeto con datos, lo tomo como presente
        return v === true || (v && typeof v === 'object');
      });
  }

  // Último intento si viniera como string JSON
  try {
    const parsed = JSON.parse(raw);
    return normalizeIndex(parsed);
  } catch {
    return [];
  }
}

/* ====== SHIMS / FALLBACKS ====== */
(function () {
  // Toast básico si no existe
  if (typeof window.showToast !== 'function') {
    window.showToast = function (msg) {
      let t = document.querySelector('#toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);padding:8px 12px;background:#222;color:#fff;border-radius:8px;font:600 14px system-ui;z-index:9999;opacity:0;transition:opacity .2s';
        document.body.appendChild(t);
      }
      t.textContent = msg || '';
      t.style.opacity = '1';
      setTimeout(() => { t.style.opacity = '0'; }, 1600);
    };
  }

  // setStatus básico si no existe
  if (typeof window.setStatus !== 'function') {
    window.setStatus = function (text) {
      const el = document.querySelector('#last-updated') || document.querySelector('#status-badge');
      if (!el) return;
      if (text && String(text).trim()) {
        el.hidden = false;
        el.textContent = text;
      } else {
        el.hidden = true;
        el.textContent = '';
      }
    };
  }
})();

// ================== HELPERS ==================
const qs  = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function showToast(msg) {
  let t = qs('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);padding:8px 12px;background:#222;color:#fff;border-radius:8px;font:600 14px system-ui;z-index:9999;opacity:0;transition:opacity .2s';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(()=>{ t.style.opacity = '0'; }, 1600);
}

async function fetchJSON(path) {
  const ts = Date.now();
  for (const base of BASES) {
    const url = `${base}/${path}?ts=${ts}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (_) { /* intento siguiente base */ }
  }
  throw new Error(`fetch-failed: ${path}`);
}

function nowLabel() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ================== RENDER ==================
function clearResultsSkeleton() {
  const sk = qs('#skeleton');
  if (sk) sk.hidden = true;
}
function showResultsSkeleton() {
  const sk = qs('#skeleton');
  if (sk) sk.hidden = false;
}

function renderRaceList(fecha, keys) {
  const list = qs('#race-list ul');
  list.innerHTML = '';

  const ordered = [...keys].sort((a,b)=> ORDER.indexOf(a) - ORDER.indexOf(b));
  for (const k of ordered) {
    const li = document.createElement('li');
    li.className  = 'race-item';
    li.textContent = RACE_LABELS[k] || k.toUpperCase();
    li.onclick = () => window.loadResults(fecha, k);
    list.appendChild(li);
  }
}

function renderResultsTable(data) {
  const tbody = qs('#results tbody');
  tbody.innerHTML = '';
  const rows = data?.results || [];
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i % 2) tr.classList.add('row-alt');
    tr.innerHTML = `
      <td>${r.position ?? ''}</td>
      <td>${r.number ?? ''}</td>
      <td>${r.name ?? ''}</td>
      <td>${r.rec_str ?? (r.rec ?? '')}</td>
      <td>${r.t_final ?? ''}</td>
      <td>${r.laps ?? ''}</td>
      <td>${r.penalty_note ?? ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

function updateMeta(fecha, raceKey) {
  const pill = qs('#selected-pill');
  const upd  = qs('#last-updated');
  if (pill) {
    pill.textContent = `${fecha} — ${RACE_LABELS[raceKey] || raceKey.toUpperCase()}`;
    pill.hidden = false;
  }
  if (upd) {
    upd.textContent = `Actualizado: ${nowLabel()} — ${fecha} — ${RACE_LABELS[raceKey] || raceKey.toUpperCase()}`;
    upd.hidden = false;
  }
}

// ================== STATE ==================
let CURRENT = { fecha: null, race: null };

// ================== LOADERS ==================
// Helpers nuevos
function fechaSort(a, b) {
  const na = parseInt(String(a).replace(/\D+/g, ''), 10) || 0;
  const nb = parseInt(String(b).replace(/\D+/g, ''), 10) || 0;
  return na - nb;
}
function normalizeFechas(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.fechas)) return raw.fechas;
  if (typeof raw === 'object') {
    // Ej: { "Fecha 01": true|{}, "Fecha 02": {...} }
    return Object.keys(raw).filter(k => /^fecha\s*\d+/i.test(k));
  }
  // Último intento si viniera como string JSON
  try {
    const parsed = JSON.parse(raw);
    return normalizeFechas(parsed);
  } catch (_) {
    return [];
  }
}

// Reemplazo de loadFechas()
async function loadFechas() {
  const sel = document.querySelector('#fecha-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Cargando fechas…</option>';

  try {
    const raw = await fetchJSON('fechas.json');
    // console.debug('fechas.json recibido:', raw);
    let fechas = normalizeFechas(raw);

    // si por alguna razón llegaron con/ sin cero a la izquierda,
    // no pasa nada: mostramos lo que venga; solo ordenamos por número
    fechas = Array.from(new Set(fechas)).sort(fechaSort);

    if (!fechas.length) throw new Error('fechas-vacias');

    sel.innerHTML = '<option value="">-- Elegir Fecha --</option>';
    for (const f of fechas) {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    }

    // respetar ?fecha= en la URL si existe
    const url = new URL(location.href);
    const fURL = url.searchParams.get('fecha');
    if (fURL && fechas.includes(fURL)) {
      sel.value = fURL;
      await window.loadRaces(fURL);
    }
  } catch (e) {
    console.error('No se pudo cargar FECHAS', e);
    showToast('No se pudieron cargar FECHAS.');
    sel.innerHTML = '<option value="">(sin datos)</option>';
  }
}


async function loadRaces(fecha) {
  const f = fecha || document.querySelector('#fecha-select')?.value;
  if (!f) return;

  // UI
  const list = document.querySelector('#race-list ul') || document.querySelector('#carrerasList');
  if (list) list.innerHTML = '<li class="loading">Cargando carreras…</li>';
  setStatus?.(`Cargando — ${f}`);

  try {
    const idxRaw = await fetchJSON(`${encodeURIComponent(f)}/index.json`);
    let keys = normalizeIndex(idxRaw);

    // orden final usando tu ORDER
    const orderPos = k => ORDER.indexOf(k) === -1 ? 999 : ORDER.indexOf(k);
    keys = Array.from(new Set(keys)).sort((a,b)=> orderPos(a)-orderPos(b));

    // Render lista
    if (list) {
      list.innerHTML = '';
      if (!keys.length) {
        list.innerHTML = '<li class="empty">Sin carreras cargadas aún.</li>';
      } else {
        for (const k of keys) {
          const li = document.createElement('li');
          li.className = 'race-item';
          li.textContent = RACE_LABELS[k] || k.toUpperCase();
          li.onclick = () => window.loadResults(f, k);
          list.appendChild(li);
        }
      }
    }

    // Cargar la primera disponible
    const first = keys[0];
    const resultsBox = document.querySelector('#results tbody') || document.querySelector('#resultados');
    if (!first) {
  if (resultsBox) resultsBox.innerHTML = '<tr><td colspan="7" class="empty">Sin carreras cargadas aún.</td></tr>';
  // ✅ Usar nowLabel(), que ya existe arriba en tu script
  setStatus?.(`Actualizado: ${nowLabel()} — ${f} — (sin carreras)`);
  return;
}


    // skeleton
    if (resultsBox) {
      const container = document.querySelector('#results .table-container') || document.querySelector('#resultados');
      if (container) container.classList.add('loading');
    }
async function loadResults(fecha, raceKey) {
  if (!fecha || !raceKey) return;

  try {
    // Estado actual
    CURRENT.fecha = fecha;
    CURRENT.race  = raceKey;

    // UI: mostrando carga
    setStatus?.(`Cargando — ${fecha} — ${RACE_LABELS[raceKey] || raceKey.toUpperCase()}`);
    const sk = document.getElementById('skeleton');
    if (sk) sk.hidden = false;

    // Traer JSON de la carrera
    const data = await fetchJSON(`${encodeURIComponent(fecha)}/${raceKey}.json`);

    // Pintar tabla y meta
    renderResultsTable(data);
    updateMeta(fecha, raceKey);

    setStatus?.(`Actualizado: ${nowLabel()} — ${fecha} — ${RACE_LABELS[raceKey] || raceKey.toUpperCase()}`);
  } catch (err) {
    console.error('Error cargando resultados:', err);
    showToast?.('No se pudo cargar esta carrera.');
    const tbody = document.querySelector('#results tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="error">No se pudo cargar esta carrera.</td></tr>';
    setStatus?.('Error al cargar');
  } finally {
    const sk = document.getElementById('skeleton');
    if (sk) sk.hidden = true;
  }
}

    await window.loadResults(f, first);
  } catch (err) {
    console.error(`No se pudo cargar INDEX de ${f}`, err);
    showToast?.(`No se pudo cargar INDEX de ${f}.`);
    if (list) list.innerHTML = '<li class="error">Error al cargar carreras</li>';
    const resultsBox = document.querySelector('#results tbody') || document.querySelector('#resultados');
    if (resultsBox) resultsBox.innerHTML = '';
    setStatus?.('Error al cargar');
  }
}


// ================== EVENTS ==================
document.addEventListener('DOMContentLoaded', () => {
  // botón Actualizar
  const btn = qs('#update-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      if (CURRENT.fecha) {
        await loadRaces(CURRENT.fecha);
        if (CURRENT.race) await loadResults(CURRENT.fecha, CURRENT.race);
      } else {
        await loadFechas();
      }
    });
  }

  // búsqueda
  const search = qs('#results-search');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      const rows = qsa('#results tbody tr');
      rows.forEach(tr => {
        const text = tr.textContent.toLowerCase();
        tr.style.display = text.includes(q) ? '' : 'none';
      });
    });
  }

  // carga inicial
  loadFechas();
});

// Exponer para el HTML inline (onchange del select)
window.loadRaces   = loadRaces;
window.loadResults = loadResults;





