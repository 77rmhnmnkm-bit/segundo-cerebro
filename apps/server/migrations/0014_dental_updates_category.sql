alter table dental_updates
  add column if not exists category text not null default 'institucional';

create index if not exists dental_updates_category_idx on dental_updates (category);
