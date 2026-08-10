-- Tipo da imagem radiográfica, para fluxos diferentes (cárie em bitewing/
-- periapical exige mais sensibilidade que panorâmica; foto clínica não é RX).
-- valores: 'panoramica' | 'bitewing' | 'periapical' | 'foto' | null (indefinido)
alter table patient_files
  add column if not exists radiograph_type text;
