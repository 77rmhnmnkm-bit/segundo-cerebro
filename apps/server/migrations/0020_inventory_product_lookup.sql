alter table inventory_items
  add column if not exists photo_url text,
  add column if not exists source_link text;

alter table wishlist_items
  add column if not exists photo_url text,
  add column if not exists price numeric;
