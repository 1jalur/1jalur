/* Kotak pencarian di atas tabel */
const sbar=()=>`<div class="bar"><input id="q" placeholder="Cari..." value="${esc(q)}" oninput="q=this.value.toLowerCase();draw();const e=document.getElementById('q');e.focus();e.setSelectionRange(99,99)"></div>`;
/* Pencarian: beberapa kata dipisah spasi, semua kata harus ada */
const qtok=()=>String(q||'').toLowerCase().split(/\s+/).filter(Boolean);
const qnama=v=>{const t=qtok();if(!t.length)return true;const x=String(v==null?'':v).toLowerCase();return t.every(w=>x.includes(w))};
const qtxt=r=>{const o=[];Object.keys(r||{}).forEach(k=>{if(k==='id'||k==='alloc'||k==='fld')return;const v=r[k];if(v==null||typeof v==='object')return;const s=String(v);o.push(s);if(/^\d{4}-\d{2}-\d{2}$/.test(s))o.push(s.split('-').reverse().join('/'));else if(typeof v==='number'&&v)o.push(rp(v))});return o.join(' ').toLowerCase()};
const qmatch=r=>{const t=qtok();if(!t.length)return true;const x=qtxt(r);return t.every(w=>x.includes(w))};
