-- Aprendizado a partir das escolhas do profissional na detecção por IA.
-- Cada vez que ele CONFIRMA ou REJEITA um achado sugerido, gravamos aqui.
-- Não retreina a rede ao vivo (inseguro/inviável no Mac); serve para:
--   (1) calibrar, por classe, o quanto ele costuma confiar (acceptance rate)
--       -> a IA reordena e sinaliza as sugestões conforme o julgamento DELE;
--   (2) acumular um conjunto rotulado por ele para um fine-tuning periódico.
create table if not exists detection_feedback (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete set null,
  file_id uuid references patient_files(id) on delete set null,
  label text not null,
  predicted_confidence numeric,
  action text not null check (action in ('confirm', 'reject')),
  -- região do achado (0-1) para futuro fine-tuning / auditoria
  x numeric, y numeric, w numeric, h numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_detection_feedback_label on detection_feedback (label);
create index if not exists idx_detection_feedback_action on detection_feedback (action);
