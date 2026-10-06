-- ศูนย์ดูแลพนักงานสาขา: โครงสร้างฐานข้อมูล Supabase (Postgres) + สิทธิ์รายแถว (RLS)
-- วิธีใช้: เปิด Supabase > SQL Editor > วางทั้งไฟล์ > Run

-- ===== ตาราง =====
create table if not exists public.branches (
  id    text primary key,          -- รหัสสาขา (Location)
  th    text,
  en    text,
  reg   text,                      -- ภาค (Regional)
  zone  text,                      -- เขต (Region)
  prov  text,
  lat   double precision,
  lng   double precision
);

create table if not exists public.staff_roles (   -- ผู้ดูแลและขอบเขตสิทธิ์
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin','region','branch')),
  regional   text[] not null default '{}',        -- ใช้เมื่อ role = region
  branch_ids text[] not null default '{}'         -- ใช้เมื่อ role = branch
);

create table if not exists public.profiles (      -- แบบสำรวจที่พักพนักงาน (1 คน 1 แถว)
  user_id    uuid primary key,                    -- auth.uid() ของพนักงาน (ข้อมูลจำลองใช้ uuid สุ่ม)
  emp_id     text not null,
  name       text not null,
  branch_id  text not null,
  address    text,
  lat        double precision not null,
  lng        double precision not null,
  phone      text,
  em_name    text,
  em_rel     text,
  em_phone   text,
  h          jsonb not null default '{}'::jsonb,  -- total, elderly, children, bedridden, disabled, pregnant
  note       text,
  updated_at timestamptz not null default now()
);
create index if not exists profiles_branch_idx on public.profiles(branch_id);

create table if not exists public.incidents (     -- รายงานประสบภัย
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  user_id    uuid,
  emp_id     text not null,
  name       text not null,
  branch_id  text not null,
  type       text not null,
  sev        int  not null check (sev between 1 and 3),   -- 3 ฉุกเฉิน, 2 ต้องการช่วย, 1 ปลอดภัยแต่เสียหาย
  people     int  not null default 1,
  phone      text,
  needs      text[] not null default '{}',
  detail     text,
  lat        double precision not null,
  lng        double precision not null,
  resolved   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists incidents_branch_idx on public.incidents(branch_id);
create index if not exists incidents_user_idx on public.incidents(user_id);

create table if not exists public.triage (        -- บันทึกของผู้ดูแล (พนักงานไม่เห็น)
  kind       text not null check (kind in ('emp','inc')),
  ref        text not null,                       -- user_id หรือ incident id
  branch_id  text not null,
  status     text,
  org        text,
  note       text,
  updated_at timestamptz not null default now(),
  primary key (kind, ref)
);

create table if not exists public.options (       -- รายการประเภทภัย / สิ่งที่ต้องการ
  key   text primary key,
  value jsonb not null
);

-- ===== ฟังก์ชันสิทธิ์ =====
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_roles r where r.user_id = auth.uid() and r.role = 'admin');
$$;

create or replace function public.can_see_branch(bid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff_roles r
    where r.user_id = auth.uid()
      and ( r.role = 'admin'
         or (r.role = 'branch' and bid = any (r.branch_ids))
         or (r.role = 'region' and exists (select 1 from branches b where b.id = bid and b.reg = any (r.regional))) )
  );
$$;

-- ===== เปิด RLS =====
alter table public.branches    enable row level security;
alter table public.staff_roles enable row level security;
alter table public.profiles    enable row level security;
alter table public.incidents   enable row level security;
alter table public.triage      enable row level security;
alter table public.options     enable row level security;

-- branches / options: ผู้ที่ล็อกอินอ่านได้ (ให้พนักงานเลือกสาขา) แก้ไขได้เฉพาะ admin
create policy branches_read  on public.branches for select to authenticated using (true);
create policy branches_write on public.branches for all    to authenticated using (is_admin()) with check (is_admin());
create policy options_read   on public.options  for select to authenticated using (true);
create policy options_write  on public.options  for all    to authenticated using (is_admin()) with check (is_admin());

-- staff_roles: อ่านได้เฉพาะแถวของตัวเอง (admin เห็นทั้งหมดและแก้ไขได้)
create policy roles_self  on public.staff_roles for select to authenticated using (user_id = auth.uid() or is_admin());
create policy roles_admin on public.staff_roles for all    to authenticated using (is_admin()) with check (is_admin());

-- profiles: พนักงานจัดการแถวของตัวเอง / ผู้ดูแลเห็นตามขอบเขตสาขา / admin จัดการได้ทั้งหมด
create policy profiles_own_select on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profiles_own_insert on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy profiles_own_update on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_staff_select on public.profiles for select to authenticated using (can_see_branch(branch_id));
create policy profiles_admin_all    on public.profiles for all    to authenticated using (is_admin()) with check (is_admin());

-- incidents: เช่นเดียวกับ profiles
create policy inc_own_select on public.incidents for select to authenticated using (user_id = auth.uid());
create policy inc_own_insert on public.incidents for insert to authenticated with check (user_id = auth.uid());
create policy inc_own_update on public.incidents for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy inc_staff_select on public.incidents for select to authenticated using (can_see_branch(branch_id));
create policy inc_staff_update on public.incidents for update to authenticated using (can_see_branch(branch_id)) with check (can_see_branch(branch_id));
create policy inc_admin_all    on public.incidents for all    to authenticated using (is_admin()) with check (is_admin());

-- triage: เฉพาะผู้ดูแลตามขอบเขตสาขา (พนักงานไม่เห็น)
create policy triage_staff on public.triage for all to authenticated
  using (can_see_branch(branch_id)) with check (can_see_branch(branch_id));

-- ===== สร้างผู้ดูแลคนแรก =====
-- 1) ให้ผู้ดูแลเข้าสู่ระบบที่หน้า admin.html หนึ่งครั้งเพื่อสร้างบัญชี
-- 2) รันคำสั่งด้านล่าง (แก้อีเมล):
--
-- insert into public.staff_roles (user_id, role)
--   select id, 'admin' from auth.users where email = 'admin@example.com';
--
-- ผู้ดูแลระดับภาค:
-- insert into public.staff_roles (user_id, role, regional)
--   select id, 'region', array['North'] from auth.users where email = 'north.manager@example.com';
--
-- ผู้ดูแลระดับสาขา:
-- insert into public.staff_roles (user_id, role, branch_ids)
--   select id, 'branch', array['1','2'] from auth.users where email = 'branch.manager@example.com';
