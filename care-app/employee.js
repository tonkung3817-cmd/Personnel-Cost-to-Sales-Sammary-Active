'use strict';
// หน้าพนักงาน: แบบสำรวจที่พัก + แจ้งประสบภัย
const E={uid:null,branches:[],opts:DEF_OPTS,mine:null,inc:null,view:'survey',pm:null};

requireLogin(async session=>{
  E.uid=session.user.id;
  const [b,o,p,i]=await Promise.all([
    sb.from('branches').select('*').order('id'),
    sb.from('options').select('*'),
    sb.from('profiles').select('*').eq('user_id',E.uid).maybeSingle(),
    sb.from('incidents').select('*').eq('user_id',E.uid).order('created_at',{ascending:false}).limit(1)
  ]);
  E.branches=b.data||[];
  (o.data||[]).forEach(r=>{if(r.key=='types'||r.key=='needs')E.opts[r.key]=r.value;});
  E.mine=p.data||null;E.inc=(i.data&&i.data[0])||null;
  render();
},'แบบสำรวจข้อมูลพนักงาน','ข้อมูลนี้ช่วยให้บริษัทวางแผนช่วยเหลือพนักงานเมื่อเกิดน้ำท่วม ไฟไหม้ แผ่นดินไหว หรือภัยอื่นๆ');

const tabs=()=>`<div class="etabs"><button type="button" data-v="survey" class="${E.view=='survey'?'on':''}">📝 แบบสำรวจข้อมูล</button><button type="button" data-v="incident" class="${E.view=='incident'?'on':''}">🆘 แจ้งประสบภัย</button></div>`;
const bindTabs=()=>document.querySelectorAll('.etabs button').forEach(b=>b.onclick=()=>{E.view=b.dataset.v;render();window.scrollTo({top:0});});
const brOpts=cur=>'<option value="">— เลือกสาขา —</option>'+E.branches.map(b=>`<option value="${esc(b.id)}" ${String(b.id)==String(cur)?'selected':''}>${esc(b.id)} · ${esc(b.th||b.en)}</option>`).join('');

function render(){if(E.pm){try{E.pm.map.remove()}catch(e){}E.pm=null;}E.view=='incident'?renderIncident():renderSurvey();bindLogout();}

// ----- พิกัด: ปุ่มตำแหน่งปัจจุบัน + คลิกแผนที่ + วางพิกัด -----
function locationBlock(id,val,label,hint){
  return `<label for="${id}">${label}</label>
  <div style="display:flex;gap:8px"><input id="${id}" placeholder="13.75633,100.50177" value="${esc(val)}"><button type="button" class="btn green sm" id="${id}Geo" style="white-space:nowrap">📍 ใช้ตำแหน่งปัจจุบัน</button></div>
  <div id="${id}Msg"></div><div class="hint">${hint||''}คลิกบนแผนที่เพื่อปักหมุด หรือลากหมุดปรับตำแหน่ง · วางพิกัด/ลิงก์ Google Maps ได้</div>
  <div id="pick"></div><div id="${id}Chk"></div>`;
}
function bindLocation(id,getBranch){
  const chk=()=>{const v=$('#'+id).value.trim(),box=$('#'+id+'Chk');if(!v){box.innerHTML='';return null;}
    const ll=parseLL(v);if(!ll){box.innerHTML='<div class="err">อ่านพิกัดไม่ได้ กรุณาตรวจสอบ</div>';return null;}
    const b=getBranch(),d=b&&b.lat!=null?hav(b.lat,b.lng,ll[0],ll[1]):null;
    box.innerHTML=`<div class="ok">พิกัด: <b class="sel">${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}</b> · <a href="${gmaps(ll)}" target="_blank" rel="noopener">ตรวจสอบบนแผนที่</a>${d!=null?` · ห่างจากสาขา <b>${d.toFixed(1)} กม.</b>`:''}</div>`;return ll;};
  const cur=parseLL($('#'+id).value);
  E.pm=pickMap('pick',(la,ln)=>{$('#'+id).value=la.toFixed(5)+','+ln.toFixed(5);chk();},cur);
  const apply=(la,ln)=>{$('#'+id).value=la.toFixed(5)+','+ln.toFixed(5);E.pm.set(la,ln,true);chk();};
  $('#'+id+'Geo').onclick=()=>useGeo(apply,'#'+id+'Msg');
  $('#'+id).oninput=()=>{const ll=chk();if(ll)E.pm.set(ll[0],ll[1],true);};
  chk();return chk;
}

