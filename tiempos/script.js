// == TIEMPOS APP (aislado) ==
(() => {
  // ---------- CONFIG ----------
  const BASES = [
    'https://raw.githubusercontent.com/jcheva123/tiemposweb-2025/main/resultados',
    'https://cdn.jsdelivr.net/gh/jcheva123/tiemposweb-2025@main/resultados',
    'https://cdn.statically.io/gh/jcheva123/tiemposweb-2025/main/resultados'
  ];

  const DEMO = new URLSearchParams(location.search).get('demo') === '1';
  const demoData = path => path === 'fechas.json' ? ['Fecha de ejemplo'] : path.endsWith('index.json') ? ['serie1','serie2','serie3','semifinal1','final'] : {results:[
    {position:1,number:7,name:'Piloto de ejemplo A',t_final:'1:18.984',laps:4},
    {position:2,number:24,name:'Piloto de ejemplo B',t_final:'1:19.326',laps:4},
    {position:3,number:18,name:'Piloto de ejemplo C',t_final:'1:20.052',laps:4,rec:1,penalty_note:'Recargo de ejemplo: cono'},
    {position:4,number:52,name:'Piloto de ejemplo D',t_final:'1:20.817',laps:4},
    {position:5,number:31,name:'Piloto de ejemplo E',t_final:'1:22.104',laps:4},
    {position:6,number:66,name:'Piloto de ejemplo F',t_final:'',laps:2,penalty_note:'Abandono de ejemplo'}]};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
    t.hidden = false;
    t.textContent = msg || '';
    t.style.opacity = '1';
    setTimeout(()=>{t.style.opacity='0';t.hidden=true;},3000);
  }
function setStatus(_) { /* no-op, oculto cualquier rastro */ }

  const pad2 = n => String(n).padStart(2,'0');
  const fmtDateTime = d => new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d);

  // ---------- HELPERS ----------
  async function fetchJSON(path){
    if(DEMO) return demoData(path);
    const ts = Date.now();
    for(const base of BASES){
      const url = `${base}/${path}?ts=${ts}`;
      try{
        const r = await fetch(url, {cache:'no-store',signal:AbortSignal.timeout(8000)});
        if(r.ok) return await r.json();
      }catch{}
    }
    throw new Error(`fetch-failed: ${path}`);
  }

  async function fetchJSONWithMeta(path){
    if(DEMO) return {data:demoData(path),lastModified:null};
    const ts = Date.now();
    for(const base of BASES){
      const url = `${base}/${path}?ts=${ts}`;
      try{
        const r = await fetch(url, {cache:'no-store',signal:AbortSignal.timeout(8000)});
        if(!r.ok) continue;
        const data = await r.json();
        const lm = r.headers.get('Last-Modified');
        return { data, lastModified: lm, url };
      }catch{}
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

  async function pickLatestRaceByLM(fecha, keys){
    const tasks = keys.map(async k => {
      try{
        const meta = await fetchJSONWithMeta(`${encodeURIComponent(fecha)}/${k}.json`);
        const t = meta.lastModified ? Date.parse(meta.lastModified) : 0;
        return { k, t, meta };
      }catch{
        return { k, t:0, meta:null };
      }
    });
    const results = await Promise.all(tasks);
    results.sort((a,b)=> b.t - a.t);
    const best = results[0];
    if(best && best.t>0) return { key: best.k, meta: best.meta };
    const orderPos = k => ORDER.indexOf(k)===-1 ? 999 : ORDER.indexOf(k);
    const sorted = [...keys].sort((a,b)=> orderPos(a)-orderPos(b));
    return { key: sorted[sorted.length-1], meta: null };
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
      const button=document.createElement('button');
      button.type='button';button.textContent=RACE_LABELS[k]||k.toUpperCase();
      li.appendChild(button);
      ul.appendChild(li);
    }
    highlightSelected();
  }
  function highlightSelected(){
    const items=[...document.querySelectorAll('#race-list ul .race-item')];
    items.forEach(li=>{
      li.classList.toggle('active', li.dataset.race===STATE.race);
    });
  }

  function formatSec(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
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
    if (typeof r.rec === 'number' && isFinite(r.rec) && r.rec > 0 && r.rec < 30) {
      return formatSec(r.rec);
    }
    if (typeof r.rec === 'string' && r.rec && !r.rec.includes(':')) {
      const n = parseFloat(r.rec.replace(',', '.'));
      if (!isNaN(n) && n > 0 && n < 30) return formatSec(n);
    }
    const base  = parseTimeStr(r.rec_str || r.tiempo || r.time);
    const final = parseTimeStr(r.t_final || r.final);
    if (isFinite(base) && isFinite(final)) {
      const diff = final - base;
      if (diff > 0.2 && diff < 30) return formatSec(diff);
    }
    if (typeof r.penalty === 'number' && r.penalty > 0 && r.penalty < 30) {
      return formatSec(r.penalty);
    }
    if (typeof r.penalty_note === 'string') {
      const s = r.penalty_note.toLowerCase();
      const m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:s|seg|segundos)/);
      if (m) {
        const n = parseFloat(m[1].replace(',', '.'));
        if (!isNaN(n) && n > 0 && n < 30) return formatSec(n);
      }
      if (s.includes('cono')) return formatSec(1);
    }
    return '';
  }

  function renderResultsTable(data){
    let tbody = document.querySelector('#results tbody') || document.querySelector('#resultados tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    const rows = data?.results || [];
    rows.forEach((r,i)=>{
      const tr=document.createElement('tr');
      if(i%2) tr.classList.add('row-alt');
      tr.innerHTML = `<td colspan="3"><details class="result-detail"><summary><span class="result-pos">${esc(r.position)}</span><span class="result-pilot"><strong>${esc(r.name)}</strong><small>N° ${esc(r.number)}</small></span><span class="result-time">${esc(r.t_final || '—')}<small>VER DETALLE +</small></span></summary><div class="result-extra"><div>VUELTAS<strong>${esc(r.laps ?? '—')}</strong></div><div>RECARGO<strong>${esc(formatRecargo(r) || 'Sin recargo')}</strong></div><div class="wide">OBSERVACIONES<strong>${esc(r.penalty_note || 'Sin observaciones')}</strong></div></div></details></td>`;
      tbody.appendChild(tr);
      const query=document.querySelector('#results-search')?.value.trim().toLowerCase();
      if(query) tr.hidden=!tr.textContent.toLowerCase().includes(query);
    });
  }

  function updateMeta(fecha, raceKey, lastModifiedStr){
    const pill=document.querySelector('#selected-pill');
    const upd =document.querySelector('#last-updated');
    if(pill){
      pill.textContent=`${fecha} — ${RACE_LABELS[raceKey]||raceKey.toUpperCase()}`;
      pill.hidden=false;
    }
    if(upd){
      const when = lastModifiedStr ? fmtDateTime(new Date(lastModifiedStr)) : fmtDateTime(new Date());
      const label = lastModifiedStr ? 'Archivo actualizado' : 'Consultado';
      upd.textContent = DEMO ? 'Datos de ejemplo · Vista de diseño' : `${label}: ${when}`;
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

      // 1) ?fecha=… tiene prioridad
      const url=new URL(location.href);
      const fURL=url.searchParams.get('fecha');
      if(fURL && fechas.includes(fURL)){
        sel.value=fURL;
        await loadRaces(fURL, { autoPickLatest:true });
        return;
      }

      // 2) Sin parámetro → última fecha
      const lastFecha = fechas[fechas.length-1];
      sel.value = lastFecha;
      await loadRaces(lastFecha, { autoPickLatest:true });
    }catch(e){
      console.error('No se pudo cargar FECHAS', e);
      toast('No se pudieron cargar FECHAS.');
      sel.innerHTML='<option value="">No se pudieron cargar las fechas</option>';
      document.querySelector('#results tbody').innerHTML='<tr><td colspan="3" class="error">No pudimos consultar los resultados. Tocá Actualizar para reintentar o abrí la vista con datos de ejemplo.</td></tr>';
    }
  }

  async function loadRaces(fecha, opts={}){
    const { autoPickLatest=false } = opts;
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

      if(!keys.length){
        const tbody=document.querySelector('#results tbody');
        if(tbody) tbody.innerHTML='<tr><td colspan="3" class="empty">Sin carreras cargadas aún.</td></tr>';
        setStatus(`Actualizado — ${f} (sin carreras)`);
        return;
      }

      const savedRace=new URL(location.href).searchParams.get('carrera');
      if(keys.includes(savedRace)){await loadResults(f,savedRace);return;}
      if (autoPickLatest) {
        const { key: latestKey, meta } = await pickLatestRaceByLM(f, keys);
        await loadResults(f, latestKey, { prefetched: meta });
      } else {
        await loadResults(f, keys[0]);
      }
    }catch(err){
      console.error(`No se pudo cargar INDEX de ${f}`, err);
      toast(`No se pudo cargar INDEX de ${f}.`);
      if(ul) ul.innerHTML='<li class="error">Error al cargar carreras</li>';
      setStatus('Error al cargar');
    }
  }

  async function loadResults(fecha, raceKey, opts={}){
    const f = fecha || STATE.fecha;
    const k = raceKey;
    if(!f || !k) return;

    STATE.fecha=f; STATE.race=k; highlightSelected();
    const url=new URL(location.href);url.searchParams.set('fecha',f);url.searchParams.set('carrera',k);history.replaceState(null,'',url);

    try{
      let meta = opts.prefetched;
      if(!meta){
        meta = await fetchJSONWithMeta(`${encodeURIComponent(f)}/${k}.json`);
      }
      const data = meta.data;
      renderResultsTable(data);
      updateMeta(f, k, meta.lastModified || null);
      setStatus(meta.lastModified
        ? `Cargado: ${fmtDateTime(new Date(meta.lastModified))} — ${f} — ${RACE_LABELS[k]||k.toUpperCase()}`
        : `Actualizado: ${fmtDateTime(new Date())} — ${f} — ${RACE_LABELS[k]||k.toUpperCase()}`
      );
    }catch(err){
      console.error('Error cargando resultados:', err);
      toast('No se pudo cargar resultados.');
      const tbody=document.querySelector('#results tbody');
      if(tbody) tbody.innerHTML='<tr><td colspan="3" class="error">No se pudo cargar esta carrera.</td></tr>';
      setStatus('Error al cargar');
    }
  }

  // ---------- EVENTS ----------
  document.addEventListener('DOMContentLoaded', () => {
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
          await loadRaces(STATE.fecha, { autoPickLatest:true });
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
          tr.hidden = !tr.textContent.toLowerCase().includes(q);
        });
      });
    }

    if(DEMO) document.getElementById('demo-notice').hidden=false;
    window.addEventListener('offline',()=>document.getElementById('offline-banner').hidden=false);
    window.addEventListener('online',()=>document.getElementById('offline-banner').hidden=true);
    document.getElementById('offline-banner').hidden=navigator.onLine;
    // Carga inicial: última fecha + última carrera
    loadFechas();
  });

  // ---------- API pública ----------
  window.loadRaces   = loadRaces;
  window.loadResults = loadResults;
})();

