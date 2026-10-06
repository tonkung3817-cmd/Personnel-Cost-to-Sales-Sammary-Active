'use strict';
// หน้าผู้ดูแล: อ่านข้อมูลจาก Supabase (สิทธิ์ถูกบังคับด้วย RLS) แล้วแสดงผล
const app=$('#app');
const STATUS=['ยังไม่ติดต่อ','ติดต่อแล้ว','ปลอดภัย','ต้องการความช่วยเหลือ'];
const ISTAT=['รอรับเรื่อง','กำลังช่วยเหลือ','เสร็จสิ้น'];
const tel=n=>esc(n||'-');
const S={role:null,branches:[],subs:[],inc:[],triage:{},opts:null,
  f:{reg:'',zone:'',code:'',name:'',br:''},tab:'ov',sel:null,imp:{on:false,c:null,r:30},sort:{k:'n',d:-1},loaded:false};
const OPTS=()=>S.opts||DEF_OPTS;
const bById=id=>S.branches.find(b=>String(b.id)==String(id));
const view={set:false};

// ---- แปลงแถวจากฐานข้อมูลเป็นรูปแบบที่ส่วนแสดงผลใช้ ----
const mapBranch=b=>({id:String(b.id),th:b.th||'',en:b.en||'',reg:b.reg||'',zone:b.zone||'',prov:b.prov||'',ll:b.lat!=null&&b.lng!=null?[b.lat,b.lng]:null});
const mapProfile=p=>({_id:p.user_id,empId:p.emp_id,name:p.name,branchId:String(p.branch_id),address:p.address,lat:p.lat,lng:p.lng,phone:p.phone,emName:p.em_name,emRel:p.em_rel,emPhone:p.em_phone,h:p.h||{},note:p.note,updatedAt:Date.parse(p.updated_at)||Date.now()});
const mapInc=i=>({_id:i.id,id:i.code,user_id:i.user_id,empId:i.emp_id,name:i.name,branchId:String(i.branch_id),type:i.type,sev:i.sev,people:i.people,phone:i.phone,needs:i.needs||[],detail:i.detail,lat:i.lat,lng:i.lng,resolved:i.resolved,createdAt:Date.parse(i.created_at)||Date.now(),updatedAt:Date.parse(i.updated_at)||Date.now()});

async function load(){
  const q=(t,o)=>{let x=sb.from(t).select('*');if(o)x=x.order(o);return x.limit(5000);};
  const [b,p,i,t,o]=await Promise.all([q('branches','id'),q('profiles'),q('incidents'),q('triage'),sb.from('options').select('*')]);
  S.branches=(b.data||[]).map(mapBranch);S.subs=(p.data||[]).map(mapProfile);S.inc=(i.data||[]).map(mapInc);
  S.triage={};(t.data||[]).forEach(x=>{S.triage[x.kind=='inc'?'inc_'+x.ref:x.ref]=x;});
  const op={};(o.data||[]).forEach(r=>op[r.key]=r.value);S.opts=op.types||op.needs?{types:op.types||DEF_OPTS.types,needs:op.needs||DEF_OPTS.needs}:null;
  S.loaded=true;
  const a=document.activeElement;
  if(a&&/INPUT|SELECT|TEXTAREA/.test(a.tagName)&&a.closest('#pane')&&load.auto)return; // ไม่ล้างฟอร์มที่กำลังกรอกตอนรีเฟรชอัตโนมัติ
  renderAdmin();
}
async function saveTriage(kind,ref,branchId,v){
  const {error}=await sb.from('triage').upsert({kind,ref:String(ref),branch_id:String(branchId),status:v.status,org:v.org||null,note:v.note||null,updated_at:new Date().toISOString()},{onConflict:'kind,ref'});
  if(error)throw error;S.triage[kind=='inc'?'inc_'+ref:ref]={status:v.status,org:v.org,note:v.note};
}
async function delRow(t,col,val){const {error}=await sb.from(t).delete().eq(col,val);if(error)throw error;}
async function saveOpts(types,needs){
  const {error}=await sb.from('options').upsert([{key:'types',value:types},{key:'needs',value:needs}],{onConflict:'key'});if(error)throw error;S.opts={types,needs};
}
const mapLink=()=>location.href.split('#')[0];

requireLogin(async session=>{
  const r=await sb.from('staff_roles').select('*').eq('user_id',session.user.id).maybeSingle();
  if(!r.data){app.innerHTML=hero('ศูนย์ดูแลพนักงานสาขา','')+'<div class="wrap pull"><div class="card empty"><b>ไม่มีสิทธิ์เข้าดู</b>บัญชีนี้ยังไม่ได้รับสิทธิ์ผู้ดูแล กรุณาติดต่อผู้ดูแลระบบ</div></div>';bindLogout();return;}
  S.role=r.data;await load();load.auto=true;setInterval(load,60000);
},'ศูนย์ดูแลพนักงานสาขา','สำหรับผู้ดูแลที่ได้รับสิทธิ์เท่านั้น');
// ===== ผู้ดูแล =====
function rowsAll(){ // รวมพนักงาน + สาขา + ระยะ
  return S.subs.map(s=>{
    const b=bById(s.branchId);const ll=[s.lat,s.lng];
    const d=b&&b.ll?hav(b.ll[0],b.ll[1],ll[0],ll[1]):null;
    const h=s.h||{};const vul=(h.elderly||0)+(h.children||0)+(h.bedridden||0)+(h.disabled||0)+(h.pregnant||0);
    return {s,b,ll,d,bd:d==null?-1:band(d),vul,tri:S.triage[s._id]||{status:STATUS[0]}};
  });
}
function matchB(b){const f=S.f,c=norm(f.code),n=norm(f.name);
  return b&&(!f.reg||b.reg==f.reg)&&(!f.zone||b.zone==f.zone)&&(!f.br||String(b.id)==f.br)&&(!c||norm(b.id).includes(c))&&(!n||norm(b.th).includes(n)||norm(b.en).includes(n));}
const anyF=()=>S.f.reg||S.f.zone||S.f.code||S.f.name||S.f.br;
function filtered(){return rowsAll().filter(r=>r.b&&matchB(r.b)||(!r.b&&!anyF()));}

