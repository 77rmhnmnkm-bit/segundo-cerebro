-- Perfil de saúde do paciente (segurança): alergias, medicamentos em uso e
-- condições de risco — base para o banner de alerta médico e a checagem de
-- contraindicação no receituário.
create table if not exists patient_health (
  patient_id uuid primary key references patients(id) on delete cascade,
  allergies text[] not null default '{}',
  medications text[] not null default '{}',
  conditions text[] not null default '{}',
  notes text,
  updated_at timestamptz not null default now()
);
