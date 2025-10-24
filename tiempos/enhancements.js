// enhancements.js (robusto, sin override de fetch y sin auto-refresh)

// Helpers
const qs = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => [...el.querySelectorAll(s)];
const on  = (t, f, el = window, o) => el.addEventListener(t, f, o);

// ===== Ensure required UI nodes exist (self-healing) =====
function ensureEl(id, tag = 'div', attrs = {}) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    document.body.appendChild(el);
  }
  return el;
}

const progress      = ensureEl('progress');
const offlineBanner = ensureEl('offline-banner');
const toastEl       = ensureEl('toast');

Object.assign(progress.style, {
  position: 'sticky', top: '0', left: '0', right: '0', height: '3px',
  background: 'linear-gradient(90deg, #ff4444, #ffffff)', transform: 'scaleX(0)',
  transformOrigin: 'left', transition: 'transform .25s ease', zIndex: '1000'
});
Object.assign(offlineBanner.style, {
  position: 'sticky', top: '0', zIndex: '1000', background: '#9a2a2a', color: '#fff',
  textAlign: 'center', padding: '6px 10px', fontSize: '.9rem',
  borderBottom: '1px solid rgba(255,255,255,.2)'
});
toastEl.hidden = true;
Object.assign(toastEl.style, {
  position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)',
  background: 'rgba(30,35,38,.95)', border: '1px solid rgba(255,255,255,.18)',
  color: '#fff', padding: '10px 14px', borderRadius: '10px',
  boxShadow: '0 6px 24px rgba(0,0,0,.35)', zIndex: '1001', maxWidth: '90vw'
});

function showToast(msg, ms = 2200) {
  try {
    toastEl.textContent = String(msg);
    toastEl.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toastEl.hidden = true), ms);
  } catch {
    // fallback duro si algo raro pasa
    alert(String(msg));
  }
}

// Online/Offline indicator
const updateOnlineUI = () => (offlineBanner.hidden = navigator.onLine);
updateOnlineUI();
on('online', updateOnlineUI);
on('offline', updateOnlineUI);

// ===== Progress helpers (sin tocar fetch global) =====
let _busy = 0;
function beginBusy() {
  if (++_busy === 1) progress.style.transform = 'scaleX(1)';
}
function endBusy() {
  if (_busy > 0 && --_busy === 0) progress.style.transform = 'scaleX(0)';
}

// ===== Dedupe “Carreras Disponibles” y UX =====
function dedupeRaceList() {
  const ul = qs('#race-list ul'); if (!ul) return;
  const seen = new Set();
  [...ul.children].forEach(li => {
    const key = li.textContent.trim().toLowerCase();
    if (seen.has(key)) li.remove();
    else seen.add(key);
  });
}

document.getElementById('fecha-select')?.addEventListener('change', () => {
  setTimeout(dedupeRaceList, 0);
});

// Resaltar <li> al click y hacer scroll suave a resultados
on('click', (e) => {
  const li = e.target.closest('#race-list li');
  if (!li) return;
  qsa('#race-list li').forEach(el => el.classList.remove('active'));
  li.classList.add('active');
  qs('#results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}, document);

// ===== Wrap de loadResults para progreso + “pill” + timestamp =====
(function wrapLoadResults() {
  if (typeof window.loadResults !== 'function') return;

  const selectedPill = ensureEl('selected-pill', 'span');
  const lastUpdated  = ensureEl('last-updated', 'span');
  selectedPill.hidden = true;
  lastUpdated.hidden  = true;

  function prettyRaceName(race) {
    return race
      .replace(/^serie(\d+)$/, 'Serie $1')
      .replace(/^repechaje(\d+)$/, 'Repechaje $1')
      .replace(/^semifinal(\d+)$/, 'Semifinal $1')
      .replace('prefinal', 'Prefinal')
      .replace('final', 'Final');
  }

  const orig = window.loadResults;
  window.loadResults = async (fecha, race) => {
    // UI pre
    selectedPill.hidden = false;
    selectedPill.textContent = `${fecha} · ${prettyRaceName(race)}`;
    beginBusy();

    try {
      await orig(fecha, race);
      lastUpdated.hidden = false;
      lastUpdated.textContent = `Actualizado: ${new Date().toLocaleTimeString()}`;
    } catch (e) {
      showToast('No se pudieron cargar los resultados.');
      throw e;
    } finally {
      endBusy();
    }
  };
})();