// ----- แบบสำรวจ -----
function renderSurvey(){
  const m=E.mine||{},h=m.h||{},regs=[...new Set(E.branches.map(b=>b.reg).filter(Boolean))].sort();
  $('#app').innerHTML=hero('แบบสำรวจข้อมูลพนักงาน','ข้อมูลนี้ช่วยให้บริษัทวางแผนช่วยเหลือพนักงานได้ทันทีเมื่อเกิดภัยพิบัติ','<span class="pill">กรอกประมาณ 3 นาที</span>')+`
  <div class="wrap pull"><form id="f" class="card" autocomplete="off">${tabs()}
   ${!E.branches.length?'<div class="err">ระบบยังไม่พร้อมรับข้อมูล (ผู้ดูแลยังไม่ได้เพิ่มรายชื่อสาขา)</div>':''}
   ${E.mine?'<div class="ok">คุณเคยส่งข้อมูลไว้แล้ว แก้ไขแล้วกดบันทึกเพื่ออัปเดตได้</div>':''}
   <div class="sec"><i>1</i>ข้อมูลพนักงาน</div>
   <div class="row"><div><label for="eId">รหัสพนักงาน *</label><input id="eId" required value="${esc(m.emp_id)}"></div>
   <div><label for="eName">ชื่อ-นามสกุล *</label><input id="eName" required value="${esc(m.name)}"></div></div>
   <div class="row"><div><label for="eReg">ภาค</label><select id="eReg"><option value="">ทั้งหมด</option>${regs.map(r=>`<option>${esc(r)}</option>`).join('')}</select></div>
   <div><label for="eBr">สาขาที่ปฏิบัติงาน *</label><select id="eBr" required>${brOpts(m.branch_id)}</select></div></div>
   <div class="sec"><i>2</i>ที่พักอาศัย</div>
   <label for="eAddr">ที่อยู่ที่พักอาศัยปัจจุบัน *</label><textarea id="eAddr" required>${esc(m.address)}</textarea>
   ${locationBlock('eLL',m.lat?m.lat+','+m.lng:'','พิกัดที่พัก *','')}
   <div class="sec"><i>3</i>การติดต่อ</div>
   <div class="row"><div><label for="ePhone">เบอร์โทรของคุณ *</label><input id="ePhone" type="tel" required value="${esc(m.phone)}"></div>
   <div><label for="eEmName">ผู้ติดต่อฉุกเฉิน (ชื่อ) *</label><input id="eEmName" required value="${esc(m.em_name)}"></div></div>
   <div class="row"><div><label for="eEmRel">ความสัมพันธ์</label><input id="eEmRel" value="${esc(m.em_rel)}"></div>
   <div><label for="eEmPhone">เบอร์ผู้ติดต่อฉุกเฉิน *</label><input id="eEmPhone" type="tel" required value="${esc(m.em_phone)}"></div></div>
   <div class="sec"><i>4</i>สมาชิกในครอบครัว / กลุ่มเปราะบาง</div>
   <div class="row3">${[['hTot','จำนวนคนในบ้าน','total',1],['hEld','ผู้สูงอายุ (60+)','elderly',0],['hKid','เด็กเล็ก (ต่ำกว่า 6 ปี)','children',0],['hBed','ผู้ป่วยติดเตียง','bedridden',0],['hDis','ผู้พิการ','disabled',0],['hPre','หญิงตั้งครรภ์','pregnant',0]].map(([id,l,k,d])=>`<div><label for="${id}">${l}</label><input id="${id}" type="number" min="${k=='total'?1:0}" value="${esc(h[k]??d)}"></div>`).join('')}</div>
   <label for="eNote">หมายเหตุอื่นๆ (โรคประจำตัว สัตว์เลี้ยง ความต้องการพิเศษ)</label><textarea id="eNote">${esc(m.note)}</textarea>
   <label class="chk"><input type="checkbox" id="eOk" required ${E.mine?'checked':''}>ข้าพเจ้ายินยอมให้บริษัทเก็บและใช้ข้อมูลข้างต้นเพื่อการประสานความช่วยเหลือในภาวะภัยพิบัติเท่านั้น และผู้ดูแลที่ได้รับอนุญาตเท่านั้นที่เข้าถึงข้อมูลได้ (PDPA)</label>
   <button class="btn red lg" id="eSend">บันทึกข้อมูล</button><div id="eMsg"></div></form></div>`;
  bindTabs();
  const chk=bindLocation('eLL',()=>E.branches.find(b=>String(b.id)==$('#eBr').value));
  const fill=()=>{const rg=$('#eReg').value,cur=$('#eBr').value;$('#eBr').innerHTML='<option value="">— เลือกสาขา —</option>'+E.branches.filter(b=>!rg||b.reg==rg).map(b=>`<option value="${esc(b.id)}">${esc(b.id)} · ${esc(b.th||b.en)}</option>`).join('');$('#eBr').value=cur;};
  $('#eReg').onchange=fill;$('#eBr').onchange=chk;
  $('#f').onsubmit=async e=>{
    e.preventDefault();const ll=parseLL($('#eLL').value),msg=$('#eMsg');
    if(!ll){msg.innerHTML='<div class="err">กรุณาระบุพิกัดที่พัก</div>';return;}
    const n=id=>Math.max(0,parseInt($(id).value)||0);
    const row={user_id:E.uid,emp_id:$('#eId').value.trim(),name:$('#eName').value.trim(),branch_id:$('#eBr').value,address:$('#eAddr').value.trim(),lat:ll[0],lng:ll[1],
      phone:$('#ePhone').value.trim(),em_name:$('#eEmName').value.trim(),em_rel:$('#eEmRel').value.trim(),em_phone:$('#eEmPhone').value.trim(),
      h:{total:n('#hTot')||1,elderly:n('#hEld'),children:n('#hKid'),bedridden:n('#hBed'),disabled:n('#hDis'),pregnant:n('#hPre')},note:$('#eNote').value.trim(),updated_at:new Date().toISOString()};
    $('#eSend').disabled=true;
    const {error}=await sb.from('profiles').upsert(row,{onConflict:'user_id'});
    $('#eSend').disabled=false;
    if(error){msg.innerHTML=`<div class="err">บันทึกไม่สำเร็จ: ${esc(error.message)}</div>`;return;}
    E.mine=row;msg.innerHTML='<div class="ok"><b>บันทึกเรียบร้อย</b> ขอบคุณที่ให้ข้อมูล คุณกลับมาแก้ไขได้ทุกเมื่อ</div>';
  };
}

