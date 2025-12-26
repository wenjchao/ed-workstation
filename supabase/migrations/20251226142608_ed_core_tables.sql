create extension if not exists "pgcrypto";

-- Patients (multi-patient support)
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  mrn text,
  name text not null,
  sex text,
  dob date,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Encounters (one ED visit per patient)
create table if not exists public.encounters (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  arrival_at timestamptz,
  location text,
  status text not null default 'active',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  code text,
  name text not null,
  status text not null default 'sent',
  occurred_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Results (labs/imaging/etc)
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  category text not null, -- lab|imaging|vitals|ekg...
  code text,
  name text not null,
  value text,
  unit text,
  flag text, -- high|low|normal|abnormal
  occurred_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- DDX (human + AI)
create table if not exists public.ddx_entries (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  source text not null check (source in ('human','ai')),
  name text not null,
  prob numeric,
  reason text,
  occurred_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- AI run audit log (provider/model switchable)
create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  provider text not null, -- gemini|openai|anthropic...
  model text not null,
  status text not null default 'completed',
  prompt jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- AI suggestions (normalized, displayable)
create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  ai_run_id uuid not null references public.ai_runs(id) on delete cascade,
  suggestion_type text not null, -- diagnosis|order
  code text,
  name text not null,
  prob numeric,
  reason text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Timeline (records every event)
create table if not exists public.patient_events (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('human','ai','system')),
  event_type text not null,
  entity_table text,
  entity_id uuid,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- updated_at triggers
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_patients_updated_at on public.patients;
create trigger trg_patients_updated_at before update on public.patients
for each row execute function public.set_updated_at();

drop trigger if exists trg_encounters_updated_at on public.encounters;
create trigger trg_encounters_updated_at before update on public.encounters
for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_results_updated_at on public.results;
create trigger trg_results_updated_at before update on public.results
for each row execute function public.set_updated_at();

drop trigger if exists trg_ddx_updated_at on public.ddx_entries;
create trigger trg_ddx_updated_at before update on public.ddx_entries
for each row execute function public.set_updated_at();
