-- ════════════════════════════════════════════════════════════════════════════
-- QR Studio — Complete Supabase Database Schema & Migration Script
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
--
-- SECURITY NOTES (applies to all tables):
--  * Row Level Security (RLS) is ENABLED and locked down on every table.
--  * Anonymous (anon) requests get NOTHING. Every query must be authenticated.
--  * READ: any authenticated user can view operational data.
--  * WRITE: only admins (and designers for templates) can modify data.
--  * Users can only ever see / edit their OWN user_profiles row.
--  * `handle_new_user` never trusts the role from sign-up metadata. The first
--    registered user is bootstrapped as admin; every other self-signup is 'user'.
--    Roles are only promotable through the admin-only `upsert_user_profile` RPC,
--    which (for non-admins) refuses to escalate a role.
--  * A BEFORE-UPDATE/INSERT trigger clamps role escalations so a user can never
--    promote themselves to admin/designer through a direct table write.
-- ════════════════════════════════════════════════════════════════════════════

-- Common updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLE HELPERS (security definer so they bypass RLS when called from policies)
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.user_role(uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.user_profiles where id = uid), 'user');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' and is_active from public.user_profiles where id = auth.uid()), false);
$$;

create or replace function public.is_designer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (role in ('admin','designer')) and is_active from public.user_profiles where id = auth.uid()), false);
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- USER PROFILE ROW (admin-only managed; self-guarded)
-- ════════════════════════════════════════════════════════════════════════════

-- Guard: a user may only keep their own existing role; they can never escalate
-- (and never grant admin/designer on insert). Admins are exempt.
create or replace function public.guard_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_is_admin boolean := public.is_admin();
begin
  if not acting_is_admin then
    if tg_op = 'INSERT' then
      new.role := 'user';
    elsif tg_op = 'UPDATE' then
      -- preserve the stored role; ignore any attempt to escalate
      new.role := coalesce(old.role, 'user');
      -- a user may not deactivate themselves
      new.is_active := coalesce(old.is_active, true);
    end if;
  end if;
  return new;
end $$;

-- Secure write path for user_profiles. Admin may set any role; a normal user
-- may only create/refresh their OWN row and can never escalate their role.
create or replace function public.upsert_user_profile(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid := (p->>'id')::uuid;
  v_email  text := lower(coalesce(p->>'email', ''));
  v_role   text := lower(coalesce(p->>'role', 'user'));
  v_admin  boolean := public.is_admin();
  v_self   boolean := auth.uid() = v_id;
begin
  if v_role not in ('admin','designer','user') then v_role := 'user'; end if;

  if not v_admin and not v_self then
    raise exception 'not allowed';
  end if;

  if not v_admin then
    -- non-admin: can only touch their own row and cannot escalate authority
    v_role := 'user';
  end if;

  insert into public.user_profiles
    (id, email, full_name, role, allowed_template_categories, allowed_plants, is_active, created_at, updated_at)
  values
    (v_id, v_email, coalesce(p->>'full_name',''), v_role,
     coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'allowed_template_categories','[]')::jsonb) as x), array['All']),
     coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'allowed_plants','[]')::jsonb) as x), array['All']),
     coalesce((p->>'is_active')::boolean, true),
     coalesce((p->>'created_at')::timestamptz, now()),
     now())
  on conflict (id) do update set
    full_name                   = excluded.full_name,
    role                        = excluded.role,
    allowed_template_categories = excluded.allowed_template_categories,
    allowed_plants              = excluded.allowed_plants,
    is_active                   = excluded.is_active,
    updated_at                  = now();
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. USER PROFILES TABLE
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.user_profiles (
    id                          uuid primary key references auth.users (id) on delete cascade,
    email                       text not null unique,
    full_name                   text not null default '',
    role                        text not null default 'user',             -- 'admin' | 'designer' | 'user'
    allowed_template_categories text[] not null default array['All'],
    allowed_plants              text[] not null default array['All'],
    is_active                   boolean not null default true,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now()
);

