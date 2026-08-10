insert into app_settings (key, value) values
  ('teacher_mode_enabled', 'true')
on conflict (key) do nothing;

create table if not exists dose_calculations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  drug_id uuid not null references drugs(id),
  weight_kg numeric not null,
  is_pediatric boolean not null default false,
  comorbidities text,
  max_dose_mg numeric,
  max_units numeric,
  created_at timestamptz not null default now()
);

create index if not exists dose_calculations_patient_idx on dose_calculations (patient_id);
