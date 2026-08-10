-- Minimal stub so events can reference a patient before the full
-- Pacientes/Prontuário module (Fase 4) extends this table.
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null check (category in ('atendimento_paciente', 'pessoal', 'academico')),
  patient_id uuid references patients(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz,
  location_text text,
  location_lat double precision,
  location_lng double precision,
  travel_minutes integer,
  prep_minutes integer not null default 90,
  notify_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'ai_text', 'ai_photo')),
  raw_input text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_start_at_idx on events (start_at);
create index if not exists events_category_idx on events (category);
