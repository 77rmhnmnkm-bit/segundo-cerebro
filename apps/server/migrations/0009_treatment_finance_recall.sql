create table if not exists treatment_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  title text not null,
  status text not null default 'ativo' check (status in ('ativo', 'concluido', 'cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists treatment_plan_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references treatment_plans(id) on delete cascade,
  description text not null,
  procedure_name text,
  value numeric,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'concluido')),
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references treatment_plans(id) on delete cascade,
  step_id uuid references treatment_plan_steps(id) on delete set null,
  amount numeric not null,
  paid_at date not null default current_date,
  method text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists recall_schedules (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  recall_type text not null,
  due_date date not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table events add column if not exists confirmation_status text default null
  check (confirmation_status in ('pendente', 'confirmado', 'falta'));

create index if not exists treatment_plans_patient_idx on treatment_plans (patient_id);
create index if not exists treatment_plan_steps_plan_idx on treatment_plan_steps (plan_id);
create index if not exists payments_plan_idx on payments (plan_id);
create index if not exists recall_schedules_patient_idx on recall_schedules (patient_id);
create index if not exists recall_schedules_due_idx on recall_schedules (due_date) where completed = false;
