
// == TIEMPOS APP (aislado) ==
(() => {
  // ---------- CONFIG ----------
  const BASES = [
    'https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/resultados',
    'https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main/resultados',
    'https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main/resultados'
  ];

  const RACE_LABELS = { prefinal: 'PREFINAL', final: 'FINAL' };
  for (let i=1;i<=13;i++) RACE_LABELS[`serie${i}`] = `SERIE ${i}`;
  for (let i=1;i<=6;i++)  RACE_LABELS[`repechaje${i}`] = `REPECHAJE ${i}`;
  for (let i=1;i<=4;i++)  RACE_LABELS[`semifinal${i}`] = `SEMIFINAL ${i}`;

  const ORDER = [
    ...Array.from({length:13},(_,i)=>`serie${i+1}`),
    ...Array.from({length:6}, (_,i)=>`repechaje${i+1}`),
    ...Array.from({length:4}, (_,i)=>`semifinal${i+1}`),
    'prefinal','final'
  ];

  // ---------- SHIMS ----------
  function toast(msg){
    let t = document.querySelector('#toast');
    if(!t){
      t = document.createElement('div');
      t.id='toast';
      t.style.cssText='position:fixed;left:50%;bottom:16px;transform:translateX(-50%);padding:8px 12px;background:#222;color:#fff;border-radius:8px;font:600 14px system-ui;z-index:9999;opacity:0;transition:opacity .2s';
      document.body.appendChild(t);
    }
    t.textContent = msg || '';
    t.style.opacity = '1';
    setTimeout(()=>t.style.opacity='0',1600);
  }
  function setStatus(text){
    const el = document.querySelector('#last-updated') || document.querySelector('#status-badge');
    if(!el) return;
    if(text && String(text).trim()){ el.hidden=false; el.textContent=text; }
    else { el.hidden=true; el.textContent=''; }
  }
  const nowLabel = () => {
    const d=new Date(), p=n=>String(n).padStart(2,'0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  // ---------- HELPERS ----------
  async function fetchJSON(path){
    const ts = Date.now();
    for(const base of BASES){
      const url = `${base}/${path}?ts=${ts}`;
      try{
        const r = await fetch(url, {cache:'no-store'});
        if(r.ok) return await r.json();
      }catch{ /* probar siguiente base */ }
    }
    throw new Error(`fetch-failed: ${path}`);
  }
  const fechaSort = (a,b)=>{
    const na=parseInt(String(a).replace(/\D+/g,''),10)||0;
    const nb=parseInt(String(b).replace(/\D+/g,''),10)||0;
    return na-nb;
  };
  function normalizeFechas(raw){
    if(!raw) return [];
    if(Array.isArray(raw)) return raw;
    if(raw && Array.isArray(raw.fechas)) return raw.fechas;
    if(typeof raw==='object') return Object.keys(raw).filter(k=>/^fecha\s*\d+/i.test(k));
    try{ return normalizeFechas(JSON.parse(raw)); }catch{ return []; }
  }
  const RACE_KEY_RE=/^(?:serie(?:0?[1-9]|1[0-3])|repechaje[1-6]|semifinal[1-4]|prefinal|final)$/i;
  const toRaceKey = s=>{
    if(s==null) return null;
    s=String(s).trim().toLowerCase().replace(/\s+/g,'');
    return RACE_KEY_RE.test(s) ? s : null;
  };
  function normalizeIndex(raw){
    if(!raw) return [];
    if(Array.isArray(raw)) return raw.map(toRaceKey).filter(Boolean);
    if(raw && raw.races!=null){
      const r=raw.races;
      if(Array.isArray(r)) return r.map(toRaceKey).filter(Boolean);
      if(typeof r==='object') return Object.keys(r).map(toRaceKey).filter(Boolean);
    }
    if(typeof raw==='object'){
      return Object.keys(raw).map(toRaceKey).filter(Boolean).filter(k=>{
        const v=raw[k];
        return v===true || (v && typeof v==='object');
      });
    }
    try{ return normalizeIndex(JSON.parse(raw)); }catch{ return []; }
  }

  // ---------- STATE ----------
  const STATE = { fecha:null, race:null };

  // ---------- RENDER ----------
  function renderRaceList(fecha, keys){
    const ul = document.querySelector('#race-list ul');
    if(!ul) return;
    ul.innerHTML='';

    const ordered=[...keys].sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b));
    for(const k of ordered){
      const li=document.createElement('li');
      li.className='race-item';
      li.dataset.race=k;
      li.textContent=RACE_LABELS[k]||k.toUpperCase();
      ul.appendChild(li);
    }
    // destacar si ya había seleccionada
    highlightSelected();
  }
  function highlightSelected(){
    const items=[...document.querySelectorAll('#race-list ul .race-item')];
    items.forEach(li=>{
      li.classList.toggle('active', li.dataset.race===STATE.race);
    });
  }

function formatSec(n) {
  // Si es entero (1, 2) muestro "1s", "2s"; si no, 3 decimales.
  if (Math.abs(n - Math.round(n)) < 1e-6) return `${Math.round(n)}s`;
  return `${Number(n).toFixed(3)}s`;
}

function formatSec(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  // si es entero → "2s", si no → "1.250s"
  return Math.abs(n - Math.round(n)) < 1e-6 ? `${Math.round(n)}s` : `${n.toFixed(3)}s`;
}

function parseTimeStr(s){
  if (!s || typeof s !== 'string') return NaN;
  const m = s.trim().match(/^(\d+):([0-5]?\d)(?:[.,](\d{1,3}))?$/);
  if (!m) return NaN;
  const min = parseInt(m[1], 10);
  const sec = parseInt(m[2], 10);
  const ms  = parseInt((m[3] || '0').padEnd(3, '0'), 10);
  return min * 60 + sec + ms / 1000;
}

function formatRecargo(r) {
  // 0) Si viene numérico explícito (mejor de backend)
  if (typeof r.rec === 'number' && isFinite(r.rec) && r.rec > 0 && r.rec < 30) {
    return formatSec(r.rec);
  }
  if (typeof r.rec === 'string' && r.rec && !r.rec.includes(':')) {
    const n = parseFloat(r.rec.replace(',', '.'));
    if (!isNaN(n) && n > 0 && n < 30) return formatSec(n);
  }

  // 1) Derivar de tiempos (preferido hoy): t_final - rec_str
  const base  = parseTimeStr(r.rec_str || r.tiempo || r.time);
  const final = parseTimeStr(r.t_final || r.final);
  if (isFinite(base) && isFinite(final)) {
    const diff = final - base;
    if (diff > 0.2 && diff < 30) return formatSec(diff);
  }

  // 2) Fallback a 'penalty' numérico si existiera
  if (typeof r.penalty === 'number' && r.penalty > 0 && r.penalty < 30) {
    return formatSec(r.penalty);
  }

  // 3) Fallback desde penalty_note: “2 s”, “1,5 seg”, etc.
  if (typeof r.penalty_note === 'string') {
    const s = r.penalty_note.toLowerCase();
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:s|seg|segundos)/);
    if (m) {
      const n = parseFloat(m[1].replace(',', '.'));
      if (!isNaN(n) && n > 0 && n < 30) return formatSec(n);
    }
    // Si solo dice "cono(s)" sin número, asumimos 1s
    if (s.includes('cono')) return formatSec(1);
  }

  // Nada confiable → vacío
  return '';
}



  // Candidatos típicos que pueden traer el recargo
  const candidates = [
    r.rec, r.recargo,              // columnas “rec” o “recargo”
    r.penalty, r.penalty_seconds,  // numérico directo
    r.rec_str, r.recargo_str,      // a veces viene en string
    r.penalty_note                 // “Recargo 2s”, “+1.5 seg”, etc.
  ];

  for (const c of candidates) {
    const secs = extractSeconds(c);
    if (secs != null) return formatSec(secs);
  }

  // Sin recargo detectable → mostrar como antes un punto
  return '.';
}


