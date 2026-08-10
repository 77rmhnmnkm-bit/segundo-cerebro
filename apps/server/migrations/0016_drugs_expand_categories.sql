alter table drugs drop constraint if exists drugs_category_check;
alter table drugs add constraint drugs_category_check
  check (category in ('anestesico', 'antibiotico', 'analgesico', 'anti_inflamatorio', 'ansiolitico', 'corticoide', 'outro'));

insert into app_settings (key, value) values
  ('professional_name', '"Ricardo Rech"'),
  ('professional_cro', '""')
on conflict (key) do nothing;

insert into drugs (name, category, active_ingredient, dose_description, max_dose_mg_kg, default_concentration, standard_presentation, source, source_date) values
  ('Diazepam 5mg', 'ansiolitico', 'Diazepam', '1 comprimido (5 mg) via oral, 1h antes do procedimento, dose única', null, null, 'Comprimido 5 mg', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Midazolam 15mg', 'ansiolitico', 'Midazolam', '1 comprimido (15 mg) via oral, 30-60 min antes do procedimento, dose única', null, null, 'Comprimido 15 mg', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Dexametasona 4mg', 'corticoide', 'Dexametasona', '1 comprimido (4-8 mg) via oral, dose única pré-operatória para controle de edema', null, null, 'Comprimido 4 mg', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Betametasona 0,5mg/ml', 'corticoide', 'Betametasona', 'Conforme orientação médica/odontológica para controle de edema pós-cirúrgico', null, null, 'Solução injetável/oral', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Cefalexina 500mg', 'antibiotico', 'Cefalexina', '1 cápsula (500 mg) a cada 6h por 7 dias', null, null, 'Cápsula 500 mg', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Clindamicina 300mg', 'antibiotico', 'Clindamicina', '1 cápsula (300 mg) a cada 8h por 7 dias — alternativa em alérgicos a penicilina', null, null, 'Cápsula 300 mg', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Metronidazol 400mg', 'antibiotico', 'Metronidazol', '1 comprimido (400 mg) a cada 8h por 7 dias, geralmente associado a outro antibiótico em infecções anaeróbias', null, null, 'Comprimido 400 mg', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Cetoprofeno 100mg', 'anti_inflamatorio', 'Cetoprofeno', '1 comprimido a cada 12h após refeições por até 3-5 dias', null, null, 'Comprimido 100 mg', 'Bula do medicamento (ANVISA)', '2024-01-01'),
  ('Tramadol 50mg', 'analgesico', 'Cloridrato de tramadol', '1 cápsula a cada 6-8h se dor intensa, máximo 4x/dia', null, null, 'Cápsula 50 mg', 'Bula do medicamento (ANVISA)', '2024-01-01')
on conflict (name) do nothing;
