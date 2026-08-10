alter table medical_records add column if not exists next_steps text;

do $$
declare
  tpl_id uuid;
begin

-- Periodontograma
insert into form_templates (name, type, source) values ('Periodontograma', 'periodontograma', 'pdf')
  returning id into tpl_id;
insert into form_template_fields (template_id, section, label, field_type, options, order_index) values
  (tpl_id, null, 'Tipo de exame', 'select', '["Exame Inicial","Reavaliação"]', 1),
  (tpl_id, null, 'Medições por dente/lado', 'table',
    '{"columns":["Dente","Lado (Bucal/Lingual)","Mobilidade","Lesão de Furca","Sangramento","Retração","Placa Visível"]}', 2);

-- Plano de Tratamento (Planejamento)
insert into form_templates (name, type, source) values ('Plano de Tratamento (Planejamento)', 'plano_tratamento', 'pdf')
  returning id into tpl_id;
insert into form_template_fields (template_id, section, label, field_type, options, order_index) values
  (tpl_id, null, 'Tratamento Proposto', 'textarea', null, 1);

end $$;
