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
async function loadFechas() {
  const sel = qs('#fecha-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Cargando fechas…</option>';

  try {
    const fechas = await fetchJSON('fechas.json'); // p.ej. ["Fecha 01","Fecha 02",...]
    sel.innerHTML = '<option value="">-- Elegir Fecha --</option>';
    fechas.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    });

    const url = new URL(location.href);
    const fURL = url.searchParams.get('fecha');
    if (fURL && fechas.includes(fURL)) {
      sel.value = fURL;
      await window.loadRaces(fURL);
    }
  } catch (e) {
    console.error('No se pudo cargar FECHAS', e);
    showToast('No se pudo cargar FECHAS.');
    sel.innerHTML = '<option value="">(sin datos)</option>';
  }
}

async function loadRaces(fecha) {
  const fSel = qs('#fecha-select');
  const f = fecha || (fSel ? fSel.value : '');
  if (!f) return;

  const list = qs('#race-list ul');
  list.innerHTML = '<li class="loading">Cargando carreras…</li>';

  try {
    const idx = await fetchJSON(`${encodeURIComponent(f)}/index.json`);
    const keys = Object.keys(idx).filter(k => idx[k]);
    renderRaceList(f, keys);

    CURRENT.fecha = f;
    // Cargar la primera automáticamente
    if (keys.length) {
      await window.loadResults(f, keys[0]);
    } else {
      const tbody = qs('#results tbody');
      if (tbody) tbody.innerHTML = '';
      updateMeta(f, '(sin carreras)');
    }
  } catch (e) {
    console.error(`No se pudo cargar INDEX de ${f}`, e);
    showToast(`No se pudo cargar las carreras de ${f}.`);
    list.innerHTML = '<li class="error">Error al cargar</li>';
  }
}

async function loadResults(fecha, raceKey) {
  if (!fecha || !raceKey) return;
  CURRENT.fecha = fecha;
  CURRENT.race  = raceKey;

  // limpiar vista y mostrar skeleton
  const tbody = qs('#results tbody');
  if (tbody) tbody.innerHTML = '';
  showResultsSkeleton();

  try {
    const data = await fetchJSON(`${encodeURIComponent(fecha)}/${raceKey}.json`);
    clearResultsSkeleton();
    renderResultsTable(data);
    updateMeta(fecha, raceKey);
  } catch (e) {
    clearResultsSkeleton();
    console.error('Error cargando resultados:', e);
    showToast('No se pudo cargar resultados.');
    const tb = qs('#results tbody');
    if (tb) tb.innerHTML = '<tr><td colspan="7">Error al cargar esta carrera.</td></tr>';
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
