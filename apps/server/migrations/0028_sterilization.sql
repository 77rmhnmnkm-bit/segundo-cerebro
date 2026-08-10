-- Rastreabilidade de esterilização — exigência legal RDC nº 1.002/2025 (ANVISA).
-- Cada ciclo/carga registra os dados obrigatórios da etiqueta + monitoramento
-- químico/biológico. O indicador biológico é obrigatório no mínimo semanal e
-- em toda carga com implante.

create table if not exists sterilization_cycles (
  id uuid primary key default gen_random_uuid(),
  autoclave text not null,                 -- identificação do equipamento
  cycle_number text,                       -- nº do ciclo
  lot_number text not null,                -- lote (âncora de rastreabilidade)
  material_type text,                      -- tipo/descrição do conteúdo
  operator text not null,                  -- quem processou/validou
  sterilized_at timestamptz not null default now(),
  chemical_indicator text not null default 'ok' check (chemical_indicator in ('ok', 'fail', 'na')),
  biological_indicator text not null default 'na' check (biological_indicator in ('na', 'pending', 'pass', 'fail')),
  has_implant boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists sterilization_cycles_date_idx on sterilization_cycles (sterilized_at desc);

create table if not exists sterilization_bi_tests (
  id uuid primary key default gen_random_uuid(),
  autoclave text not null,
  tested_at date not null default current_date,
  lot_number text,
  result text not null default 'pending' check (result in ('pending', 'pass', 'fail')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists sterilization_bi_date_idx on sterilization_bi_tests (tested_at desc);
