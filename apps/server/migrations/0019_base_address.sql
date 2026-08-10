insert into app_settings (key, value) values
  ('base_address', '""'),
  ('base_address_coords', 'null')
on conflict (key) do nothing;
