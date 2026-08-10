alter table odontogram_entries add column if not exists status text not null default 'saudavel'
  check (status in ('saudavel', 'carie', 'restaurado', 'ausente', 'implante', 'endodontia'));
