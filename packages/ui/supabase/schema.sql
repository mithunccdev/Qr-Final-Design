-- ════════════════════════════════════════════════════════════════════════════
-- QR Studio — Complete Supabase Database Schema & Migration Script
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
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

-- ── 1. USER PROFILES TABLE ──────────────────────────────────────────────────
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

-- Migration safety for existing user_profiles table
alter table public.user_profiles add column if not exists full_name text not null default '';
alter table public.user_profiles add column if not exists role text not null default 'user';
alter table public.user_profiles add column if not exists allowed_template_categories text[] not null default array['All'];
alter table public.user_profiles add column if not exists allowed_plants text[] not null default array['All'];
alter table public.user_profiles add column if not exists is_active boolean not null default true;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;

drop policy if exists "profiles_all_access" on public.user_profiles;
create policy "profiles_all_access" on public.user_profiles
  for all using (true) with check (true);

-- Auto-create a profile row on signup
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
    coalesce(new.raw_user_meta_data->>'role', 'user')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. TEMPLATES TABLE ──────────────────────────────────────────────────────
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

-- Migration safety for existing templates table
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

drop policy if exists "templates_all_access" on public.templates;
create policy "templates_all_access" on public.templates
  for all using (true) with check (true);

-- ── 3. MASTER DATA TABLE ────────────────────────────────────────────────────
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

-- Migration safety for existing master_data table
alter table public.master_data add column if not exists meta jsonb default '{}';
alter table public.master_data add column if not exists created_by text;
alter table public.master_data add column if not exists updated_by text;

create index if not exists master_data_type_idx on public.master_data (type);

drop trigger if exists trg_master_data_updated_at on public.master_data;
create trigger trg_master_data_updated_at
  before update on public.master_data
  for each row execute function public.set_updated_at();

alter table public.master_data enable row level security;

drop policy if exists "master_data_all_access" on public.master_data;
create policy "master_data_all_access" on public.master_data
  for all using (true) with check (true);

-- ── 4. PRODUCTS TABLE ───────────────────────────────────────────────────────
create table if not exists public.products (
    id                   text primary key,
    sku                  text not null unique,
    title                text not null,
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

-- Migration safety: Add any missing columns to existing products table
alter table public.products add column if not exists sku text;
alter table public.products add column if not exists title text;
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

drop policy if exists "products_all_access" on public.products;
create policy "products_all_access" on public.products
  for all using (true) with check (true);

-- ── 5. SERIALIZED UNITS TABLE ───────────────────────────────────────────────
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

-- Migration safety: Add any missing columns to existing serialized_units table
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

create index if not exists serialized_units_sn_idx on public.serialized_units (serial_number);
create index if not exists serialized_units_prod_idx on public.serialized_units (product_id);
create index if not exists serialized_units_sku_idx on public.serialized_units (sku);

drop trigger if exists trg_serialized_units_updated_at on public.serialized_units;
create trigger trg_serialized_units_updated_at
  before update on public.serialized_units
  for each row execute function public.set_updated_at();

alter table public.serialized_units enable row level security;

drop policy if exists "serialized_units_all_access" on public.serialized_units;
create policy "serialized_units_all_access" on public.serialized_units
  for all using (true) with check (true);

-- ── 6. EMPLOYEES & ID BADGES TABLE ──────────────────────────────────────────
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

-- Migration safety: Add any missing columns to existing employees table
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

drop policy if exists "employees_all_access" on public.employees;
create policy "employees_all_access" on public.employees
  for all using (true) with check (true);


-- ?? Company branding / white-label profile (single row) ???????????????????????
-- Stored in the database so the app name, logo and contact details are shared
-- across every device; localStorage is only an offline cache.
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
  for select using (auth.role() = ''authenticated'');
drop policy if exists "company_profile_insert" on public.company_profile;
create policy "company_profile_insert" on public.company_profile
  for insert with check (auth.role() = ''authenticated'');
drop policy if exists "company_profile_update" on public.company_profile;
create policy "company_profile_update" on public.company_profile
  for update using (auth.role() = ''authenticated'');
drop policy if exists "company_profile_delete" on public.company_profile;
create policy "company_profile_delete" on public.company_profile
  for delete using (auth.role() = ''authenticated'');
