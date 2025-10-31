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

  const pad2 = n => String(n).padStart(2,'0');
  const fmtDateTime = d => `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

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

  // Igual que fetchJSON pero devolviendo meta (Last-Modified y URL origen)
  async function fetchJSONWithMeta(path){
    const ts = Date.now();
    for(const base of BASES){
      const url = `${base}/${path}?ts=${ts}`;
      try{
        const r = await fetch(url, {cache:'no-store'});
        if(!r.ok) continue;
        const data = await r.json();
        const lm = r.headers.get('Last-Modified'); // simple response header => accesible CORS
        return { data, lastModified: lm, url };
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

  // Escoge la carrera con mayor Last-Modified (descarga liviana de cada JSON)
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
    results.sort((a,b)=> b.t - a.t); // más reciente primero
    const best = results[0];
    if(best && best.t>0) return { key: best.k, meta: best.meta };
    // Fallback si no se pudo leer LM: tomamos el último en el orden predefinido
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
      li.textContent=RACE_LABELS[k]||k.toUpperCase();
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
      tr.innerHTML = `
        <td>${r.position ?? ''}</td>
        <td>${r.number ?? ''}</td>
        <td>${r.name ?? ''}</td>
        <td>${formatRecargo(r)}</td>
        <td>${r.t_final ?? ''}</td>
        <td>${r.laps ?? ''}</td>
        <td>${r.penalty_note ?? ''}</td>
      `;
      tbody.appendChild(tr);
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
      upd.textContent = `${label}`;
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

      // 1) Si hay ?fecha= en la URL, respetar
      const url=new URL(location.href);
      const fURL=url.searchParams.get('fecha');
      if(fURL && fechas.includes(fURL)){
        sel.value=fURL;
        await loadRaces(fURL, { autoPickLatest:true });
        return;
      }

      // 2) Si no hay param, cargar la última fecha disponible automáticamente
      const lastFecha = fechas[fechas.length-1];
      sel.value = lastFecha;
      await loadRaces(lastFecha, { autoPickLatest:true });
    }catch(e){
      console.error('No se pudo cargar FECHAS', e);
      toast('No se pudieron cargar FECHAS.');
      sel.innerHTML='<option value="">(sin datos)</option>';
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
        if(tbody) tbody.innerHTML='<tr><td colspan="7" class="empty">Sin carreras cargadas aún.</td></tr>';
        return;
      }

      // Elegir qué mostrar:
      if (autoPickLatest) {
        const { key: latestKey, meta } = await pickLatestRaceByLM(f, keys);
        await loadResults(f, latestKey, { prefetched: meta }); // usa meta si ya lo tenemos
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

    try{
      // Si viene prefetched (desde pickLatest) lo reutilizo; si no, lo busco ahora
      let meta = opts.prefetched;
      if(!meta){
        meta = await fetchJSONWithMeta(`${encodeURIComponent(f)}/${k}.json`);
      }
      const data = meta.data;
      renderResultsTable(data);
      updateMeta(f, k, meta.lastModified || null);
      setStatus(meta.lastModified
        ? `Cargado: ${fmtDateTime(new Date(meta.lastModified))} — ${f} — ${RACE_LABELS[k]||k.toUpperCase()}`
      );
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
    // Delegación de clicks
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
          tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    }

    // Carga inicial: ya auto-selecciona última fecha + última carrera
    loadFechas();
  });

  // ---------- API pública para el HTML inline ----------
  window.loadRaces   = loadRaces;
  window.loadResults = loadResults;
})();



