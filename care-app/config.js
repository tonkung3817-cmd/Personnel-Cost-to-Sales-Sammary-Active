// ตั้งค่าการเชื่อมต่อ Supabase (ค่า anon key เป็นค่าสาธารณะได้ เพราะสิทธิ์ถูกควบคุมด้วย RLS ในฐานข้อมูล)
// Supabase > Project Settings > API
window.CARE_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-KEY',
  // จำกัดโดเมนอีเมลที่ล็อกอินได้ (ตรวจฝั่งหน้าเว็บ ควรตั้งเพิ่มใน Supabase Auth ด้วย) เว้นว่าง = ไม่จำกัด
  ALLOWED_EMAIL_DOMAIN: ''
};
