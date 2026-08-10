alter table expenses
  add column if not exists bucket text check (bucket in ('necessidade', 'desejo', 'poupanca'));

insert into app_settings (key, value) values
  ('personal_monthly_income', '0')
on conflict (key) do nothing;
