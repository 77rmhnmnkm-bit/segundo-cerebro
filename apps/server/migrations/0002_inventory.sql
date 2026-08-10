create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('trabalho', 'pessoal')),
  name text not null,
  brand text,
  category text,
  batch text,
  manufactured_at date,
  expires_at date,
  location text,
  barcode text,
  photo_path text,
  quantity numeric not null default 0,
  min_quantity numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inventory_items_barcode_idx on inventory_items (barcode) where barcode is not null;

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id) on delete cascade,
  type text not null check (type in ('entrada', 'saida', 'transferencia')),
  quantity numeric not null,
  from_location text,
  to_location text,
  created_at timestamptz not null default now()
);

create table if not exists wishlist_items (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('trabalho', 'pessoal')),
  name text not null,
  description text,
  priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta')),
  purchase_link text,
  created_at timestamptz not null default now()
);

create table if not exists storage_locations (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('trabalho', 'pessoal')),
  name text not null,
  layout_image_path text,
  marker_x numeric,
  marker_y numeric,
  created_at timestamptz not null default now()
);

create table if not exists low_stock_reports (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  item_ids uuid[] not null,
  pdf_path text
);
