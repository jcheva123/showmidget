// posiciones.v2.js — dark, líder destacado, zebra rows; SOLO: Pos, N°, Nombre, Total
const STATE = { rows: [], sortKey: 'pos', sortDir: 'asc', leader: null };

function fmt(n){ if(n==null) return ''; return Number.isInteger(n)? String(n) : Number(n).toFixed(2); }
function safe(s){ return (s==null?'':String(s)); }

function computeLeader(){
  // 1) Preferir el de menor 'pos'; 2) si no hay pos, el de mayor 'total'
  let leader = null;
  const withPos = STATE.rows.filter(r => typeof r.pos === 'number');
  if(withPos.length){
    leader = withPos.sort((a,b)=> a.pos - b.pos || (b.total ?? -Infinity) - (a.total ?? -Infinity))[0];
  } else {
    const withTotal = STATE.rows.filter(r => typeof r.total === 'number');
    if(withTotal.length){
      leader = withTotal.sort((a,b)=> (b.total ?? -Infinity) - (a.total ?? -Infinity))[0];
    }
  }
  STATE.leader = leader ? { nro: leader.nro, nombre: leader.nombre } : null;
}

function renderMeta(meta){
  const el = document.getElementById('meta');
  if(!el) return;
  const parts = [];
  if (meta.fechas_cumplidas) parts.push(`Cumplidas ${meta.fechas_cumplidas} fechas`);
  if (meta.extracted_at_utc) parts.push(`Actualizado: ${meta.extracted_at_utc}`);
  el.textContent = parts.join(' • ');
}

function renderTable(rows){
  const tb = document.querySelector('#tbl tbody');
  tb.innerHTML = '';
  for(const r of rows){
    const tr = document.createElement('tr');
    const isLeader = STATE.leader && r.nro === STATE.leader.nro && r.nombre === STATE.leader.nombre;
    if(isLeader) tr.classList.add('leader');
    tr.innerHTML = `
      <td class="c">${fmt(r.pos)}</td>
      <td class="c">${fmt(r.nro)}</td>
      <td class="name">${safe(r.nombre)}</td>
      <td class="c strong">${fmt(r.total)}</td>
    `;
    tb.appendChild(tr);
  }
}

function sortRows(rows, key, dir){
  const mult = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a,b)=>{
    const va = (key==='nombre') ? safe(a[key]).toLowerCase() : a[key];
    const vb = (key==='nombre') ? safe(b[key]).toLowerCase() : b[key];
    if (va==null && vb==null) return 0;
    if (va==null) return 1;
    if (vb==null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
    return String(va).localeCompare(String(vb)) * mult;
  });
}

function applyFilter(){
  const q = (document.getElementById('results-search').value || '').trim().toLowerCase();
  let rows = STATE.rows;
  if(q){
    rows = rows.filter(r =>
      String(r.nro||'').includes(q) ||
      String(r.pos||'').includes(q) ||
      (r.nombre||'').toLowerCase().includes(q)
    );
  }
  rows = sortRows(rows, STATE.sortKey, STATE.sortDir);
  renderTable(rows);
}

async function loadJSON(){
  const url = new URL('posiciones.json', window.location.href).toString();
  try{
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const data = await res.json();
    if(!data || !Array.isArray(data.standings)) throw new Error('JSON sin "standings"');
    STATE.rows = data.standings.map(r => ({
      pos: (typeof r.pos === 'number') ? r.pos : (r.pos ? Number(r.pos) : null),
      nro: (typeof r.nro === 'number') ? r.nro : (r.nro ? Number(r.nro) : null),
      nombre: r.nombre ?? '',
      total: (typeof r.total === 'number') ? r.total : (r.total ? Number(r.total) : null)
    }));
    computeLeader();
    renderMeta(data.meta || {});
    applyFilter();
  }catch(err){
    console.error('No se pudo cargar posiciones.json', err);
    const tb = document.querySelector('#tbl tbody');
    tb.innerHTML = `<tr><td colspan="4" style="color:#ffb3b3">
      No se pudo cargar <code>posiciones.json</code>.<br>
      <small>${err.message}. Si abriste el archivo con doble-click (file://), levantá un servidor local.</small>
    </td></tr>`;
  }
}

function setupSort(){
  document.querySelectorAll('#tbl thead th').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const k = th.dataset.k;
      if(!k) return;
      if(STATE.sortKey === k) STATE.sortDir = (STATE.sortDir === 'asc') ? 'desc' : 'asc';
      else { STATE.sortKey = k; STATE.sortDir = 'asc'; }
      applyFilter();
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('results-search').addEventListener('input', applyFilter);
  setupSort();
  loadJSON();
});