function renderAdmin(){
  const tabs=[['ov','📊 ภาพรวม'],['hub','🏢 สาขาเป็นศูนย์กลาง'],['emp','👥 พนักงาน'],['inc','🆘 ภัยพิบัติ'],['imp','🎯 ประเมินผลกระทบ'],['set','⚙️ ตั้งค่า']];
  const link=location.href.split('#')[0];
  app.innerHTML=hero('ศูนย์ดูแลพนักงานสาขา','มุมมองผู้ดูแล · เห็นข้อมูลส่วนบุคคลและพิกัดที่พักของพนักงาน',`<span class="pill">${S.subs.length} คนส่งข้อมูล · ${S.inc.filter(i=>!i.resolved).length} เหตุที่เปิดอยู่ · ${S.branches.length} สาขา</span>`)+
  `<div class="wrap pull"><nav class="tabs">${tabs.map(([k,t])=>`<button data-t="${k}" class="${S.tab==k?'on':''}">${t}</button>`).join('')}</nav><div id="pane"></div></div>`;
  document.querySelectorAll('nav.tabs button').forEach(b=>b.onclick=()=>{S.tab=b.dataset.t;S.sel=null;view.set=false;renderAdmin();});
  bindLogout();
  ({ov:paneOv,hub:paneHub,emp:paneEmp,inc:paneInc,imp:paneImp,set:paneSet})[S.tab](link);
}
function filterBar(){
  const regs=[...new Set(S.branches.map(b=>b.reg).filter(Boolean))].sort();
  const zones=[...new Set(S.branches.filter(b=>!S.f.reg||b.reg==S.f.reg).map(b=>b.zone).filter(z=>z&&z!='-'))].sort();
  const brs=S.branches.filter(b=>(!S.f.reg||b.reg==S.f.reg)&&(!S.f.zone||b.zone==S.f.zone));
  return `<div class="bar keep">
    <select id="fReg" aria-label="ภาค"><option value="">ทุกภาค (Regional)</option>${regs.map(r=>`<option ${r==S.f.reg?'selected':''}>${esc(r)}</option>`).join('')}</select>
    <select id="fZone" aria-label="เขต"><option value="">ทุกเขต (Region)</option>${zones.map(r=>`<option ${r==S.f.zone?'selected':''}>${esc(r)}</option>`).join('')}</select>
    <input type="text" id="fCode" placeholder="🔍 รหัสสาขา" value="${esc(S.f.code)}" style="max-width:150px;min-width:110px">
    <input type="text" id="fName" placeholder="🔍 ชื่อสาขา" value="${esc(S.f.name)}">
    <select id="fBr" aria-label="สาขา"><option value="">ทุกสาขา</option>${brs.map(b=>`<option value="${esc(b.id)}" ${String(b.id)==S.f.br?'selected':''}>${esc(b.id)} · ${esc(b.th||b.en)}</option>`).join('')}</select>
    <button class="btn ghost sm" id="fClr">ล้าง</button></div>`;
}
function bindFilters(){
  const re=()=>{view.set=false;renderAdmin();};
  $('#fReg').onchange=e=>{S.f.reg=e.target.value;S.f.zone='';S.f.br='';re();};
  $('#fZone').onchange=e=>{S.f.zone=e.target.value;S.f.br='';re();};
  $('#fBr').onchange=e=>{S.f.br=e.target.value;re();};
  $('#fClr').onclick=()=>{S.f={reg:'',zone:'',code:'',name:'',br:''};re();};
  let t;const typed=(id,key)=>{$(id).oninput=e=>{S.f[key]=e.target.value;S.f.br='';clearTimeout(t);t=setTimeout(()=>{re();const i=$(id);i.focus();i.setSelectionRange(i.value.length,i.value.length);},350);};};
  typed('#fCode','code');typed('#fName','name');
}
function emptyState(){return `<div class="card empty"><b>ยังไม่มีข้อมูล</b>${S.branches.length?'ยังไม่มีพนักงานส่งข้อมูลที่ตรงกับตัวกรอง ส่งลิงก์แบบสำรวจให้พนักงานได้ที่แท็บ "ตั้งค่า"':'เริ่มต้นที่แท็บ "ตั้งค่า" เพื่อนำเข้าไฟล์สาขา แล้วส่งลิงก์ให้พนักงาน'}</div>`}

function paneOv(){
  const rs=filtered();
  const c=[0,0,0,0];rs.forEach(r=>{if(r.bd>=0)c[r.bd]++});
  const vulH=rs.filter(r=>r.vul>0).length,help=rs.filter(r=>r.tri.status==STATUS[3]).length;
  $('#pane').innerHTML=filterBar()+`
  <div class="stats">
   <div class="stat"><b>${rs.length}</b><small>พนักงานที่ส่งข้อมูล</small></div>
   ${BANDS.map((b,i)=>`<div class="stat" style="border-top-color:${b.col}"><b>${c[i]}</b><small>${b.t}</small></div>`).join('')}
   <div class="stat" style="border-top-color:var(--yellow)"><b>${vulH}</b><small>ครัวเรือนมีกลุ่มเปราะบาง</small></div>
   <div class="stat" style="border-top-color:var(--red)"><b>${help}</b><small>ต้องการความช่วยเหลือ</small></div>
  </div>
  <div class="card"><div class="legend">${BANDS.map(b=>`<span><i class="dot" style="background:${b.col}"></i>${b.t}</span>`).join('')}<span>■ สาขา</span></div>
   <div id="mapHost"></div></div>
  <div class="card"><h2>สรุปรายสาขา</h2><p class="sub">คลิกแถวเพื่อดูเฉพาะสาขานั้น · คลิกหัวตารางเพื่อเรียงลำดับ</p>${branchTable(rs)}</div>`;
  bindFilters();
  drawMap('#mapHost',rs,{});
  bindBranchTable();
}
function branchTable(rs){
  const m=new Map();rs.forEach(r=>{if(!r.b)return;let x=m.get(r.b.id);if(!x){x={b:r.b,n:0,c:[0,0,0,0],sum:0,max:0,vul:0};m.set(r.b.id,x)}x.n++;if(r.bd>=0)x.c[r.bd]++;x.sum+=r.d||0;x.max=Math.max(x.max,r.d||0);if(r.vul)x.vul++;});
  const val=(x,k)=>k=='id'?(+x.b.id||x.b.id):k=='th'?(x.b.th||x.b.en):k=='reg'?x.b.reg:k=='avg'?x.sum/x.n:k=='max'?x.max:k=='vul'?x.vul:k[0]=='c'?x.c[+k[1]]:x.n;
  const list=[...m.values()].sort((a,b)=>{const p=val(a,S.sort.k),q=val(b,S.sort.k);return(p>q?1:p<q?-1:0)*S.sort.d});
  if(!list.length)return emptyState();
  const cols=[['id','รหัส'],['th','สาขา'],['reg','ภาค'],['n','พนักงาน'],['c0','≤5'],['c1','5–20'],['c2','20–50'],['c3','>50'],['avg','เฉลี่ย กม.'],['max','ไกลสุด กม.'],['vul','เปราะบาง']];
  return `<div class="scroll"><table id="bt"><thead><tr>${cols.map(([k,t])=>`<th data-k="${k}" class="${k.length>2||k=='n'||k[0]=='c'?'n':''}">${t}${S.sort.k==k?(S.sort.d>0?' ▲':' ▼'):''}</th>`).join('')}</tr></thead><tbody>${list.map(x=>`<tr class="r" data-id="${esc(x.b.id)}"><td>${esc(x.b.id)}</td><td>${esc(x.b.th||x.b.en)}</td><td>${esc(x.b.reg)}</td><td class="n">${x.n}</td>${x.c.map(v=>`<td class="n">${v}</td>`).join('')}<td class="n">${(x.sum/x.n).toFixed(1)}</td><td class="n">${x.max.toFixed(1)}</td><td class="n">${x.vul}</td></tr>`).join('')}</tbody></table></div>`;
}
function bindBranchTable(){
  const t=$('#bt');if(!t)return;
  t.querySelectorAll('th').forEach(th=>th.onclick=()=>{const k=th.dataset.k;S.sort.d=S.sort.k==k?-S.sort.d:-1;S.sort.k=k;renderAdmin();});
  t.querySelectorAll('tr.r').forEach(tr=>tr.onclick=()=>{S.f.br=tr.dataset.id;view.set=false;renderAdmin();window.scrollTo({top:0,behavior:'smooth'});});
}


