create table if not exists assistant_memory (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists assistant_memory_created_idx on assistant_memory (created_at);

insert into app_settings (key, value)
  values ('assistant_personality', '"Direto, caloroso e organizado. Fala como um colega de confiança, sem formalidade excessiva, e sempre confirma antes de agir."')
  on conflict (key) do nothing;
