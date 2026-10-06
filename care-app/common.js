'use strict';
// ฟังก์ชันที่ใช้ร่วมกันทั้งหน้าพนักงานและหน้าผู้ดูแล
const CFG=window.CARE_CONFIG||{};
const sb=window.__sbMock||window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BANDS=[{t:'≤ 5 กม.',max:5,cls:'c1',col:'#43938F'},{t:'5–20 กม.',max:20,cls:'c2',col:'#306FC7'},{t:'20–50 กม.',max:50,cls:'c3',col:'#F6C24A'},{t:'> 50 กม.',max:1e9,cls:'c4',col:'#DA3832'}];
const band=d=>BANDS.findIndex(b=>d<=b.max);
const SEV={3:{t:'ฉุกเฉินเร่งด่วน',s:'ฉุกเฉิน',col:'#DA3832',cls:'c4'},2:{t:'ต้องการความช่วยเหลือ',s:'ต้องการช่วย',col:'#F6C24A',cls:'c3'},1:{t:'ปลอดภัยแต่ได้รับความเสียหาย',s:'ปลอดภัย',col:'#43938F',cls:'c1'}};
const DEF_OPTS={types:['น้ำท่วม','ไฟไหม้','แผ่นดินไหว','อื่นๆ'],needs:['อาหาร/น้ำดื่ม','ที่พักชั่วคราว','ยา/แพทย์','อพยพ/เรือ','ผ้าห่ม/เสื้อผ้า','ไฟฟ้า/แบตสำรอง','ค้นหา/กู้ภัย','เงินช่วยเหลือเร่งด่วน']};
const TIC={'น้ำท่วม':'🌊','ไฟไหม้':'🔥','แผ่นดินไหว':'🏚️'};
const hav=(a,b,c,d)=>{const R=6371,r=x=>x*Math.PI/180,p=r(c-a),q=r(d-b);const h=Math.sin(p/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(q/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
const norm=s=>String(s??'').toLowerCase().replace(/\s+|branch|สาขา/g,'');
const gmaps=ll=>`https://www.google.com/maps?q=${ll[0]},${ll[1]}`;

// รับพิกัดได้หลายรูปแบบ: "13.75,100.50", ลิงก์ Google Maps (@lat,lng / !3d..!4d.. / q=)
function parseLL(v){
  v=String(v||'');
  const m=v.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)||v.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/)||v.match(/(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{2,3}\.\d+)/);
  if(!m)return null;
  const a=+m[1],b=+m[2];
  if(a>=5&&a<=21&&b>=97&&b<=106)return[a,b];
  if(b>=5&&b<=21&&a>=97&&a<=106)return[b,a];
  return null;
}
// ปุ่ม "ใช้ตำแหน่งปัจจุบัน"
function useGeo(onPos,msgSel){
  const msg=$(msgSel);
  const fail=()=>{msg.innerHTML='<div class="note" style="margin-top:8px">อ่านตำแหน่งไม่ได้ กรุณาอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์ หรือคลิกบนแผนที่/วางพิกัดแทน</div>';};
  if(!navigator.geolocation)return fail();
  msg.innerHTML='<div class="hint">กำลังอ่านตำแหน่ง…</div>';
  navigator.geolocation.getCurrentPosition(p=>{msg.innerHTML=`<div class="hint">ความแม่นยำประมาณ ${Math.round(p.coords.accuracy)} เมตร</div>`;onPos(p.coords.latitude,p.coords.longitude);},fail,{enableHighAccuracy:true,timeout:15000});
}
// แผนที่เลือกจุด (คลิกหรือลากหมุด)
function pickMap(el,onPick,start){
  const m=L.map(el).setView(start||[13.0,101.0],start?16:6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(m);
  let pin=null;
  const set=(lat,lng,fly)=>{if(pin)pin.setLatLng([lat,lng]);else{pin=L.marker([lat,lng],{draggable:true}).addTo(m);pin.on('dragend',()=>{const p=pin.getLatLng();onPick(p.lat,p.lng)});}if(fly)m.setView([lat,lng],17);};
  m.on('click',e=>{set(e.latlng.lat,e.latlng.lng);onPick(e.latlng.lat,e.latlng.lng);});
  if(start)set(start[0],start[1]);
  return {set,map:m};
}

// ===== เข้าสู่ระบบด้วยอีเมล (รหัส OTP 6 หลัก) =====
async function requireLogin(onReady,title,sub){
  const {data}=await sb.auth.getSession();
  if(data&&data.session){onReady(data.session);return;}
  $('#app').innerHTML=`<div class="hero"><div class="wrap"><div><h1>${esc(title)}</h1><p>${esc(sub||'')}</p></div></div></div>
  <div class="wrap pull"><div class="card login"><h2>เข้าสู่ระบบ</h2><p class="sub">ใช้อีเมลบริษัท ระบบจะส่งรหัส 6 หลักไปให้</p>
   <label for="lEmail">อีเมล</label><input id="lEmail" type="email" autocomplete="email" placeholder="name@company.co.th">
   <div id="lCodeBox" class="hidden"><label for="lCode">รหัส 6 หลักจากอีเมล</label><input id="lCode" inputmode="numeric" maxlength="8" autocomplete="one-time-code"></div>
   <button class="btn lg" id="lBtn">ส่งรหัสเข้าอีเมล</button><div id="lMsg"></div></div></div>`;
  let step=1;
  $('#lBtn').onclick=async()=>{
    const email=$('#lEmail').value.trim().toLowerCase(),msg=$('#lMsg');
    if(!/^\S+@\S+\.\S+$/.test(email)){msg.innerHTML='<div class="err">กรุณากรอกอีเมลให้ถูกต้อง</div>';return;}
    if(CFG.ALLOWED_EMAIL_DOMAIN&&!email.endsWith('@'+CFG.ALLOWED_EMAIL_DOMAIN)){msg.innerHTML=`<div class="err">ใช้ได้เฉพาะอีเมล @${esc(CFG.ALLOWED_EMAIL_DOMAIN)}</div>`;return;}
    $('#lBtn').disabled=true;
    if(step==1){
      const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true}});
      $('#lBtn').disabled=false;
      if(error){msg.innerHTML=`<div class="err">ส่งรหัสไม่สำเร็จ: ${esc(error.message)}</div>`;return;}
      step=2;$('#lCodeBox').classList.remove('hidden');$('#lBtn').textContent='ยืนยันรหัส';msg.innerHTML='<div class="ok">ส่งรหัสแล้ว ตรวจสอบอีเมลของคุณ</div>';$('#lCode').focus();
    }else{
      const {data,error}=await sb.auth.verifyOtp({email,token:$('#lCode').value.trim(),type:'email'});
      $('#lBtn').disabled=false;
      if(error||!data.session){msg.innerHTML='<div class="err">รหัสไม่ถูกต้องหรือหมดอายุ</div>';return;}
      onReady(data.session);
    }
  };
}
const logoutBtn=()=>`<button class="pill" style="cursor:pointer;font:inherit" id="logout">ออกจากระบบ</button>`;
function bindLogout(){const b=$('#logout');if(b)b.onclick=async()=>{await sb.auth.signOut();location.reload();};}
function hero(t,s,extra=''){return `<div class="hero"><div class="wrap"><div><h1>${t}</h1><p>${s}</p></div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${extra}${logoutBtn()}</div></div></div>`}
