alter table dental_updates
  add column if not exists title_original text,
  add column if not exists source_language text not null default 'pt',
  add column if not exists evidence_level text not null default 'novidade';

create index if not exists dental_updates_evidence_idx on dental_updates (evidence_level);
