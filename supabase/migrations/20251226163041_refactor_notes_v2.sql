-- Refactor legacy public.notes (date/type/title/content with integer id)
-- into new encounter-scoped notes table with uuid id.
-- Keeps old table as public.notes_legacy.

create extension if not exists "pgcrypto";

do $$
declare
  has_notes boolean;
  has_encounter_id boolean;
  legacy_patient_id uuid;
  legacy_encounter_id uuid;
begin
  -- Does public.notes exist?
  select to_regclass('public.notes') is not null into has_notes;
  if not has_notes then
    raise notice 'public.notes does not exist; skipping notes refactor';
    return;
  end if;

  -- If notes already has encounter_id, assume it's already v2 and do nothing
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notes'
      and column_name = 'encounter_id'
  ) into has_encounter_id;

  if has_encounter_id then
    raise notice 'public.notes already looks like v2 (has encounter_id); skipping';
    return;
  end if;

  -- Rename legacy notes table
  if to_regclass('public.notes_legacy') is null then
    execute 'alter table public.notes rename to notes_legacy';
  else
    raise exception 'public.notes_legacy already exists; cannot rename public.notes safely';
  end if;

  -- Create new v2 notes table
  execute $SQL$
    create table public.notes (
      id uuid primary key default gen_random_uuid(),
      encounter_id uuid not null references public.encounters(id) on delete cascade,
      note_type text not null,
      title text,
      content text not null default '',
      occurred_at timestamptz not null default now(),
      data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  $SQL$;

  -- Ensure updated_at trigger function exists (from your earlier migration)
  -- and attach trigger to new notes table
  if to_regclass('public.set_updated_at()') is null then
    -- function might not exist in some setups; create it
    execute $SQL$
      create or replace function public.set_updated_at()
      returns trigger as $f$
      begin
        new.updated_at = now();
        return new;
      end;
      $f$ language plpgsql;
    $SQL$;
  end if;

  execute $SQL$
    drop trigger if exists trg_notes_updated_at on public.notes;
    create trigger trg_notes_updated_at
    before update on public.notes
    for each row execute function public.set_updated_at();
  $SQL$;

  execute $SQL$
    create index if not exists idx_notes_encounter_time
    on public.notes(encounter_id, occurred_at desc);
  $SQL$;

  -- Create a single "Legacy" patient + encounter if none exist, so we can attach migrated notes
  if not exists (select 1 from public.patients) then
    insert into public.patients (name, mrn, sex, meta)
    values ('Legacy Patient', 'LEGACY', null, jsonb_build_object('source','migration'))
    returning id into legacy_patient_id;
  else
    select id into legacy_patient_id from public.patients order by created_at asc limit 1;
  end if;

  if not exists (select 1 from public.encounters) then
    insert into public.encounters (patient_id, arrival_at, location, status, meta)
    values (legacy_patient_id, now(), 'LEGACY', 'active', jsonb_build_object('source','migration'))
    returning id into legacy_encounter_id;
  else
    select id into legacy_encounter_id from public.encounters order by created_at asc limit 1;
  end if;

  -- Migrate rows from legacy notes into new notes
  -- We preserve legacy columns in data jsonb for safety.
  execute $SQL$
    insert into public.notes (encounter_id, note_type, title, content, occurred_at, data, created_at, updated_at)
    select
      $1::uuid as encounter_id,
      coalesce(n."type", 'Legacy Note') as note_type,
      nullif(n.title, '') as title,
      coalesce(n.content, '') as content,
      now() as occurred_at,
      jsonb_build_object(
        'legacy', true,
        'legacy_id', n.id,
        'legacy_date', n."date",
        'legacy_type', n."type"
      ) as data,
      now() as created_at,
      now() as updated_at
    from public.notes_legacy n;
  $SQL$ using legacy_encounter_id;

  raise notice 'Notes refactor complete. Old notes kept in public.notes_legacy. New notes in public.notes.';
end $$;