alter table public.user_profiles add column if not exists full_name text not null default '';
alter table public.user_profiles add column if not exists role text not null default 'user';
alter table public.user_profiles add column if not exists allowed_template_categories text[] not null default array['All'];
alter table public.user_profiles add column if not exists allowed_plants text[] not null default array['All'];
alter table public.user_profiles add column if not exists is_active boolean not null default true;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_user_profiles_guard_role on public.user_profiles;
create trigger trg_user_profiles_guard_role
  before insert or update on public.user_profiles
  for each row execute function public.guard_user_role();

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select" on public.user_profiles;
create policy "user_profiles_select" on public.user_profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "user_profiles_insert" on public.user_profiles;
create policy "user_profiles_insert" on public.user_profiles
  for insert with check (auth.uid() = id or public.is_admin());

drop policy if exists "user_profiles_update" on public.user_profiles;
create policy "user_profiles_update" on public.user_profiles
  for update using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

drop policy if exists "user_profiles_delete" on public.user_profiles;
create policy "user_profiles_delete" on public.user_profiles
  for delete using (public.is_admin());

-- Auto-create a profile row on signup. The first registered user becomes the
-- bootstrap admin; every subsequent self-signup is always forced to 'user'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when not exists (select 1 from public.user_profiles) then 'admin'
         else 'user'
    end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════════════
