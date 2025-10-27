/* enhancements.js (safe, idempotente) */
(() => {
  if (window.__ENH_LOADED__) return;           // guard: no doble carga
  window.__ENH_LOADED__ = true;

  // Helpers locales (no contaminan global)
  const qs  = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => [...el.querySelectorAll(s)];
  const on  = (t, f, el = window, o) => el.addEventListener(t, f, o);

  // Toast (expone UNA sola vez en window)
  if (!window.showToast) {
    const el = document.getElementById('toast') || (() => {
      const d = document.createElement('div');
      d.id = 'toast'; d.hidden = true;
      Object.assign(d.style, {
        position:'fixed', left:'50%', bottom:'18px', transform:'translateX(-50%)',
        background:'rgba(30,35,38,.95)', border:'1px solid rgba(255,255,255,.18)',
        color:'#fff', padding:'10px 14px', borderRadius:'10px', boxShadow:'0 6px 24px rgba(0,0,0,.35)',
        zIndex:'1001', maxWidth:'90vw'
      });
      document.body.appendChild(d);
      return d;
    })();

    window.showToast = (msg, ms = 2200) => {
      try {
        el.textContent = String(msg);
        el.hidden = false;
        clearTimeout(window.__TOAST_T__);
        window.__TOAST_T__ = setTimeout(() => (el.hidden = true), ms);
      } catch { alert(String(msg)); }
    };
  }

  // Dedupe lista de carreras (defensivo)
  function dedupeRaceList() {
    const ul = qs('#race-list ul'); if (!ul) return;
    const seen = new Set();
    [...ul.children].forEach(li => {
      const k = li.textContent.trim().toLowerCase();
      if (seen.has(k)) li.remove(); else seen.add(k);
    });
  }
  document.getElementById('fecha-select')?.addEventListener('change', () => {
    setTimeout(dedupeRaceList, 0);
  });

  // UX: resaltar <li> y hacer scroll a resultados
  on('click', (e) => {
    const li = e.target.closest('#race-list li');
    if (!li) return;
    qsa('#race-list li').forEach(el => el.classList.remove('active'));
    li.classList.add('active');
    qs('#results')?.scrollIntoView({ behavior:'smooth', block:'start' });
  }, document);

  // Enriquecer loadResults UNA sola vez (muestra “Actualizado:” si script.js lo setea)
  if (typeof window.loadResults === 'function' && !window.__WRAP_LOADRES__) {
    window.__WRAP_LOADRES__ = true;
    const orig = window.loadResults;
    const $pill = document.getElementById('selected-pill') || (() => {
      const s = document.createElement('span'); s.id = 'selected-pill'; s.hidden = true;
      document.querySelector('.meta-row')?.appendChild(s); return s;
    })();
    const $last = document.getElementById('last-updated') || (() => {
      const s = document.createElement('span'); s.id = 'last-updated'; s.hidden = true;
      document.querySelector('.meta-row')?.appendChild(s); return s;
    })();

    function prettyRaceName(r) {
      return r.replace(/^serie(\d+)$/,'Serie $1')
              .replace(/^repechaje(\d+)$/,'Repechaje $1')
              .replace(/^semifinal(\d+)$/,'Semifinal $1')
              .replace('prefinal','Prefinal').replace('final','Final');
    }

    window.loadResults = async (fecha, race) => {
      $pill.hidden = false;
      $pill.textContent = `${fecha} · ${prettyRaceName(race)}`;
      try {
        await orig(fecha, race);
        // script.js setea #last-updated; acá solo nos aseguramos de que se vea
        $last.hidden = false;
      } catch (e) {
        window.showToast?.('No se pudieron cargar los resultados.');
        throw e;
      }
    };
  }
})();
