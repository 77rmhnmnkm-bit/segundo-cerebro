create table if not exists dental_updates (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  title text not null,
  link text not null unique,
  published_at timestamptz,
  fetched_at timestamptz not null default now()
);

create index if not exists dental_updates_published_idx on dental_updates (published_at desc);