// ===== สาขาเป็นศูนย์กลาง =====
function paneHub(){
  const all=rowsAll(),bs=S.branches.filter(b=>b.ll&&matchB(b));
  const cb=S.f.br?bById(S.f.br):null;
  if(!cb){
    const info=bs.map(b=>{const rs=all.filter(r=>r.b&&String(r.b.id)==String(b.id));return{b,n:rs.length,far:rs.filter(r=>r.bd==3).length,max:rs.reduce((a,r)=>Math.max(a,r.d||0),0)}}).sort((x,y)=>y.far-x.far||y.n-x.n);
    $('#pane').innerHTML=filterBar()+`<div class="card"><h2>เลือกสาขาเป็นจุดศูนย์กลาง (${bs.length} สาขา)</h2><p class="sub">คลิกสาขาเพื่อดูพนักงานรอบสาขานั้น พร้อมพิกัดและระยะห่าง · เรียงตามจำนวนพนักงานที่อยู่ไกลเกิน 50 กม.</p>
     ${info.length?`<div class="scroll"><table><thead><tr><th>รหัส</th><th>ชื่อสาขา</th><th>ภาค</th><th>เขต</th><th>พิกัดสาขา (lat, lng)</th><th class="n">พนักงาน</th><th class="n">&gt;50 กม.</th><th class="n">ไกลสุด กม.</th></tr></thead><tbody>${info.map(x=>`<tr class="r" data-id="${esc(x.b.id)}"><td>${esc(x.b.id)}</td><td>${esc(x.b.th||x.b.en)}</td><td>${esc(x.b.reg)}</td><td>${esc(x.b.zone)}</td><td>${x.b.ll[0].toFixed(5)}, ${x.b.ll[1].toFixed(5)}</td><td class="n">${x.n}</td><td class="n">${x.far}</td><td class="n">${x.max.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`:emptyState()}</div>
     <div class="card"><div id="mapHost"></div></div>`;
    bindFilters();
    document.querySelectorAll('tr.r').forEach(tr=>tr.onclick=()=>{S.f.br=tr.dataset.id;view.set=false;paneHub();});
    drawMap('#mapHost',all.filter(r=>r.b&&matchB(r.b)),{});
    return;
  }
  const rs=all.filter(r=>r.b&&String(r.b.id)==String(cb.id)).sort((a,b)=>(b.d||0)-(a.d||0));
  const c=[0,0,0,0];rs.forEach(r=>{if(r.bd>=0)c[r.bd]++});
  $('#pane').innerHTML=filterBar()+`<div class="card"><div class="bar"><button class="btn ghost sm" id="hBack">← ทุกสาขา</button><h2 style="margin:0;flex:1">${esc(cb.id)} · ${esc(cb.th||cb.en)}</h2></div>
    <p class="sub" style="margin:6px 0 0">ภาค ${esc(cb.reg)} · เขต ${esc(cb.zone)} · จังหวัด ${esc(cb.prov)} · <b>พิกัดสาขา (จุดศูนย์กลาง):</b> <span class="sel">${cb.ll?cb.ll[0].toFixed(5)+', '+cb.ll[1].toFixed(5):'ไม่มีพิกัด'}</span>${cb.ll?` · <a href="${gmaps(cb.ll)}" target="_blank" rel="noopener">เปิดแผนที่</a>`:''}</p></div>
   <div class="stats"><div class="stat"><b>${rs.length}</b><small>พนักงานที่ส่งข้อมูล</small></div>${BANDS.map((b,i)=>`<div class="stat" style="border-top-color:${b.col}"><b>${c[i]}</b><small>${b.t}</small></div>`).join('')}</div>
   <div class="card"><div class="legend">${BANDS.map(b=>`<span><i class="dot" style="background:${b.col}"></i>${b.t}</span>`).join('')}<span>■ สาขา (ศูนย์กลาง) · วงประ = 5 / 20 / 50 กม.</span></div><div id="mapHost"></div></div>
   <div class="card"><div class="bar"><h2 style="margin:0;flex:1">พนักงานของสาขา พร้อมพิกัด</h2><button class="btn sm" id="hCsv">ดาวน์โหลด CSV</button></div>
   ${rs.length?`<div class="scroll"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>พิกัดพนักงาน (lat, lng)</th><th class="n">ระยะ กม.</th><th>ช่วงระยะ</th><th>ที่อยู่</th><th>โทร</th><th>กลุ่มเปราะบาง</th></tr></thead><tbody>${rs.map(r=>`<tr class="r" data-id="${esc(r.s._id)}"><td>${esc(r.s.empId)}</td><td>${esc(r.s.name)}</td><td class="sel">${(+r.s.lat).toFixed(5)}, ${(+r.s.lng).toFixed(5)}</td><td class="n">${r.d==null?'-':r.d.toFixed(2)}</td><td>${r.bd>=0?`<span class="chip ${BANDS[r.bd].cls}">${BANDS[r.bd].t}</span>`:'-'}</td><td>${esc(r.s.address)}</td><td>${tel(r.s.phone)}</td><td>${vulChips(r.s.h)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty"><b>ยังไม่มีพนักงานของสาขานี้ส่งข้อมูล</b></div>'}</div>`;
  bindFilters();
  $('#hBack').onclick=()=>{S.f.br='';view.set=false;paneHub();};
  document.querySelectorAll('tr.r').forEach(tr=>tr.onclick=()=>{S.tab='emp';S.sel=tr.dataset.id;renderAdmin();});
  $('#hCsv').onclick=()=>saveCsv('branch-'+cb.id+'-employees.csv',rs.map(exportRow));
  drawMap('#mapHost',rs,{});
}

function paneEmp(){
  const rs=filtered().sort((a,b)=>(b.tri.status==STATUS[3])-(a.tri.status==STATUS[3])||b.vul-a.vul||(b.d||0)-(a.d||0));
  const sel=S.sel&&rs.find(r=>r.s._id==S.sel);
  $('#pane').innerHTML=filterBar()+`<div class="grid2" style="grid-template-columns:${sel?'1.2fr 1fr':'1fr'}">
   <div class="card"><h2>รายชื่อพนักงาน (${rs.length})</h2><p class="sub">เรียงตามความสำคัญ: ต้องการความช่วยเหลือ → มีกลุ่มเปราะบาง → ห่างจากสาขามาก</p>
   ${rs.length?`<div class="scroll"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>สาขา</th><th>พิกัดพนักงาน (lat, lng)</th><th class="n">ระยะ กม.</th><th>ครัวเรือน</th><th>สถานะ</th></tr></thead><tbody>${rs.map(r=>`<tr class="r" data-id="${esc(r.s._id)}"><td>${esc(r.s.empId)}</td><td>${esc(r.s.name)}</td><td>${esc(r.b?(r.b.id+' · '+(r.b.th||r.b.en)):'?')}</td><td>${(+r.s.lat).toFixed(5)}, ${(+r.s.lng).toFixed(5)}</td><td class="n">${r.d==null?'-':`<span class="chip ${BANDS[r.bd].cls}">${r.d.toFixed(1)}</span>`}</td><td>${vulChips(r.s.h)}</td><td>${esc(r.tri.status)}</td></tr>`).join('')}</tbody></table></div>`:emptyState()}</div>
   ${sel?detail(sel):''}</div>`;
  bindFilters();
  document.querySelectorAll('tr.r').forEach(tr=>tr.onclick=()=>{S.sel=tr.dataset.id;paneEmp();});
  if(sel)bindDetail(sel);
}
function vulChips(h){h=h||{};const a=[['elderly','สูงอายุ'],['children','เด็กเล็ก'],['bedridden','ติดเตียง'],['disabled','พิการ'],['pregnant','ครรภ์']].filter(([k])=>h[k]>0);
  return a.length?`<span class="vul">${a.map(([k,t])=>`<span>${t} ${h[k]}</span>`).join('')}</span>`:'-';}
function detail(r){const s=r.s,h=s.h||{};
  return `<div class="card detail keep"><h2>${esc(s.name)} <span class="chip c0">${esc(s.empId)}</span></h2>
  <p class="sub">${esc(r.b?r.b.id+' · '+(r.b.th||r.b.en):'ไม่พบสาขา')} · อัปเดต ${new Date(s.updatedAt).toLocaleString('th-TH')}</p>
  <dl>
   <dt>ระยะจากสาขา</dt><dd>${r.d==null?'-':`<span class="chip ${BANDS[r.bd].cls}">${r.d.toFixed(2)} กม.</span>`}</dd>
   <dt>ที่อยู่</dt><dd>${esc(s.address)}</dd>
   <dt>พิกัด</dt><dd><span class="sel">${(+s.lat).toFixed(5)}, ${(+s.lng).toFixed(5)}</span> · <a href="${gmaps(r.ll)}" target="_blank" rel="noopener">เปิดแผนที่</a></dd>
   <dt>เบอร์โทร</dt><dd class="sel">${tel(s.phone)}</dd>
   <dt>ผู้ติดต่อฉุกเฉิน</dt><dd>${esc(s.emName)} ${s.emRel?'('+esc(s.emRel)+')':''} · <span class="sel">${tel(s.emPhone)}</span></dd>
   <dt>จำนวนคนในบ้าน</dt><dd>${esc(h.total)} คน</dd>
   <dt>กลุ่มเปราะบาง</dt><dd>${vulChips(h)}</dd>
   <dt>หมายเหตุ</dt><dd>${esc(s.note)||'-'}</dd></dl>
  <div class="sec"><i>✓</i>การติดตาม (ผู้ดูแลเท่านั้น)</div>
  <label for="tSt">สถานะ</label><select id="tSt">${STATUS.map(x=>`<option ${x==r.tri.status?'selected':''}>${x}</option>`).join('')}</select>
  <label for="tNote">บันทึกของผู้ดูแล</label><textarea id="tNote">${esc(r.tri.note)}</textarea>
  <div class="bar" style="margin-top:10px"><button class="btn green sm" id="tSave">บันทึกสถานะ</button><button class="btn ghost sm" id="tDel">ลบข้อมูลพนักงานรายนี้</button><span id="tMsg" class="hint"></span></div></div>`;}
function bindDetail(r){
  $('#tSave').onclick=async()=>{try{await saveTriage('emp',r.s._id,r.s.branchId,{status:$('#tSt').value,note:$('#tNote').value});$('#tMsg').textContent='บันทึกแล้ว';}catch(e){$('#tMsg').textContent='บันทึกไม่สำเร็จ';}};
  $('#tDel').onclick=()=>{ // ยืนยันในหน้า (confirm() ใช้ไม่ได้)
    $('#tDel').outerHTML='<button class="btn red sm" id="tDel2">กดอีกครั้งเพื่อยืนยันการลบ</button>';
    $('#tDel2').onclick=async()=>{try{await delRow('profiles','user_id',r.s._id);await sb.from('triage').delete().eq('kind','emp').eq('ref',r.s._id);S.sel=null;await load();}catch(e){$('#tMsg').textContent='ลบไม่สำเร็จ';}};};
}


function rowsInc(){
  return S.inc.map(i=>{const b=bById(i.branchId),ll=[i.lat,i.lng];const d=b&&b.ll?hav(b.ll[0],b.ll[1],ll[0],ll[1]):null;
    const base=S.subs.find(x=>x._id==i._id)||null;const h=base?.h||{};
    const vul=(h.elderly||0)+(h.children||0)+(h.bedridden||0)+(h.disabled||0)+(h.pregnant||0);
    return {s:i,b,ll,d,bd:d==null?-1:band(d),base,vul,sev:i.sev||2,tri:S.triage['inc_'+i._id]||{status:ISTAT[0]},inc:true};});
}
function filteredInc(){const t=S.f.type,st=S.f.ist;
  return rowsInc().filter(r=>(r.b?matchB(r.b):!anyF())&&(!t||r.s.type==t)&&(!st||(st=='เปิดอยู่'?!r.s.resolved&&r.tri.status!=ISTAT[2]:r.s.resolved||r.tri.status==ISTAT[2])));}
const incDone=r=>r.s.resolved||r.tri.status==ISTAT[2];
function paneInc(){
  const all=filteredInc(),open=all.filter(r=>!incDone(r));
  const cnt=k=>open.filter(r=>r.sev==k).length;
  const byType={};open.forEach(r=>byType[r.s.type]=(byType[r.s.type]||0)+1);
  const rs=all.sort((a,b)=>incDone(a)-incDone(b)||b.sev-a.sev||b.s.updatedAt-a.s.updatedAt);
  const sel=S.sel&&rs.find(r=>r.s._id==S.sel);
  $('#pane').innerHTML=filterBar()+`<div class="bar keep"><select id="fType"><option value="">ทุกประเภทภัย</option>${OPTS().types.map(t=>`<option ${t==S.f.type?'selected':''}>${esc(t)}</option>`).join('')}</select>
   <select id="fIst"><option value="">ทุกสถานะเหตุ</option><option ${S.f.ist=='เปิดอยู่'?'selected':''}>เปิดอยู่</option><option ${S.f.ist=='ปิดแล้ว'?'selected':''}>ปิดแล้ว</option></select>
   <button class="btn sm" id="iCsv2">ดาวน์โหลด CSV</button></div>
   <div class="stats"><div class="stat" style="border-top-color:var(--red)"><b>${open.length}</b><small>เหตุที่เปิดอยู่</small></div>
    ${[3,2,1].map(k=>`<div class="stat" style="border-top-color:${SEV[k].col}"><b>${cnt(k)}</b><small>${SEV[k].t}</small></div>`).join('')}
    <div class="stat"><b>${open.reduce((a,r)=>a+(r.s.people||1),0)}</b><small>ผู้ได้รับผลกระทบ</small></div>
    <div class="stat" style="border-top-color:var(--green)"><b>${all.length-open.length}</b><small>ปิดแล้ว</small></div></div>
   ${Object.keys(byType).length?`<div class="bar">${Object.entries(byType).map(([t,n])=>`<span class="chip c2">${TIC[t]||'⚠️'} ${esc(t)} ${n}</span>`).join('')}</div>`:''}
   <div class="card"><div class="legend">${[3,2,1].map(k=>`<span><i class="dot" style="background:${SEV[k].col}"></i>${SEV[k].t}</span>`).join('')}<span>■ สาขา</span></div><div id="mapHost"></div></div>
   <div class="grid2" style="grid-template-columns:${sel?'1.2fr 1fr':'1fr'}">
   <div class="card"><h2>รายการแจ้งเหตุ (${rs.length})</h2><p class="sub">เรียงตามความเร่งด่วน เหตุที่ปิดแล้วอยู่ท้ายสุด</p>
   ${rs.length?`<div class="scroll"><table><thead><tr><th>รหัสเหตุ</th><th>พนักงาน</th><th>สาขา</th><th>ภัย</th><th>ความเร่งด่วน</th><th>สถานะ</th></tr></thead><tbody>${rs.map(r=>`<tr class="r" data-id="${esc(r.s._id)}" style="${incDone(r)?'opacity:.55':''}"><td>${esc(r.s.id)}</td><td>${esc(r.s.name)}</td><td>${esc(r.b?(r.b.th||r.b.en):'?')}</td><td>${TIC[r.s.type]||'⚠️'} ${esc(r.s.type)}</td><td><span class="chip ${SEV[r.sev].cls}">${({3:"ฉุกเฉิน",2:"ต้องการช่วย",1:"ปลอดภัย"})[r.sev]}</span></td><td>${r.s.resolved?'ปลอดภัยแล้ว':esc(r.tri.status)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty"><b>ยังไม่มีการแจ้งเหตุ</b>เมื่อพนักงานส่งรายงานที่แท็บ "แจ้งประสบภัย" จะแสดงที่นี่ทันที</div>'}</div>
   ${sel?incDetail(sel):''}</div>`;
  bindFilters();
  $('#fType').onchange=e=>{S.f.type=e.target.value;paneInc();};$('#fIst').onchange=e=>{S.f.ist=e.target.value;paneInc();};
  $('#iCsv2').onclick=()=>saveCsv('incidents.csv',rs.map(incRow));
  document.querySelectorAll('tr.r').forEach(tr=>tr.onclick=()=>{S.sel=tr.dataset.id;paneInc();});
  drawMap('#mapHost',rs.filter(r=>!incDone(r)),{tab:'inc',color:r=>SEV[r.sev].col,hot:r=>r.sev==3});
  if(sel)bindIncDetail(sel);
}
const incRow=r=>({รหัสเหตุ:r.s.id,ประเภทภัย:r.s.type,ความเร่งด่วน:SEV[r.sev].t,สถานะ:r.s.resolved?'ปลอดภัยแล้ว':r.tri.status,รหัสพนักงาน:r.s.empId,ชื่อ:r.s.name,สาขา:r.b?(r.b.th||r.b.en):'',ภาค:r.b?.reg,'ระยะจากสาขา(กม.)':r.d==null?'':r.d.toFixed(2),พิกัด:r.s.lat+','+r.s.lng,โทร:r.s.phone,ผู้ติดต่อฉุกเฉิน:r.base?r.base.emName+' '+r.base.emPhone:'',จำนวนผู้ได้รับผลกระทบ:r.s.people,ความต้องการ:(r.s.needs||[]).join('; '),รายละเอียด:r.s.detail,แจ้งเมื่อ:new Date(r.s.createdAt).toISOString()});
function incDetail(r){const s=r.s;
  return `<div class="card detail keep"><h2>${TIC[s.type]||'⚠️'} ${esc(s.type)} <span class="chip ${SEV[r.sev].cls}">${SEV[r.sev].t}</span></h2>
  <p class="sub">${esc(s.id)} · แจ้ง ${new Date(s.createdAt).toLocaleString('th-TH')} · อัปเดต ${new Date(s.updatedAt).toLocaleString('th-TH')}</p>
  <dl><dt>พนักงาน</dt><dd>${esc(s.name)} (${esc(s.empId)})</dd>
   <dt>สาขา</dt><dd>${esc(r.b?r.b.id+' · '+(r.b.th||r.b.en):'?')}</dd>
   <dt>ระยะจากสาขา</dt><dd>${r.d==null?'-':`<span class="chip ${BANDS[r.bd].cls}">${r.d.toFixed(2)} กม.</span>`}</dd>
   <dt>พิกัด</dt><dd><span class="sel">${(+s.lat).toFixed(5)}, ${(+s.lng).toFixed(5)}</span> · <a href="${gmaps(r.ll)}" target="_blank" rel="noopener">เปิดแผนที่</a></dd>
   <dt>เบอร์ติดต่อ</dt><dd class="sel">${tel(s.phone)}</dd>
   <dt>ผู้ติดต่อฉุกเฉิน</dt><dd>${r.base?esc(r.base.emName)+' · <span class="sel">'+tel(r.base.emPhone)+'</span>':'ยังไม่ได้กรอกแบบสำรวจ'}</dd>
   <dt>ผู้ได้รับผลกระทบ</dt><dd>${esc(s.people)} คน ${r.base?'· กลุ่มเปราะบางในครัวเรือน: '+vulChips(r.base.h):''}</dd>
   <dt>ความต้องการ</dt><dd>${(s.needs||[]).map(n=>`<span class="chip c2">${esc(n)}</span>`).join(' ')||'-'}</dd>
   <dt>รายละเอียด</dt><dd>${esc(s.detail)||'-'}</dd></dl>
  <div class="sec"><i>✓</i>การช่วยเหลือ (ผู้ดูแลเท่านั้น)</div>
  <label for="tSt">สถานะ</label><select id="tSt">${ISTAT.map(x=>`<option ${x==r.tri.status?'selected':''}>${x}</option>`).join('')}</select>
  <label for="tOrg">ผู้รับผิดชอบ / หน่วยงาน</label><input id="tOrg" value="${esc(r.tri.org)}">
  <label for="tNote">บันทึกการดำเนินงาน</label><textarea id="tNote">${esc(r.tri.note)}</textarea>
  <div class="bar" style="margin-top:10px"><button class="btn green sm" id="tSave">บันทึก</button><span id="tMsg" class="hint"></span></div></div>`;}
function bindIncDetail(r){
  $('#tSave').onclick=async()=>{try{await saveTriage('inc',r.s._id,r.s.branchId,{status:$('#tSt').value,org:$('#tOrg').value,note:$('#tNote').value});$('#tMsg').textContent='บันทึกแล้ว';}catch(e){$('#tMsg').textContent='บันทึกไม่สำเร็จ';}};
}

function paneImp(){
  const I=S.imp,rs=filtered();
  const aff=I.c?rs.filter(r=>hav(I.c[0],I.c[1],r.ll[0],r.ll[1])<=I.r).sort((a,b)=>(b.vul>0)-(a.vul>0)||b.vul-a.vul):[];
  const bs=I.c?S.branches.filter(b=>b.ll&&hav(I.c[0],I.c[1],b.ll[0],b.ll[1])<=I.r):[];
  const vulN=aff.filter(r=>r.vul>0).length,people=aff.reduce((a,r)=>a+(r.s.h?.total||1),0);
  $('#pane').innerHTML=filterBar()+`<div class="card"><h2>ประเมินผลกระทบจากภัย</h2>
   <p class="sub">คลิก/แตะบนแผนที่เพื่อกำหนดศูนย์กลางของภัย แล้วปรับรัศมี ระบบจะแสดงสาขาและพนักงานที่อยู่ในพื้นที่</p>
   <div class="bar keep"><label style="margin:0">รัศมี <input type="range" id="iR" min="1" max="300" value="${I.r}"> <b id="iRv">${I.r}</b> กม.</label>
   <button class="btn ghost sm" id="iClr">ล้างจุดศูนย์กลาง</button></div>
   <div id="mapHost"></div></div>
   <div class="stats"><div class="stat" style="border-top-color:var(--red)"><b>${aff.length}</b><small>พนักงานในพื้นที่</small></div>
    <div class="stat"><b>${people}</b><small>สมาชิกครัวเรือนรวม</small></div>
    <div class="stat" style="border-top-color:var(--yellow)"><b>${vulN}</b><small>ครัวเรือนกลุ่มเปราะบาง</small></div>
    <div class="stat" style="border-top-color:var(--green)"><b>${bs.length}</b><small>สาขาในพื้นที่</small></div></div>
   ${I.c?`<div class="card"><div class="bar"><h2 style="margin:0;flex:1">รายชื่อพนักงานในพื้นที่ (เรียงตามความเร่งด่วน)</h2><button class="btn sm" id="iCsv">ดาวน์โหลด CSV</button></div>
   ${aff.length?`<div class="scroll"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>สาขา</th><th>โทร</th><th>ผู้ติดต่อฉุกเฉิน</th><th>ครัวเรือน</th></tr></thead><tbody>${aff.map(r=>`<tr><td>${esc(r.s.empId)}</td><td>${esc(r.s.name)}</td><td>${esc(r.b?(r.b.th||r.b.en):'?')}</td><td>${tel(r.s.phone)}</td><td>${esc(r.s.emName)} ${tel(r.s.emPhone)}</td><td>${vulChips(r.s.h)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">ไม่มีพนักงานในรัศมีนี้</div>'}
   ${bs.length?`<p class="sub" style="margin-top:10px">สาขาในพื้นที่: ${bs.map(b=>esc(b.th||b.en)).join(', ')}</p>`:''}</div>`:''}`;
  bindFilters();
  $('#iR').oninput=e=>{$('#iRv').textContent=e.target.value;};
  $('#iR').onchange=e=>{I.r=+e.target.value;paneImp();};
  $('#iClr').onclick=()=>{I.c=null;paneImp();};
  drawMap('#mapHost',rs,{impact:true});
  const csv=$('#iCsv');if(csv)csv.onclick=()=>saveCsv('affected-employees.csv',aff.map(r=>exportRow(r)));
}
const exportRow=r=>({รหัสพนักงาน:r.s.empId,ชื่อ:r.s.name,รหัสสาขา:r.b?.id,สาขา:r.b?(r.b.th||r.b.en):'',ภาค:r.b?.reg,'ระยะจากสาขา(กม.)':r.d==null?'':r.d.toFixed(2),ที่อยู่:r.s.address,พิกัด:r.s.lat+','+r.s.lng,โทร:r.s.phone,ผู้ติดต่อฉุกเฉิน:r.s.emName+' '+r.s.emPhone,จำนวนคนในบ้าน:r.s.h?.total,สูงอายุ:r.s.h?.elderly,เด็กเล็ก:r.s.h?.children,ติดเตียง:r.s.h?.bedridden,พิการ:r.s.h?.disabled,ตั้งครรภ์:r.s.h?.pregnant,สถานะ:r.tri.status,หมายเหตุ:r.s.note});
async function saveCsv(name,rows){
  if(!rows.length)return;const h=Object.keys(rows[0]),q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const txt='\ufeff'+[h.map(q).join(','),...rows.map(r=>h.map(k=>q(r[k])).join(','))].join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
// ===== ตั้งค่า =====
const isAdm=()=>S.role&&S.role.role=='admin';
const roleText=()=>!S.role?'-':S.role.role=='admin'?'ผู้ดูแลทั้งหมด (admin)':S.role.role=='region'?'ผู้ดูแลระดับภาค: '+(S.role.regional||[]).join(', '):'ผู้ดูแลระดับสาขา: '+(S.role.branch_ids||[]).join(', ');
function paneSet(link){
  const empLink=link.replace(/admin\.html.*$/,'index.html'),admLink=link;
  $('#pane').innerHTML=`<div class="grid2">
  <div class="card"><h2>1) ลิงก์สำหรับส่งให้พนักงาน</h2><p class="sub">พนักงานเข้าสู่ระบบด้วยอีเมลบริษัท (รหัส OTP) แล้วกรอกแบบสำรวจ</p>
   <label>ลิงก์พนักงาน</label><input readonly class="sel" value="${esc(empLink)}">
   <label>ลิงก์ผู้ดูแล</label><input readonly class="sel" value="${esc(admLink)}">
   <div class="note" style="margin-top:12px"><b>สิทธิ์ของคุณ:</b> ${esc(roleText())}<br>สิทธิ์ถูกบังคับที่ฐานข้อมูล (RLS) ผู้ดูแลระดับภาค/สาขาจะเห็นเฉพาะข้อมูลในขอบเขตของตน การเพิ่มผู้ดูแลทำด้วย SQL ตามไฟล์ README</div></div>
  <div class="card"><h2>2) นำเข้ารายชื่อสาขา <span class="hint">(เฉพาะ admin)</span></h2><p class="sub">ไฟล์ .xlsx/.csv ที่มีคอลัมน์ Location, Description, Description (THA), Region, Regional, Province (TH), Lat/Long</p>
   <div class="drop"><input type="file" id="bFile" accept=".xlsx,.xls,.csv"></div>
   <div id="bMsg" class="hint" style="margin-top:8px">สาขาในระบบตอนนี้: <b>${S.branches.length}</b> แห่ง (มีพิกัด ${S.branches.filter(b=>b.ll).length})</div>
   <p style="margin:10px 0 0"><button class="btn ghost sm" id="bDemo">ใช้สาขาตัวอย่าง 8 แห่ง</button></p></div></div>
  <div class="card"><h2>ตัวเลือกในแบบแจ้งประสบภัย</h2><p class="sub">คั่นแต่ละตัวเลือกด้วยเครื่องหมายจุลภาค (,) เพิ่มประเภทภัยใหม่ได้ เช่น พายุ, ดินโคลนถล่ม</p>
   <label for="oTypes">ประเภทภัย</label><input id="oTypes" value="${esc(OPTS().types.join(', '))}">
   <label for="oNeeds">สิ่งที่ต้องการ</label><input id="oNeeds" value="${esc(OPTS().needs.join(', '))}">
   <p style="margin:10px 0 0"><button class="btn green sm" id="oSave">บันทึกตัวเลือก</button> <span id="oMsg" class="hint"></span></p></div>
  <div class="grid2"><div class="card"><h2>3) ส่งออกข้อมูล</h2><p class="sub">ดาวน์โหลดข้อมูลพนักงานทั้งหมด (ตามตัวกรองปัจจุบัน) เป็น CSV</p><button class="btn" id="xAll">ดาวน์โหลด CSV</button></div>
  <div class="card"><h2>4) ข้อมูลทดลอง</h2><p class="sub">สร้างพนักงานจำลองกระจายรอบสาขา เพื่อลองใช้งาน (มีคำว่า DEMO ในรหัส) ลบได้ในคลิกเดียว</p>
   <button class="btn yellow sm" id="dMake">สร้างข้อมูลจำลอง</button> <button class="btn ghost sm" id="dDel">ลบข้อมูลจำลอง</button><div id="dMsg" class="hint"></div></div></div>`;
  if(!isAdm()){document.querySelectorAll('#pane input[type=file],#pane #bDemo,#pane #dMake,#pane #dDel,#pane #oSave,#pane #oTypes,#pane #oNeeds').forEach(x=>x.disabled=true);}
  $('#bFile').onchange=importBranches;
  $('#bDemo').onclick=async()=>{await saveBranches([
   {id:'9001',th:'ตัวอย่าง ลาดพร้าว',en:'Demo Ladprao',reg:'BKK and Greater',zone:'Bangkok East',prov:'กรุงเทพมหานคร',ll:[13.7659,100.6401]},
   {id:'9002',th:'ตัวอย่าง แจ้งวัฒนะ',en:'Demo Chaengwattana',reg:'BKK and Greater',zone:'Bangkok West',prov:'นนทบุรี',ll:[13.895,100.5488]},
   {id:'9003',th:'ตัวอย่าง ชลบุรี',en:'Demo Chonburi',reg:'East',zone:'Upper East',prov:'ชลบุรี',ll:[13.3217,100.9608]},
   {id:'9004',th:'ตัวอย่าง เชียงใหม่',en:'Demo Chiangmai',reg:'North',zone:'Upper North',prov:'เชียงใหม่',ll:[18.7883,98.9853]},
   {id:'9005',th:'ตัวอย่าง พิษณุโลก',en:'Demo Phitsanulok',reg:'North',zone:'Lower North',prov:'พิษณุโลก',ll:[16.8211,100.2659]},
   {id:'9006',th:'ตัวอย่าง ขอนแก่น',en:'Demo Khonkaen',reg:'Northeast',zone:'Upper NE',prov:'ขอนแก่น',ll:[16.4419,102.835]},
   {id:'9007',th:'ตัวอย่าง นครราชสีมา',en:'Demo Korat',reg:'Northeast',zone:'Lower NE',prov:'นครราชสีมา',ll:[14.9799,102.0978]},
   {id:'9008',th:'ตัวอย่าง หาดใหญ่',en:'Demo Hatyai',reg:'South',zone:'Lower South',prov:'สงขลา',ll:[7.0086,100.4747]}]);};
  $('#oSave').onclick=async()=>{const sp=v=>v.split(',').map(x=>x.trim()).filter(Boolean);
    try{await saveOpts(sp($('#oTypes').value),sp($('#oNeeds').value));$('#oMsg').textContent='บันทึกแล้ว';}catch(e){$('#oMsg').textContent='บันทึกไม่สำเร็จ';}};
  $('#xAll').onclick=()=>saveCsv('employees.csv',filtered().map(exportRow));
  $('#dMake').onclick=makeDemo;$('#dDel').onclick=delDemo;
}
async function saveBranches(list){
  const m=$('#bMsg');
  const rows=list.map(b=>({id:String(b.id),th:b.th||null,en:b.en||null,reg:b.reg||null,zone:b.zone||null,prov:b.prov||null,lat:b.ll?b.ll[0]:null,lng:b.ll?b.ll[1]:null}));
  for(let k=0;k<rows.length;k+=200){const {error}=await sb.from('branches').upsert(rows.slice(k,k+200),{onConflict:'id'});if(error){if(m)m.textContent='บันทึกไม่สำเร็จ: '+error.message;return;}}
  await load();
}
async function importBranches(e){
  const f=e.target.files[0];if(!f)return;
  try{
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
    const rs=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
    const px=(o,n)=>{for(const k of Object.keys(o))if(k.toLowerCase().replace(/\s+/g,'')===n)return o[k]};
    const list=rs.map(r=>{
      const id=String(px(r,'location')??'').replace(/\.0$/,'').trim();
      const ll=parseLL(px(r,'lat/long')||px(r,'latlong')||px(r,'พิกัด'));
      return {id,th:String(px(r,'description(tha)')||'').trim(),en:String(px(r,'description')||'').trim(),
        reg:px(r,'regional')||px(r,'region')||'',zone:px(r,'region')||'',prov:px(r,'province(th)')||'',ll};
    }).filter(b=>b.id&&(b.th||b.en));
    await saveBranches(list);
    $('#bMsg').innerHTML=`นำเข้าแล้ว <b>${list.length}</b> สาขา (มีพิกัด ${list.filter(b=>b.ll).length}, ไม่มีพิกัด ${list.filter(b=>!b.ll).length})`;
  }catch(err){$('#bMsg').textContent='อ่านไฟล์ไม่ได้ ตรวจสอบรูปแบบไฟล์';}
}
async function makeDemo(){
  const bs=S.branches.filter(b=>b.ll);const m=$('#dMsg');
  if(!bs.length){m.textContent='กรุณานำเข้าสาขาก่อน';return;}
  m.textContent='กำลังสร้าง…';
  const names=['สมชาย','สมหญิง','ประเสริฐ','มาลี','วิชัย','นภา','อนุชา','กัลยา'],rnd=p=>Math.random()<p?1:0;
  const pos=b=>{const d=Math.pow(Math.random(),2)*80,a=Math.random()*6.283;return[+(b.ll[0]+d/111*Math.cos(a)).toFixed(5),+(b.ll[1]+d/(111*Math.cos(b.ll[0]*Math.PI/180))*Math.sin(a)).toFixed(5)];};
  const prof=[],inc=[],ty=OPTS().types,nd=OPTS().needs;
  bs.slice(0,30).forEach(b=>{const k=2+Math.floor(Math.random()*4);for(let i=0;i<k;i++){const p=pos(b);
    prof.push({user_id:crypto.randomUUID(),emp_id:'DEMO-'+b.id+'-'+i,name:names[Math.floor(Math.random()*names.length)]+' (จำลอง)',branch_id:String(b.id),address:'ที่อยู่จำลอง',lat:p[0],lng:p[1],
      phone:'08'+Math.floor(10000000+Math.random()*89999999),em_name:'ผู้ติดต่อจำลอง',em_rel:'ญาติ',em_phone:'08'+Math.floor(10000000+Math.random()*89999999),
      h:{total:1+Math.floor(Math.random()*5),elderly:rnd(.3),children:rnd(.25),bedridden:rnd(.05),disabled:rnd(.05),pregnant:rnd(.05)},note:''});}});
  bs.slice(0,12).forEach(b=>{const p=pos(b);inc.push({code:'INC-DEMO'+b.id,user_id:null,emp_id:'DEMO-'+b.id,name:'พนักงานจำลอง',branch_id:String(b.id),type:ty[Math.floor(Math.random()*ty.length)],sev:[3,2,1][Math.floor(Math.random()*3)],people:1+Math.floor(Math.random()*5),
    phone:'0812345678',needs:[nd[Math.floor(Math.random()*nd.length)]],detail:'รายงานจำลอง',lat:Math.min(p[0],b.ll[0]+0.2),lng:p[1]});});
  const r1=await sb.from('profiles').insert(prof),r2=await sb.from('incidents').insert(inc);
  m.textContent=(r1.error||r2.error)?'สร้างไม่สำเร็จ: '+(r1.error||r2.error).message:'สร้างแล้ว '+(prof.length+inc.length)+' รายการ';
  await load();
}
async function delDemo(){const m=$('#dMsg');
  const a=await sb.from('profiles').delete().like('emp_id','DEMO-%'),b=await sb.from('incidents').delete().like('emp_id','DEMO-%');
  m.textContent=(a.error||b.error)?'ลบไม่สำเร็จ':'ลบข้อมูลจำลองแล้ว';await load();}

// ===== แผนที่ (Leaflet + OpenStreetMap) =====
let LM=null,LV=null;
function drawMap(host,rs,opt){
  if(LM){LM.remove();LM=null;}
  $(host).innerHTML='<div id="map"></div>';
  const map=L.map('map');LM=map;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
  const sel=S.f.br?bById(S.f.br):null;
  if(sel&&sel.ll){[5,20,50].forEach((km,i)=>L.circle(sel.ll,{radius:km*1000,color:BANDS[i].col,weight:1.5,fill:false,dashArray:'6 4'}).addTo(map));
    rs.forEach(r=>L.polyline([sel.ll,r.ll],{color:BANDS[Math.max(r.bd,0)].col,weight:1,opacity:.5}).addTo(map));}
  if(opt.impact&&S.imp.c){L.circle(S.imp.c,{radius:S.imp.r*1000,color:'#DA3832',fillColor:'#DA3832',fillOpacity:.14,weight:2}).addTo(map);L.circleMarker(S.imp.c,{radius:5,color:'#DA3832',fillOpacity:1}).addTo(map);}
  S.branches.filter(b=>b.ll&&(S.f.br?String(b.id)==S.f.br:matchB(b))).forEach(b=>{
    L.marker(b.ll,{icon:L.divIcon({className:'',html:'<div class="bsq"></div>',iconSize:[14,14],iconAnchor:[7,7]})}).bindTooltip(esc(b.id)+' · '+esc(b.th||b.en),{permanent:!!S.f.br,direction:'top'}).addTo(map);});
  rs.forEach(r=>{const hot=opt.hot?opt.hot(r):(r.vul>0||r.tri.status==STATUS[3]);
    L.circleMarker(r.ll,{radius:hot?8:6,color:hot?'#17202f':'#fff',weight:hot?2:1,fillColor:opt.color?opt.color(r):BANDS[Math.max(r.bd,0)].col,fillOpacity:.95})
     .bindTooltip(esc(r.s.name)+(r.inc?' · '+esc(r.s.type):'')+' · '+(r.d==null?'-':r.d.toFixed(1)+' กม.')+(r.vul?' · มีกลุ่มเปราะบาง':''))
     .on('click',()=>{if(opt.impact)return;S.tab=opt.tab||'emp';S.sel=r.s._id;renderAdmin();}).addTo(map);});
  // มุมมอง: เก็บไว้ถ้าไม่มีการเปลี่ยนตัวกรอง ไม่เช่นนั้นจัดให้สาขาที่เลือกอยู่ตรงกลาง
  if(view.set&&LV)map.setView(LV.c,LV.z);
  else{
    if(sel&&sel.ll){const far=rs.reduce((a,r)=>Math.max(a,r.d||0),0);{const km=Math.max(far*1.25,25),dl=km/111,dn=km/(111*Math.cos(sel.ll[0]*Math.PI/180));map.fitBounds([[sel.ll[0]-dl,sel.ll[1]-dn],[sel.ll[0]+dl,sel.ll[1]+dn]]);}}
    else{const pts=[];if(anyF()){S.branches.filter(matchB).forEach(b=>b.ll&&pts.push(b.ll));rs.forEach(r=>pts.push(r.ll));}
      if(pts.length)map.fitBounds(pts,{padding:[30,30],maxZoom:14});else map.fitBounds([[5.6,97.3],[20.5,105.7]]);}
    view.set=true;LV={c:map.getCenter(),z:map.getZoom()};
  }
  map.on('moveend',()=>{LV={c:map.getCenter(),z:map.getZoom()};});
  if(opt.impact)map.on('click',e=>{S.imp.c=[e.latlng.lat,e.latlng.lng];paneImp();});
}

// ปิดแผนที่เดิมก่อนวาดหน้าใหม่ (กัน event ค้างจากแผนที่ที่ถูกถอดออกแล้ว)
function killMap(){if(LM){try{LM.remove()}catch(e){}LM=null;}}
['paneOv','paneHub','paneEmp','paneInc','paneImp','paneSet'].forEach(n=>{const f=window[n];window[n]=function(...a){killMap();return f.apply(this,a);};});
