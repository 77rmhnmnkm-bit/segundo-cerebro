create table if not exists patient_audit_log (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  action text not null,
  entity_type text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists patient_audit_log_patient_idx on patient_audit_log (patient_id, created_at desc);

-- Append-only: this log must never be edited or erased once written, even by us.
create or replace function patient_audit_log_block_mutation()
returns trigger as $$
begin
  raise exception 'patient_audit_log é append-only: UPDATE/DELETE não são permitidos.';
end;
$$ language plpgsql;

drop trigger if exists patient_audit_log_no_update on patient_audit_log;
create trigger patient_audit_log_no_update
  before update or delete on patient_audit_log
  for each row execute function patient_audit_log_block_mutation();