-- 2. TEMPLATES TABLE (designers & admins may write)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.templates (
    id                   text primary key,
    title                text not null,
    description          text default '',
    category             text,
    category_key         text,
    access_scope         text[] default array['admin'],
    access_level         text default 'Public',
    icon                 text default '🏷️',
    schema_key           text,
    schema               jsonb default '{}',
    layout               jsonb,
    sample_batch         jsonb default '[]',
    default_sheet_preset text default 'a4-24up',
    created_by           text,
    updated_by           text,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

alter table public.templates add column if not exists title text not null default 'Untitled';
alter table public.templates add column if not exists description text default '';
alter table public.templates add column if not exists category text;
alter table public.templates add column if not exists category_key text;
alter table public.templates add column if not exists access_scope text[] default array['admin'];
alter table public.templates add column if not exists access_level text default 'Public';
alter table public.templates add column if not exists icon text default '🏷️';
alter table public.templates add column if not exists schema_key text;
alter table public.templates add column if not exists schema jsonb default '{}';
alter table public.templates add column if not exists layout jsonb;
alter table public.templates add column if not exists sample_batch jsonb default '[]';
alter table public.templates add column if not exists default_sheet_preset text default 'a4-24up';
alter table public.templates add column if not exists created_by text;
alter table public.templates add column if not exists updated_by text;

drop trigger if exists trg_templates_updated_at on public.templates;
create trigger trg_templates_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

alter table public.templates enable row level security;

drop policy if exists "templates_select" on public.templates;
create policy "templates_select" on public.templates
  for select using (auth.role() = 'authenticated');

drop policy if exists "templates_insert" on public.templates;
create policy "templates_insert" on public.templates
  for insert with check (public.is_designer());

drop policy if exists "templates_update" on public.templates;
create policy "templates_update" on public.templates
  for update using (public.is_designer()) with check (public.is_designer());

drop policy if exists "templates_delete" on public.templates;
create policy "templates_delete" on public.templates
  for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 3. MASTER DATA TABLE (admin writable)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.master_data (
    id         text primary key,
    type       text not null,                -- 'plant' | 'vendor' | 'financial_year' | 'month' | 'category' | 'group' | 'color' | 'warranty' | 'variable'
    code       text not null,                -- unique id used in dropdowns
    label      text not null,
    meta       jsonb default '{}',           -- plant settings / vendor plant mapping / defaults
    created_by text,
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint master_data_type_code unique (type, code)
);

alter table public.master_data add column if not exists meta jsonb default '{}';
alter table public.master_data add column if not exists created_by text;
alter table public.master_data add column if not exists updated_by text;

create index if not exists master_data_type_idx on public.master_data (type);

drop trigger if exists trg_master_data_updated_at on public.master_data;
create trigger trg_master_data_updated_at
  before update on public.master_data
  for each row execute function public.set_updated_at();

alter table public.master_data enable row level security;

drop policy if exists "master_data_select" on public.master_data;
create policy "master_data_select" on public.master_data
  for select using (auth.role() = 'authenticated');

drop policy if exists "master_data_insert" on public.master_data;
create policy "master_data_insert" on public.master_data
  for insert with check (public.is_admin());

drop policy if exists "master_data_update" on public.master_data;
create policy "master_data_update" on public.master_data
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "master_data_delete" on public.master_data;
create policy "master_data_delete" on public.master_data
  for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 4. PRODUCTS TABLE (admin writable)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.products (
    id                   text primary key,
    sku                  text not null unique,
    title                text not null,
    catalog_code         text default '',
    short_code           text default '',
    category             text default 'General',
    plant                text default 'KSPL',
    group_name           text default 'Bathware',
    color                text default 'CP',
    warranty             text default '5 Years',
    dp                   numeric default 0,
    mrp                  numeric default 0,
    price                text default '₹0.00',
    orig_price           text default '₹0.00',
    description          text default '',
    serial_prefix        text default 'SN-',
    next_serial_sequence integer default 1001,
    serial_padding       integer default 5,
    variables            jsonb default '[]',
    default_variables    jsonb default '{}',
    created_by           text,
    updated_by           text,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

alter table public.products add column if not exists sku text;
alter table public.products add column if not exists title text;
alter table public.products add column if not exists catalog_code text default '';
alter table public.products add column if not exists short_code text default '';
alter table public.products add column if not exists category text default 'General';
alter table public.products add column if not exists plant text default 'KSPL';
alter table public.products add column if not exists group_name text default 'Bathware';
alter table public.products add column if not exists color text default 'CP';
alter table public.products add column if not exists warranty text default '5 Years';
alter table public.products add column if not exists dp numeric default 0;
alter table public.products add column if not exists mrp numeric default 0;
alter table public.products add column if not exists price text default '₹0.00';
alter table public.products add column if not exists orig_price text default '₹0.00';
alter table public.products add column if not exists description text default '';
alter table public.products add column if not exists serial_prefix text default 'SN-';
alter table public.products add column if not exists next_serial_sequence integer default 1001;
alter table public.products add column if not exists serial_padding integer default 5;
alter table public.products add column if not exists variables jsonb default '[]';
alter table public.products add column if not exists default_variables jsonb default '{}';
alter table public.products add column if not exists created_by text;
alter table public.products add column if not exists updated_by text;

create index if not exists products_sku_idx on public.products (sku);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_plant_idx on public.products (plant);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

drop policy if exists "products_select" on public.products;
create policy "products_select" on public.products
  for select using (auth.role() = 'authenticated');

drop policy if exists "products_insert" on public.products;
create policy "products_insert" on public.products
  for insert with check (public.is_admin());

drop policy if exists "products_update" on public.products;
create policy "products_update" on public.products
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "products_delete" on public.products;
create policy "products_delete" on public.products
  for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 5. SERIALIZED UNITS TABLE (admin writable)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.serialized_units (
    id              text primary key,
    serial_number   text not null unique,
    product_id      text references public.products (id) on delete cascade,
    sku             text default '',
    product_title   text default '',
    price           text default '',
    dp              text default '',
    mrp             text default '',
    category        text default '',
    plant           text default '',
    group_name      text default '',
    color           text default '',
    warranty        text default '',
    variables       jsonb default '{}',
    status          text default 'In Stock',
    last_printed_at timestamptz,
    print_count     integer default 0,
    created_by      text,
    updated_by      text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

alter table public.serialized_units add column if not exists sku text default '';
alter table public.serialized_units add column if not exists product_title text default '';
alter table public.serialized_units add column if not exists price text default '';
alter table public.serialized_units add column if not exists dp text default '';
alter table public.serialized_units add column if not exists mrp text default '';
alter table public.serialized_units add column if not exists category text default '';
alter table public.serialized_units add column if not exists plant text default '';
alter table public.serialized_units add column if not exists group_name text default '';
alter table public.serialized_units add column if not exists color text default '';
alter table public.serialized_units add column if not exists warranty text default '';
alter table public.serialized_units add column if not exists variables jsonb default '{}';
alter table public.serialized_units add column if not exists status text default 'In Stock';
alter table public.serialized_units add column if not exists last_printed_at timestamptz;
alter table public.serialized_units add column if not exists print_count integer default 0;
alter table public.serialized_units add column if not exists created_by text;
alter table public.serialized_units add column if not exists updated_by text;
alter table public.serialized_units add column if not exists batch_number text;

create index if not exists serialized_units_sn_idx on public.serialized_units (serial_number);
create index if not exists serialized_units_prod_idx on public.serialized_units (product_id);
create index if not exists serialized_units_sku_idx on public.serialized_units (sku);

drop trigger if exists trg_serialized_units_updated_at on public.serialized_units;
create trigger trg_serialized_units_updated_at
  before update on public.serialized_units
  for each row execute function public.set_updated_at();

alter table public.serialized_units enable row level security;

drop policy if exists "serialized_units_select" on public.serialized_units;
create policy "serialized_units_select" on public.serialized_units
  for select using (auth.role() = 'authenticated');

drop policy if exists "serialized_units_insert" on public.serialized_units;
create policy "serialized_units_insert" on public.serialized_units
  for insert with check (public.is_admin());

drop policy if exists "serialized_units_update" on public.serialized_units;
create policy "serialized_units_update" on public.serialized_units
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "serialized_units_delete" on public.serialized_units;
create policy "serialized_units_delete" on public.serialized_units
  for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 6. EMPLOYEES & ID BADGES TABLE (admin writable)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.employees (
    id              text primary key,
    employee_id     text not null unique,
    name            text not null,
    designation     text default '',
    department      text default '',
    company         text default 'Kajaria Bathware',
    blood_group     text default '',
    join_date       text default '',
    email           text default '',
    phone           text default '',
    access_tier     text default 'Standard',
    rfid_badge_uid  text default '',
    variables       jsonb default '{}',
    badge_status    text default 'Active',
    last_printed_at timestamptz,
    print_count     integer default 0,
    created_by      text,
    updated_by      text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

alter table public.employees add column if not exists designation text default '';
alter table public.employees add column if not exists department text default '';
alter table public.employees add column if not exists company text default 'Kajaria Bathware';
alter table public.employees add column if not exists blood_group text default '';
alter table public.employees add column if not exists join_date text default '';
alter table public.employees add column if not exists email text default '';
alter table public.employees add column if not exists phone text default '';
alter table public.employees add column if not exists access_tier text default 'Standard';
alter table public.employees add column if not exists rfid_badge_uid text default '';
alter table public.employees add column if not exists variables jsonb default '{}';
alter table public.employees add column if not exists badge_status text default 'Active';
alter table public.employees add column if not exists last_printed_at timestamptz;
alter table public.employees add column if not exists print_count integer default 0;
alter table public.employees add column if not exists created_by text;
alter table public.employees add column if not exists updated_by text;

create index if not exists employees_emp_id_idx on public.employees (employee_id);
create index if not exists employees_dept_idx on public.employees (department);

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

alter table public.employees enable row level security;

drop policy if exists "employees_select" on public.employees;
create policy "employees_select" on public.employees
  for select using (auth.role() = 'authenticated');

drop policy if exists "employees_insert" on public.employees;
create policy "employees_insert" on public.employees
  for insert with check (public.is_admin());

drop policy if exists "employees_update" on public.employees;
create policy "employees_update" on public.employees
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "employees_delete" on public.employees;
create policy "employees_delete" on public.employees
  for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 7. COMPANY BRANDING / WHITE-LABEL PROFILE (single row, admin writable)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.company_profile (
    id text primary key,
    company_name text default '',
    brand_name text default '',
    address text default '',
    email text default '',
    phone text default '',
    website text default '',
    logo_data_url text default '',
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists trg_company_profile_updated_at on public.company_profile;
create trigger trg_company_profile_updated_at
  before update on public.company_profile
  for each row execute function public.set_updated_at();

alter table public.company_profile enable row level security;

drop policy if exists "company_profile_select" on public.company_profile;
create policy "company_profile_select" on public.company_profile
  for select using (auth.role() = 'authenticated');

drop policy if exists "company_profile_insert" on public.company_profile;
create policy "company_profile_insert" on public.company_profile
  for insert with check (public.is_admin());

drop policy if exists "company_profile_update" on public.company_profile;
create policy "company_profile_update" on public.company_profile
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "company_profile_delete" on public.company_profile;
create policy "company_profile_delete" on public.company_profile
  for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 8. PRODUCTION BATCHES (admin writable)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.batches (
    id text primary key,
    batch_number text not null unique,
    product_id text,
    sku text default '',
    product_title text default '',
    plant text default '',
    lot_quantity integer default 0,
    mfg_date text default '',
    shift text default '',
    status text default 'In Stock',
    generated_at timestamptz not null default now(),
    created_by text,
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists trg_batches_updated_at on public.batches;
create trigger trg_batches_updated_at
  before update on public.batches
  for each row execute function public.set_updated_at();

alter table public.batches enable row level security;

drop policy if exists "batches_select" on public.batches;
create policy "batches_select" on public.batches for select using (auth.role() = 'authenticated');

drop policy if exists "batches_insert" on public.batches;
create policy "batches_insert" on public.batches for insert with check (public.is_admin());

drop policy if exists "batches_update" on public.batches;
create policy "batches_update" on public.batches for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "batches_delete" on public.batches;
create policy "batches_delete" on public.batches for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 9. LOGIC RULES (Serial Number & Batch Number formats) — shared across devices
--    One row per rule type ('serial' | 'batch'), holding the full rule array
--    (segment order, inclusions, delimiters, sequence settings) as JSON.
--    This is what makes settings identical no matter where you log in.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.logic_rules (
    type       text primary key,        -- 'serial' | 'batch'
    rules      jsonb not null default '[]',
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists trg_logic_rules_updated_at on public.logic_rules;
create trigger trg_logic_rules_updated_at
  before update on public.logic_rules
  for each row execute function public.set_updated_at();

alter table public.logic_rules enable row level security;

-- any authenticated user (every operator/designer/admin) may read the shared rules
drop policy if exists "logic_rules_select" on public.logic_rules;
create policy "logic_rules_select" on public.logic_rules
  for select using (auth.role() = 'authenticated');

-- only admins may change the global rule structure
drop policy if exists "logic_rules_insert" on public.logic_rules;
create policy "logic_rules_insert" on public.logic_rules
  for insert with check (public.is_admin());

drop policy if exists "logic_rules_update" on public.logic_rules;
create policy "logic_rules_update" on public.logic_rules
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "logic_rules_delete" on public.logic_rules;
create policy "logic_rules_delete" on public.logic_rules
  for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 10. ROLE & ACCESS CONTROL (per-role page + action permissions)
--     Maps which pages (view) and actions (create/edit/delete) each role gets.
--     Admin is always full-access (enforced in the app; not stored). Only admin
--     may edit; any authenticated user may read their own role's permissions.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.role_permissions (
    role       text not null,
    page       text not null,
    can_view   boolean not null default false,
    can_create boolean not null default false,
    can_edit   boolean not null default false,
    can_delete boolean not null default false,
    updated_by text,
    updated_at timestamptz not null default now(),
    primary key (role, page)
);

drop trigger if exists trg_role_permissions_updated_at on public.role_permissions;
create trigger trg_role_permissions_updated_at
  before update on public.role_permissions
  for each row execute function public.set_updated_at();

alter table public.role_permissions enable row level security;

-- any authenticated user may read permissions (used to render nav / gates)
drop policy if exists "role_permissions_select" on public.role_permissions;
create policy "role_permissions_select" on public.role_permissions
  for select using (auth.role() = 'authenticated');

-- only admins may modify the access-control matrix
drop policy if exists "role_permissions_insert" on public.role_permissions;
create policy "role_permissions_insert" on public.role_permissions
  for insert with check (public.is_admin());

drop policy if exists "role_permissions_update" on public.role_permissions;
create policy "role_permissions_update" on public.role_permissions
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "role_permissions_delete" on public.role_permissions;
create policy "role_permissions_delete" on public.role_permissions
  for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 11. AUDIT LOG (who did what, when)
--     Append-only. Any authenticated user records their own actions; admins may
--     read/delete (maintenance). Designed for the audit-trail viewer.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.audit_logs (
    id          text primary key,
    actor_email text,
    actor_role  text,
    action      text not null,          -- 'create'|'update'|'delete'|'print'|'restore'|'login'
    entity_type text not null,          -- 'product'|'employee'|'serial'|'batch'|'template'|'master_data'|'user'|'print_job'
    entity_id   text,
    entity_label text,
    changes     jsonb default '{}',
    created_at  timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs
  for select using (auth.role() = 'authenticated');

drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "audit_logs_delete" on public.audit_logs;
create policy "audit_logs_delete" on public.audit_logs
  for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 12. PRINTERS (label device presets)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.printers (
    id              text primary key,
    name            text not null,
    brand           text default 'Zebra',
    model           text default '',
    dpi             integer default 203,
    label_width_mm  numeric default 100,
    label_height_mm numeric default 50,
    is_default      boolean default false,
    created_by      text,
    updated_by      text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

drop trigger if exists trg_printers_updated_at on public.printers;
create trigger trg_printers_updated_at before update on public.printers
  for each row execute function public.set_updated_at();

alter table public.printers enable row level security;

drop policy if exists "printers_select" on public.printers;
create policy "printers_select" on public.printers for select using (auth.role() = 'authenticated');
drop policy if exists "printers_insert" on public.printers;
create policy "printers_insert" on public.printers for insert with check (public.is_admin());
drop policy if exists "printers_update" on public.printers;
create policy "printers_update" on public.printers for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "printers_delete" on public.printers;
create policy "printers_delete" on public.printers for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 13. PRINT JOBS (history + reprint)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.print_jobs (
    id           text primary key,
    actor_email  text,
    entity_type  text,
    entity_id    text,
    entity_label text,
    format       text default 'ZPL',
    dpi          integer default 203,
    quantity     integer default 1,
    printer_name text default '',
    created_at   timestamptz not null default now()
);

create index if not exists print_jobs_created_idx on public.print_jobs (created_at desc);

alter table public.print_jobs enable row level security;

drop policy if exists "print_jobs_select" on public.print_jobs;
create policy "print_jobs_select" on public.print_jobs for select using (auth.role() = 'authenticated');
drop policy if exists "print_jobs_insert" on public.print_jobs;
create policy "print_jobs_insert" on public.print_jobs for insert with check (auth.role() = 'authenticated');
drop policy if exists "print_jobs_delete" on public.print_jobs;
create policy "print_jobs_delete" on public.print_jobs for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 14. TEMPLATE VERSIONS (snapshots for restore)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.template_versions (
    id           text primary key,
    template_id  text not null,
    title        text,
    layout       jsonb,
    sample_batch jsonb,
    version      integer default 1,
    saved_by     text,
    created_at   timestamptz not null default now()
);

create index if not exists template_versions_tpl_idx on public.template_versions (template_id, created_at desc);

alter table public.template_versions enable row level security;

drop policy if exists "template_versions_select" on public.template_versions;
create policy "template_versions_select" on public.template_versions for select using (auth.role() = 'authenticated');
drop policy if exists "template_versions_insert" on public.template_versions;
create policy "template_versions_insert" on public.template_versions
  for insert with check (public.is_designer());
drop policy if exists "template_versions_delete" on public.template_versions;
create policy "template_versions_delete" on public.template_versions for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 15. ROLES (custom roles for RBAC)
--     System roles (admin/designer/user) are seeded; admins may add custom
--     roles (e.g. "Warehouse", "QC", "Dispatch") that map to role_permissions.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.roles (
    id          text primary key,
    name        text not null,
    description text default '',
    is_system   boolean default false,
    created_by  text,
    updated_by  text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Seed the three system roles (idempotent)
insert into public.roles (id, name, description, is_system)
values
    ('admin', 'Administrator', 'Full system & user control.', true),
    ('designer', 'Label Designer', 'Create & modify labels, templates, catalog.', true),
    ('user', 'Print Operator', 'Print-only with restricted access.', true)
on conflict (id) do nothing;

drop trigger if exists trg_roles_updated_at on public.roles;
create trigger trg_roles_updated_at before update on public.roles
  for each row execute function public.set_updated_at();

alter table public.roles enable row level security;

drop policy if exists "roles_select" on public.roles;
create policy "roles_select" on public.roles for select using (auth.role() = 'authenticated');
drop policy if exists "roles_insert" on public.roles;
create policy "roles_insert" on public.roles for insert with check (public.is_admin());
drop policy if exists "roles_update" on public.roles;
create policy "roles_update" on public.roles for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "roles_delete" on public.roles;
create policy "roles_delete" on public.roles for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 16. PUBLIC SERIAL VERIFICATION (used by the public verify-serial page)
--     Security definer so anon callers can verify a serial number over PostgREST
--     RPC without exposing the rest of the table. Returns limited data only.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.verify_serial(sn text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select serial_number, product_title, sku, plant, status into v
  from public.serialized_units
  where upper(serial_number) = upper(coalesce(sn, ''))
  limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'message', 'Serial number not found');
  end if;

  return jsonb_build_object(
    'valid', true,
    'serial_number', v.serial_number,
    'product', coalesce(v.product_title, ''),
    'sku', coalesce(v.sku, ''),
    'plant', coalesce(v.plant, ''),
    'status', coalesce(v.status, '')
  );
end $$;

grant execute on function public.verify_serial(text) to anon, authenticated;
