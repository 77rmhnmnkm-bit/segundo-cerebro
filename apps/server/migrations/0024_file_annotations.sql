-- Marcações desenhadas sobre uma radiografia/foto para comunicação com o
-- paciente (estilo DIO). Guardamos como JSON: lista de formas com tipo,
-- coordenadas relativas (0-1, para escalar com o zoom), cor e rótulo.
alter table patient_files
  add column if not exists annotations jsonb not null default '[]'::jsonb;

-- Descrição experimental gerada por IA de visão (não-diagnóstica). Fica
-- separada das marcações manuais; é apoio, nunca laudo.
alter table patient_files
  add column if not exists ai_description text;