// ----- แจ้งประสบภัย -----
function renderIncident(){
  const m=E.inc||{},base=E.mine||{},o=E.opts,act=m.id&&!m.resolved;
  $('#app').innerHTML=hero('แจ้งเหตุประสบภัย','หากคุณหรือครอบครัวได้รับผลกระทบ แจ้งให้บริษัททราบเพื่อประสานความช่วยเหลือ','<span class="pill">เหตุถึงชีวิต โทร 191 · 1669 · 199 ก่อน</span>')+`
  <div class="wrap pull"><form id="f" class="card" autocomplete="off">${tabs()}
   ${act?'<div class="ok">คุณมีรายงานที่ยังเปิดอยู่ แก้ไขแล้วกดบันทึกเพื่ออัปเดต หรือกด "แจ้งว่าปลอดภัยแล้ว" เมื่อสถานการณ์คลี่คลาย</div>':''}
   <div class="sec"><i>1</i>เกิดภัยอะไร</div>
   <div class="ptypes">${o.types.map((t,i)=>`<label><input type="radio" name="itype" value="${esc(t)}" ${act&&m.type==t?'checked':''} ${i==0?'required':''}><span>${TIC[t]||'⚠️'} ${esc(t)}</span></label>`).join('')}</div>
   <div class="sec"><i>2</i>สถานการณ์ตอนนี้</div>
   <div class="ptypes">${[3,2,1].map(k=>`<label><input type="radio" name="isev" value="${k}" ${act&&m.sev==k?'checked':''} required><span style="--c:${SEV[k].col}">${SEV[k].t}</span></label>`).join('')}</div>
   <div class="row"><div><label for="iPpl">จำนวนคนที่ได้รับผลกระทบ</label><input id="iPpl" type="number" min="1" value="${esc(act?m.people:base.h?.total??1)}"></div>
   <div><label for="iPhone">เบอร์ติดต่อกลับ *</label><input id="iPhone" type="tel" required value="${esc(m.phone||base.phone)}"></div></div>
   <div class="sec"><i>3</i>สิ่งที่ต้องการ</div>
   <div class="needs">${o.needs.map(n=>`<label><input type="checkbox" name="ineed" value="${esc(n)}" ${act&&(m.needs||[]).includes(n)?'checked':''}>${esc(n)}</label>`).join('')}</div>
   <label for="iDetail">รายละเอียดเพิ่มเติม</label><textarea id="iDetail">${esc(act?m.detail:'')}</textarea>
   <div class="sec"><i>4</i>ข้อมูลพนักงานและตำแหน่งที่ได้รับผลกระทบ</div>
   <div class="row"><div><label for="iId">รหัสพนักงาน *</label><input id="iId" required value="${esc(m.emp_id||base.emp_id)}"></div>
   <div><label for="iName">ชื่อ-นามสกุล *</label><input id="iName" required value="${esc(m.name||base.name)}"></div></div>
   <label for="iBr">สาขาที่ปฏิบัติงาน *</label><select id="iBr" required>${brOpts(m.branch_id||base.branch_id)}</select>
   ${locationBlock('iLL',act?m.lat+','+m.lng:(base.lat?base.lat+','+base.lng:''),'พิกัดที่ได้รับผลกระทบ *',base.lat?'ค่าเริ่มต้นคือที่พักที่ลงทะเบียนไว้ ถ้าอยู่ที่อื่น (เช่น ศูนย์พักพิง) ให้ปักหมุดใหม่ · ':'')}
   <label class="chk"><input type="checkbox" id="iOk" required>ยินยอมให้บริษัทใช้ข้อมูลนี้เพื่อประสานความช่วยเหลือเท่านั้น (PDPA)</label>
   <button class="btn red lg" id="iSend">🆘 ส่งรายงาน</button>
   ${act?'<button type="button" class="btn green lg" id="iSafe" style="margin-top:8px">✓ แจ้งว่าปลอดภัยแล้ว (ปิดรายงาน)</button>':''}
   <div id="iMsg"></div></form></div>`;
  bindTabs();
  const chk=bindLocation('iLL',()=>E.branches.find(b=>String(b.id)==$('#iBr').value));
  $('#iBr').onchange=chk;
  const send=async resolved=>{
    const msg=$('#iMsg'),ll=parseLL($('#iLL').value);
    if(!ll){msg.innerHTML='<div class="err">กรุณาระบุพิกัด</div>';return;}
    const g=n=>(document.querySelector(`input[name=${n}]:checked`)||{}).value;
    const row={user_id:E.uid,emp_id:$('#iId').value.trim(),name:$('#iName').value.trim(),branch_id:$('#iBr').value,type:g('itype')||m.type,sev:+(g('isev')||m.sev||2),
      people:Math.max(1,parseInt($('#iPpl').value)||1),phone:$('#iPhone').value.trim(),needs:[...document.querySelectorAll('input[name=ineed]:checked')].map(x=>x.value),
      detail:$('#iDetail').value.trim(),lat:ll[0],lng:ll[1],resolved:!!resolved,updated_at:new Date().toISOString()};
    if(!row.type||!row.emp_id||!row.name||!row.branch_id){msg.innerHTML='<div class="err">กรุณากรอกข้อมูลที่จำเป็นให้ครบ</div>';return;}
    $('#iSend').disabled=true;
    let r;
    if(act)r=await sb.from('incidents').update(row).eq('id',m.id).select().single();
    else r=await sb.from('incidents').insert({...row,code:'INC-'+Date.now().toString(36).toUpperCase()}).select().single();
    $('#iSend').disabled=false;
    if(r.error){msg.innerHTML=`<div class="err">ส่งไม่สำเร็จ: ${esc(r.error.message)}</div>`;return;}
    E.inc=r.data;
    msg.innerHTML=`<div class="ok"><b>${resolved?'ปิดรายงานแล้ว ขอบคุณที่แจ้ง':'ส่งรายงานเรียบร้อย'}</b>${resolved?'':` รหัสอ้างอิง <b>${esc(r.data.code)}</b> ผู้ดูแลจะติดต่อกลับตามเบอร์ที่ให้ไว้`}</div>`;
  };
  $('#f').onsubmit=e=>{e.preventDefault();send(false);};
  const sf=$('#iSafe');if(sf)sf.onclick=()=>send(true);
}
