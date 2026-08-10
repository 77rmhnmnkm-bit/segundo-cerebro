-- #24 Rastreador de hábitos (baseado em ciência) e #26 PKM (notas ligadas).

create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rationale text,                 -- por que importa (baseado em evidência)
  source text,                    -- fonte da recomendação (ex.: OMS, AASM)
  cadence text not null default 'daily' check (cadence in ('daily', 'weekly')),
  target_per_week int,            -- meta de dias/semana (nullable = todos os dias)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  log_date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);
create index if not exists habit_logs_habit_idx on habit_logs (habit_id, log_date);

-- Hábitos iniciais com recomendação de fonte reconhecida (só se vazio).
insert into habits (name, rationale, source, cadence, target_per_week)
select * from (values
  ('Dormir 7–9 horas', 'Adultos com sono regular de 7h+ têm melhor memória, humor e imunidade.', 'American Academy of Sleep Medicine', 'daily', 7),
  ('30 min de atividade física', 'A meta de 150 min/semana de atividade moderada reduz risco cardiovascular e estresse.', 'OMS — Diretrizes de Atividade Física', 'weekly', 5),
  ('Beber água ao longo do dia', 'Hidratação adequada sustenta concentração e desempenho clínico.', 'EFSA', 'daily', 7),
  ('Blocos de estudo focado (Pomodoro)', 'Sessões focadas com pausas melhoram retenção e reduzem fadiga.', 'Prática de aprendizagem espaçada', 'daily', 6),
  ('Pausa visual 20-20-20', 'A cada 20 min, olhar 20s para 6 m de distância reduz fadiga ocular com telas/lupa.', 'American Optometric Association', 'daily', 7)
) as seed(name, rationale, source, cadence, target_per_week)
where not exists (select 1 from habits);

create table if not exists knowledge_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_notes_title_idx on knowledge_notes (lower(title));