function renderResultsTable(data){
  const tbody = document.querySelector('#results tbody');
  tbody.innerHTML = '';
  const rows = data?.results || [];

  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i % 2) tr.classList.add('row-alt');
    tr.innerHTML = `
      <td>${r.position ?? ''}</td>
      <td>${r.number ?? ''}</td>
      <td>${r.name ?? ''}</td>
      <td>${formatRecargo(r)}</td>   <!-- AQUÍ va la llamada -->
      <td>${r.t_final ?? ''}</td>
      <td>${r.laps ?? ''}</td>
      <td>${r.penalty_note ?? ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

  function updateMeta(fecha, raceKey){
    const pill=document.querySelector('#selected-pill');
    const upd =document.querySelector('#last-updated');
    if(pill){
      pill.textContent=`${fecha} — ${RACE_LABELS[raceKey]||raceKey.toUpperCase()}`;
      pill.hidden=false;
    }
    if(upd){
      upd.textContent=`Actualizado: ${nowLabel()} — ${fecha} — ${RACE_LABELS[raceKey]||raceKey.toUpperCase()}`;
      upd.hidden=false;
    }
  }

  // ---------- LOADERS ----------
  async function loadFechas(){
    const sel=document.querySelector('#fecha-select');
    if(!sel) return;
    sel.innerHTML='<option value="">Cargando fechas…</option>';
    try{
      const raw = await fetchJSON('fechas.json');
      let fechas = normalizeFechas(raw);
      fechas = Array.from(new Set(fechas)).sort(fechaSort);
      if(!fechas.length) throw new Error('fechas-vacias');

      sel.innerHTML='<option value="">-- Elegir Fecha --</option>';
      for(const f of fechas){
        const opt=document.createElement('option');
        opt.value=f; opt.textContent=f;
        sel.appendChild(opt);
      }
      const url=new URL(location.href);
      const fURL=url.searchParams.get('fecha');
      if(fURL && fechas.includes(fURL)){
        sel.value=fURL;
        await loadRaces(fURL);
      }
    }catch(e){
      console.error('No se pudo cargar FECHAS', e);
      toast('No se pudieron cargar FECHAS.');
      sel.innerHTML='<option value="">(sin datos)</option>';
    }
  }

  async function loadRaces(fecha){
    const f = fecha || document.querySelector('#fecha-select')?.value;
    if(!f) return;
    STATE.fecha=f; STATE.race=null;

    const ul=document.querySelector('#race-list ul');
    if(ul) ul.innerHTML='<li class="loading">Cargando carreras…</li>';
    setStatus(`Cargando — ${f}`);

    try{
      const idxRaw = await fetchJSON(`${encodeURIComponent(f)}/index.json`);
      let keys = normalizeIndex(idxRaw);
      const orderPos = k => ORDER.indexOf(k)===-1 ? 999 : ORDER.indexOf(k);
      keys = Array.from(new Set(keys)).sort((a,b)=>orderPos(a)-orderPos(b));

      renderRaceList(f, keys);

      const first = keys[0];
      if(!first){
        // limpia tabla
        const tbody=document.querySelector('#results tbody');
        if(tbody) tbody.innerHTML='<tr><td colspan="7" class="empty">Sin carreras cargadas aún.</td></tr>';
        setStatus(`Actualizado: ${nowLabel()} — ${f} — (sin carreras)`);
        return;
      }
      await loadResults(f, first);  // auto-cargar primera
    }catch(err){
      console.error(`No se pudo cargar INDEX de ${f}`, err);
      toast(`No se pudo cargar INDEX de ${f}.`);
      if(ul) ul.innerHTML='<li class="error">Error al cargar carreras</li>';
      setStatus('Error al cargar');
    }
  }

  async function loadResults(fecha, raceKey){
    const f = fecha || STATE.fecha;
    const k = raceKey;
    if(!f || !k) return;

    // marca selección
    STATE.fecha=f; STATE.race=k; highlightSelected();

    try{
      const data = await fetchJSON(`${encodeURIComponent(f)}/${k}.json`);
      renderResultsTable(data);
      updateMeta(f, k);
      setStatus(`Actualizado: ${nowLabel()} — ${f} — ${RACE_LABELS[k]||k.toUpperCase()}`);
    }catch(err){
      console.error('Error cargando resultados:', err);
      toast('No se pudo cargar resultados.');
      const tbody=document.querySelector('#results tbody');
      if(tbody) tbody.innerHTML='<tr><td colspan="7" class="error">No se pudo cargar esta carrera.</td></tr>';
      setStatus('Error al cargar');
    }
  }

  // ---------- EVENTS ----------
  document.addEventListener('DOMContentLoaded', () => {
    // Delegación de clicks para no perder handlers
    const ul = document.querySelector('#race-list ul');
    if(ul){
      ul.addEventListener('click', (ev)=>{
        const li = ev.target.closest('.race-item');
        if(!li) return;
        const raceKey = li.dataset.race;
        if(raceKey) loadResults(STATE.fecha, raceKey);
      });
    }

    const btn = document.querySelector('#update-btn');
    if(btn){
      btn.addEventListener('click', async ()=>{
        if(STATE.fecha){
          await loadRaces(STATE.fecha);
          if(STATE.race) await loadResults(STATE.fecha, STATE.race);
        }else{
          await loadFechas();
        }
      });
    }

    const search = document.querySelector('#results-search');
    if(search){
      search.addEventListener('input', ()=>{
        const q = search.value.trim().toLowerCase();
        const rows = document.querySelectorAll('#results tbody tr');
        rows.forEach(tr=>{
          tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    }

    loadFechas();
  });

  // ---------- API pública para el HTML inline ----------
  window.loadRaces   = loadRaces;
  window.loadResults = loadResults;
})();







