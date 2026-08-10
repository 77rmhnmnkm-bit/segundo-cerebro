create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
  values ('supervisor_confirmation_enabled', 'false')
  on conflict (key) do nothing;

create table if not exists clinical_specialties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into clinical_specialties (name) values
  ('Dentística'), ('Endodontia'), ('Periodontia'), ('Cirurgia'), ('Prótese'), ('Odontopediatria'), ('Ortodontia')
on conflict (name) do nothing;

create table if not exists procedures (
  id uuid primary key default gen_random_uuid(),
  specialty_id uuid not null references clinical_specialties(id) on delete cascade,
  name text not null,
  materials text,
  technique_script text,
  created_at timestamptz not null default now()
);

create table if not exists drugs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('anestesico', 'antibiotico', 'analgesico', 'anti_inflamatorio', 'outro')),
  active_ingredient text not null,
  dose_description text not null,
  max_dose_mg_kg numeric,
  default_concentration text,
  standard_presentation text,
  source text not null,
  source_date date not null,
  created_at timestamptz not null default now()
);

-- Seed: well-established reference doses (decades-stable safety figures, not
-- fast-changing guidance), each tagged with its source — UI must always show
-- this citation and require explicit confirmation before printing/saving,
-- never presenting this as a substitute for the professional's own judgment.
insert into drugs (name, category, active_ingredient, dose_description, max_dose_mg_kg, default_concentration, standard_presentation, source, source_date) values
  ('Lidocaína 2% com epinefrina 1:100.000', 'anestesico', 'Lidocaína', 'Dose máxima 4,4 mg/kg, limite absoluto 300 mg (≈ 8,3 tubetes de 1,8 ml em adulto saudável)', 4.4, '2%', 'Tubete 1,8 ml', 'Malamed, Handbook of Local Anesthesia, 7ª ed.', '2020-01-01'),
  ('Mepivacaína 3% sem vasoconstritor', 'anestesico', 'Mepivacaína', 'Dose máxima 4,4 mg/kg, limite absoluto 300 mg (≈ 5,5 tubetes de 1,8 ml em adulto saudável)', 4.4, '3%', 'Tubete 1,8 ml', 'Malamed, Handbook of Local Anesthesia, 7ª ed.', '2020-01-01'),
  ('Articaína 4% com epinefrina 1:100.000', 'anestesico', 'Articaína', 'Dose máxima 7 mg/kg, limite absoluto geralmente 500 mg em adulto saudável', 7, '4%', 'Tubete 1,8 ml', 'Malamed, Handbook of Local Anesthesia, 7ª ed.', '2020-01-01'),
  ('Prilocaína 3% com felipressina', 'anestesico', 'Prilocaína', 'Dose máxima 6 mg/kg, limite absoluto 400 mg em adulto saudável', 6, '3%', 'Tubete 1,8 ml', 'Malamed, Handbook of Local Anesthesia, 7ª ed.', '2020-01-01'),
  ('Amoxicilina 500mg', 'antibiotico', 'Amoxicilina', '1 cápsula (500 mg) a cada 8h por 7 dias', null, null, 'Cápsula 500 mg', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Amoxicilina + Clavulanato 500/125mg', 'antibiotico', 'Amoxicilina + Clavulanato de potássio', '1 comprimido a cada 8h por 7 dias', null, null, 'Comprimido 500/125 mg', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Dipirona sódica 1g', 'analgesico', 'Dipirona sódica', '1 comprimido a cada 6h se dor, máximo 4x/dia', null, null, 'Comprimido 1 g', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Ibuprofeno 600mg', 'anti_inflamatorio', 'Ibuprofeno', '1 comprimido a cada 8h após as refeições por até 3 dias', null, null, 'Comprimido 600 mg', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Nimesulida 100mg', 'anti_inflamatorio', 'Nimesulida', '1 comprimido a cada 12h por até 3 dias', null, null, 'Comprimido 100 mg', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Paracetamol 750mg', 'analgesico', 'Paracetamol', '1 comprimido a cada 6h se dor, máximo 4x/dia', null, null, 'Comprimido 750 mg', 'Bula do medicamento (ANVISA)', '2024-01-01')
on conflict (name) do nothing;

create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  drug_id uuid not null references drugs(id),
  dosage_text text not null,
  quantity text,
  created_at timestamptz not null default now()
);

create table if not exists instruction_templates (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('pre_operatorio', 'pos_operatorio')),
  title text not null unique,
  body text not null,
  created_at timestamptz not null default now()
);

insert into instruction_templates (type, title, body) values
  ('pos_operatorio', 'Pós-operatório de exodontia',
   E'- Mantenha a gaze no local por 30-40 minutos, mordendo com leve pressão.\n- Aplique compressa de gelo (20 min ligado / 20 min desligado) nas primeiras 24h.\n- Evite bochechos, sucção (canudo/cigarro) e exercícios físicos por 24h.\n- Alimentação líquida/pastosa e fria nas primeiras 24h.\n- Tome a medicação prescrita nos horários indicados.\n- Em caso de sangramento intenso, inchaço crescente após 48h ou febre, entre em contato.'),
  ('pre_operatorio', 'Pré-operatório de cirurgia oral',
   E'- Informe qualquer medicação em uso e condições de saúde antes do procedimento.\n- Alimente-se normalmente antes da consulta, salvo orientação contrária.\n- Venha acompanhado(a) se for realizada sedação.\n- Use roupas confortáveis e evite maquiagem na região a ser tratada.\n- Tire dúvidas sobre o procedimento antes do início.')
on conflict (title) do nothing;

create table if not exists clinical_cases (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  procedure_id uuid references procedures(id),
  title text not null,
  description text,
  hours numeric,
  supervisor_name text,
  created_at timestamptz not null default now()
);

create index if not exists procedures_specialty_idx on procedures (specialty_id);
create index if not exists prescriptions_patient_idx on prescriptions (patient_id);
create index if not exists clinical_cases_patient_idx on clinical_cases (patient_id);
