create table if not exists inbox_items (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  source text not null default 'text' check (source in ('text', 'voice')),
  status text not null default 'untriaged' check (status in ('untriaged', 'triaged')),
  done boolean not null default false,
  created_at timestamptz not null default now()
);
