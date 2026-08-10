create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('trabalho', 'pessoal')),
  category text not null,
  description text,
  amount numeric not null,
  paid_at date not null default current_date,
  recurring boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists expenses_domain_idx on expenses (domain, paid_at desc);

create table if not exists savings_goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_amount numeric not null,
  current_amount numeric not null default 0,
  target_date date,
  created_at timestamptz not null default now()
);

-- Reference table, same pattern as `drugs`: only well-established, sourced
-- principles, never personalized investment advice. UI must always show the
-- citation and treat this as general education, not a recommendation tied
-- to the user's specific finances.
create table if not exists personal_finance_principles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  source text not null,
  source_date date not null,
  created_at timestamptz not null default now()
);

insert into personal_finance_principles (title, summary, source, source_date) values
  ('Fundo de emergência de 3 a 6 meses', 'Manter de 3 a 6 meses de despesas essenciais em reserva líquida antes de investir em ativos de maior risco, reduzindo a chance de endividamento em choques de renda.', 'Federal Reserve — Report on the Economic Well-Being of U.S. Households; consenso em finanças pessoais acadêmicas', '2023-01-01'),
  ('Regra 50/30/20', 'Direcionar cerca de 50% da renda para necessidades essenciais, 30% para desejos e 20% para poupança/quitação de dívidas, como heurística inicial de orçamento.', 'Elizabeth Warren e Amelia Warren Tyagi, "All Your Worth: The Ultimate Lifetime Money Plan" (Harvard Law School)', '2005-01-01'),
  ('Juros compostos e tempo de investimento', 'O retorno de aportes regulares cresce de forma não linear com o tempo — começar mais cedo tem impacto maior no patrimônio final do que aumentar o valor aportado mais tarde, mantendo a mesma taxa de retorno.', 'Princípio matemático padrão de finanças (juros compostos); amplamente documentado na literatura acadêmica de finanças pessoais', '2020-01-01'),
  ('Custos de fundos e retorno líquido no longo prazo', 'Taxas de administração mais altas reduzem sistematicamente o retorno composto ao longo de décadas — diferenças de 1-2% ao ano em taxas têm impacto significativo no patrimônio acumulado em horizontes de 20-30 anos.', 'John C. Bogle, "The Little Book of Common Sense Investing"; pesquisa de Morningstar sobre relação entre custo de fundos e retorno', '2007-01-01'),
  ('Custo do dinheiro no tempo e dívidas de juros altos', 'Quitar dívidas com juros altos (ex: cartão de crédito, cheque especial) matematicamente supera, na maioria dos casos, o retorno esperado de investimentos de baixo risco no mesmo período.', 'Princípio padrão de matemática financeira (valor do dinheiro no tempo)', '2020-01-01')
on conflict do nothing;
