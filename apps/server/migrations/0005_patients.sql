alter table patients add column if not exists birth_date date;
alter table patients add column if not exists phone text;
alter table patients add column if not exists email text;
alter table patients add column if not exists cpf text;
alter table patients add column if not exists address text;
alter table patients add column if not exists notes text;
alter table patients add column if not exists updated_at timestamptz not null default now();

create table if not exists patient_files (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  file_path text not null,
  format text not null check (format in ('image', 'dicom', 'pdf')),
  label text,
  created_at timestamptz not null default now()
);

create table if not exists medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  content text not null,
  audio_path text,
  created_at timestamptz not null default now()
);

create table if not exists odontogram_entries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  tooth_number integer not null,
  face text,
  procedure_name text not null,
  material text,
  recorded_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists patient_files_patient_idx on patient_files (patient_id);
create index if not exists medical_records_patient_idx on medical_records (patient_id);
create index if not exists odontogram_entries_patient_idx on odontogram_entries (patient_id);
