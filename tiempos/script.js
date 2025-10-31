<!-- Guarda este contenido como /tiempos/script.js -->
<script>
// ================== CONFIG ==================
const BASES = [
  'https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/resultados',
  'https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main/resultados',
  'https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main/resultados'
];

// Mapea clave -> etiqueta legible
const RACE_LABELS = {
  prefinal: 'PREFINAL',
  final: 'FINAL'
};
for (let i = 1; i <= 13; i++) RACE_LABELS[`serie${i}`] = `SERIE ${i}`;
for (let i = 1; i <= 6; i++)  RACE_LABELS[`repechaje${i}`] = `REPECHAJE ${i}`;
for (let i = 1; i <= 4; i++)  RACE_LABELS[`semifinal${i}`] = `SEMIFINAL ${i}`;

// Orden deseado para listar carreras
const ORDER = [
  ...Array.from({length:13}, (_,i)=>`serie${i+1}`),
  ...Array.from({length:6},  (_,i)=>`repechaje${i+1}`),
  ...Array.from({length:4},  (_,i)=>`semifinal${i+1}`),
  'prefinal','final'
];

// Helpers DOM
const qs  = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

// Toast (si no existe en enhancements.js, creo uno simple)
function fallbackToast(msg) {
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
const showToast = (typeof window.showToast === 'function') ? window.showToast : fallbackToast;

// Fallback fetch JSON con 3 mirrors
async function fetchJSON(path) {
  const ts = Date.now();
  for (const base of BASES) {
    const url = `${base}/${path}?ts=${ts}`;
    try {
      const res = await fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (res.ok) return await res.json();
      // 404/429/5xx => pruebo siguiente base
    } catch (_) { /* sigo con el próximo */ }
  }
  throw new Error(`fetch-failed: ${path}`);
}

// Estado UI
function setStatus(text) {
  const el = qs('#status-badge');
  if (el) el.textContent = text;
}
function nowHHMMSS() {
  const d = new Date();
  const pad = n => `${n}`.padStart(2,'0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Render listas
function renderCarrerasList(fecha, keys) {
  const list = qs('#carrerasList');
  list.innerHTML = '';

  const ordered = [...keys].sort((a,b)=> ORDER.indexOf(a) - ORDER.indexOf(b));

  for (const k of ordered) {
    const li = document.createElement('li');
    li.className = 'race-item';
    li.textContent = RACE_LABELS[k] || k.toUpperCase();
    li.onclick = () => window.loadResults(fecha, k);
    list.appendChild(li);
  }
}

// Render resultados
function renderResultados(fecha, raceKey, data) {
  const cont = qs('#resultados');
  cont.innerHTML = '';

  const h = document.createElement('h2');
  h.className = 'race-title';
  h.textContent = `${RACE_LABELS[raceKey] || raceKey.toUpperCase()}`;
  cont.appendChild(h);

  // tabla
  const table = document.createElement('table');
  table.className = 'results-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>
    <th>Pos.</th><th>N°</th><th>Nombre</th><th>Total</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  let rows = data?.results || [];
  // zebra
  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');
    if (idx % 2) tr.classList.add('row-alt');
    tr.innerHTML = `
      <td>${r.position ?? ''}</td>
      <td>${r.number ?? ''}</td>
      <td>${r.name ?? ''}</td>
      <td>${r.t_final ?? ''}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  cont.appendChild(table);

  // Estado “Actualizado…”
  setStatus(`Actualizado: ${nowHHMMSS()} — ${fecha} — ${RACE_LABELS[raceKey] || raceKey.toUpperCase()}`);
}

// Skeletons
function showLoadingCarreras() {
  const list = qs('#carrerasList');
  list.innerHTML = '<li class="loading">Cargando carreras…</li>';
}
function showLoadingResultados() {
  const cont = qs('#resultados');
  cont.innerHTML = '<div class="loading">Cargando resultados…</div>';
}

// ================== CARGA INICIAL ==================
async function loadFechas() {
  const sel = qs('#selectFecha');
  sel.innerHTML = '<option value="">Cargando fechas…</option>';

  try {
    const fechas = await fetchJSON('fechas.json'); // ej: ["Fecha 01", "Fecha 02", ...]
    // limpio y cargo solo las existentes
    sel.innerHTML = '<option value="">Seleccionar Fecha…</option>';
    fechas.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    });

    // Si viene con ?fecha= en la URL, respetar
    const url = new URL(location.href);
    const fURL = url.searchParams.get('fecha');
    if (fURL && fechas.includes(fURL)) {
      sel.value = fURL;
      window.loadRaces(fURL);
    }
  } catch (err) {
    console.error('No se pudo cargar FECHAS.', err);
    showToast('No se pudo cargar FECHAS.');
    sel.innerHTML = '<option value="">(sin datos)</option>';
  }
}

// ================== API PÚBLICA (para index.html) ==================
async function loadRaces(fecha) {
  const f = fecha || qs('#selectFecha').value;
  if (!f) return;

  showLoadingCarreras();
  setStatus(`Cargando — ${f}`);

  try {
    const idx = await fetchJSON(`${encodeURIComponent(f)}/index.json`);
    // idx es un objeto con claves de carreras presentes (true)
    const keys = Object.keys(idx).filter(k => idx[k]);
    renderCarrerasList(f, keys);

    // si hay al menos una carrera, cargo la primera
    if (keys.length) {
      showLoadingResultados();
      await window.loadResults(f, keys[0]);
    } else {
      qs('#resultados').innerHTML = '<div class="empty">Sin carreras cargadas aún.</div>';
      setStatus(`Actualizado: ${nowHHMMSS()} — ${f} — (sin carreras)`);
    }
  } catch (err) {
    console.error(`No se pudo cargar INDEX de ${fecha}`, err);
    showToast(`No se pudo cargar INDEX de ${fecha}.`);
    qs('#carrerasList').innerHTML = '<li class="error">Error al cargar carreras</li>';
    qs('#resultados').innerHTML   = '';
    setStatus('Error al cargar');
  }
}

async function loadResults(fecha, raceKey) {
  if (!fecha || !raceKey) return;
  showLoadingResultados();

  try {
    const data = await fetchJSON(`${encodeURIComponent(fecha)}/${raceKey}.json`);
    renderResultados(fecha, raceKey, data);
  } catch (err) {
    console.error('Error cargando resultados:', err);
    showToast('No se pudo cargar resultados.');
    qs('#resultados').innerHTML = '<div class="error">No se pudo cargar esta carrera.</div>';
    setStatus('Error al cargar');
  }
}

// Exponer para on* del HTML
window.loadRaces   = loadRaces;
window.loadResults = loadResults;

// Ready
document.addEventListener('DOMContentLoaded', loadFechas);
</script>
