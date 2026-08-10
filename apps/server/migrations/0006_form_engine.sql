create table if not exists form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  version integer not null default 1,
  source text not null default 'manual' check (source in ('manual', 'pdf')),
  created_at timestamptz not null default now()
);

create table if not exists form_template_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references form_templates(id) on delete cascade,
  section text,
  label text not null,
  field_type text not null check (field_type in ('text', 'textarea', 'select', 'checkbox_group', 'date', 'number', 'table')),
  options jsonb,
  order_index integer not null default 0
);

create table if not exists form_responses (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  template_id uuid not null references form_templates(id),
  template_version integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists form_response_values (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references form_responses(id) on delete cascade,
  field_id uuid not null references form_template_fields(id),
  value jsonb
);

create index if not exists form_template_fields_template_idx on form_template_fields (template_id);
create index if not exists form_responses_patient_idx on form_responses (patient_id);
create index if not exists form_response_values_response_idx on form_response_values (response_id);

-- Seed: real forms transcribed from the UniDBSCO clinic prontuário (structure
-- only — no patient data). New versions get a new form_templates row instead
-- of mutating these in place, so responses stay pinned to the version they
-- were filled under.

do $$
declare
  tpl_id uuid;
begin

-- 1) Exame Extra/Intrabucal
insert into form_templates (name, type, source) values ('Exame Extra/Intrabucal', 'exame_extra_intrabucal', 'pdf')
  returning id into tpl_id;
insert into form_template_fields (template_id, section, label, field_type, options, order_index) values
  (tpl_id, 'Exame Físico Extra/Intra Bucal', 'Face', 'select', '["Simétrica","Assimétrica"]', 1),
  (tpl_id, 'Exame Físico Extra/Intra Bucal', 'Lábios', 'select', '["Normal","Outros"]', 2),
  (tpl_id, 'Exame Físico Extra/Intra Bucal', 'Articulação (ATM)', 'select', '["Normal","Outros"]', 3),
  (tpl_id, 'Exame Físico Extra/Intra Bucal', 'Mucosa Jugal', 'select', '["Normal","Outros"]', 4),
  (tpl_id, 'Exame Físico Extra/Intra Bucal', 'Assoalho Bucal', 'select', '["Normal","Outros"]', 5),
  (tpl_id, 'Exame Físico Extra/Intra Bucal', 'Língua', 'select', '["Normal","Outros"]', 6),
  (tpl_id, 'Exame Físico Extra/Intra Bucal', 'Palato', 'select', '["Normal","Outros"]', 7),
  (tpl_id, 'Exame Físico Extra/Intra Bucal', 'Observações', 'textarea', null, 8);

-- 2) Defeitos de Esmalte e Anomalias
insert into form_templates (name, type, source) values ('Defeitos de Esmalte e Anomalias', 'esmalte_anomalias', 'pdf')
  returning id into tpl_id;
insert into form_template_fields (template_id, section, label, field_type, options, order_index) values
  (tpl_id, null, 'Defeito de Desenvolvimento de Esmalte', 'textarea', null, 1),
  (tpl_id, null, 'Anomalias Dentárias', 'textarea', null, 2),
  (tpl_id, null, 'Outras Observações', 'textarea', null, 3);

-- 3) Avaliação Endodôntica (multi-seção)
insert into form_templates (name, type, source) values ('Avaliação Endodôntica', 'avaliacao_endodontica', 'pdf')
  returning id into tpl_id;
insert into form_template_fields (template_id, section, label, field_type, options, order_index) values
  (tpl_id, 'Sintomas', 'Dente(s)', 'text', null, 1),
  (tpl_id, 'Sintomas', 'Dor', 'select', '["Ausente","Provocada","Espontânea"]', 2),
  (tpl_id, 'Sintomas', 'Analgésico', 'select', '["Cessa com analgésico","Não cessa com analgésico"]', 3),
  (tpl_id, 'Sintomas', 'Localização da dor', 'select', '["Localizada","Difusa"]', 4),
  (tpl_id, 'Testes', 'Teste de sensibilidade', 'select', '["Positivo","Negativo","Positivo +"]', 5),
  (tpl_id, 'Testes', 'Percussão horizontal', 'select', '["Positivo","Negativo"]', 6),
  (tpl_id, 'Testes', 'Percussão vertical', 'select', '["Positivo","Negativo"]', 7),
  (tpl_id, 'Testes', 'Presença de fístula', 'select', '["Sim","Não"]', 8),
  (tpl_id, 'Testes', 'Localização da fístula', 'text', null, 9),
  (tpl_id, 'Testes', 'Teste de palpação', 'select', '["Positivo","Negativo"]', 10),
  (tpl_id, 'Radiografia Inicial', 'Achados radiográficos', 'checkbox_group', '["Rarefação óssea periapical","Espessamento do ligamento periodontal"]', 11),
  (tpl_id, 'Diagnóstico', 'Diagnóstico', 'textarea', null, 12),
  (tpl_id, 'Odontometria', 'Comprimentos por canal (canal: aparente / real / trabalho / referência)', 'table', '{"columns":["Canal","Comprimento aparente (CAD)","Comprimento real (CRD)","Comprimento de trabalho (CT)","Bordo de referência"]}', 13),
  (tpl_id, 'Preparo Químico-Mecânico', 'Técnica utilizada', 'select', '["Manual","Mecanizada"]', 14),
  (tpl_id, 'Preparo Químico-Mecânico', 'Solução irrigante', 'text', null, 15),
  (tpl_id, 'Preparo Químico-Mecânico', 'Diâmetros por canal (canal: anatômico / cirúrgico)', 'table', '{"columns":["Canal","Diâmetro anatômico (DA)","Diâmetro cirúrgico (DC)"]}', 16),
  (tpl_id, 'Medicação e Obturação', 'Medicação intracanal', 'text', null, 17),
  (tpl_id, 'Medicação e Obturação', 'Obturação', 'text', null, 18),
  (tpl_id, 'Medicação e Obturação', 'Técnica utilizada', 'text', null, 19),
  (tpl_id, 'Medicação e Obturação', 'Cimento', 'text', null, 20),
  (tpl_id, 'Medicação e Obturação', 'Cone principal (calibre)', 'text', null, 21),
  (tpl_id, 'Medicação e Obturação', 'Selamento final (material)', 'text', null, 22),
  (tpl_id, 'Medicação e Obturação', 'Observações', 'textarea', null, 23);

end $$;
