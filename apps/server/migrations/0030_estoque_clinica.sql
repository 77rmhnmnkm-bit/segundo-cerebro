-- Estoque da Clínica Escola. Separado de inventory_items (estoque pessoal do
-- Ricardo), que continua intacto: este é dado institucional, com rastro
-- sanitário e calendário letivo próprios.

create table if not exists est_locais (
  id uuid primary key default gen_random_uuid(),
  pai_id uuid references est_locais(id) on delete cascade,
  nome text not null,
  nivel text not null check (nivel in ('sala', 'movel', 'caixa')),
  criado_em timestamptz not null default now()
);

create table if not exists est_produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  marca text,
  especialidade text not null,
  nome_norm text not null,
  marca_norm text not null default '',
  criado_em timestamptz not null default now()
);

create unique index if not exists est_produtos_norm_idx
  on est_produtos (nome_norm, marca_norm);

create table if not exists est_lotes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references est_produtos(id) on delete restrict,
  lote text,
  validade date,
  usar_ate date,
  usar_ate_motivo text check (usar_ate_motivo in ('validade', 'recesso_fim_ano', 'recesso_julho')),
  local_id uuid references est_locais(id) on delete set null,
  quantidade numeric not null default 0,
  unidade text not null default 'un.',
  situacao text check (situacao in ('aberto', 'fechado')),
  precisa_conferencia boolean not null default false,
  conferencia_motivo text[] not null default '{}',
  qr_id uuid not null default gen_random_uuid(),
  descartado_em timestamptz,
  descarte_motivo text,
  origem text not null default 'manual',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- O leitor de código resolve contra TODOS os lotes, inclusive zerados e
-- descartados: escanear a etiqueta de um pote antigo tem que achar aquele
-- lote em vez de criar um duplicado. Por isso nenhum índice aqui filtra por
-- quantidade ou por descartado_em.
create index if not exists est_lotes_produto_idx on est_lotes (produto_id);
create index if not exists est_lotes_usar_ate_idx on est_lotes (usar_ate);
create unique index if not exists est_lotes_qr_idx on est_lotes (qr_id);
create index if not exists est_lotes_lote_idx on est_lotes (lote) where lote is not null;

create table if not exists est_movimentos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references est_lotes(id) on delete restrict,
  tipo text not null check (tipo in ('entrada', 'saida', 'descarte', 'contagem', 'transferencia')),
  quantidade numeric not null,
  saldo_antes numeric not null,
  saldo_depois numeric not null,
  motivo text,
  usuario text not null,
  dispositivo text not null default 'mac',
  client_id uuid not null,
  criado_em timestamptz not null default now()
);

-- Idempotência da sincronia: o mesmo movimento reenviado pelo iPhone não pode
-- descontar duas vezes.
create unique index if not exists est_movimentos_client_idx on est_movimentos (client_id);
create index if not exists est_movimentos_lote_idx on est_movimentos (lote_id, criado_em desc);

create table if not exists est_audit_log (
  id uuid primary key default gen_random_uuid(),
  entidade text not null,
  entidade_id uuid,
  acao text not null,
  campo text,
  valor_antes text,
  valor_depois text,
  descricao text not null,
  usuario text not null,
  dispositivo text not null default 'mac',
  criado_em timestamptz not null default now()
);

create index if not exists est_audit_log_entidade_idx
  on est_audit_log (entidade, entidade_id, criado_em desc);

-- Append-only, no nível do banco: nem a aplicação nem eu podemos reescrever
-- histórico sanitário depois de gravado.
create or replace function est_audit_log_block_mutation()
returns trigger as $$
begin
  raise exception 'est_audit_log é append-only: UPDATE/DELETE não são permitidos.';
end;
$$ language plpgsql;

drop trigger if exists est_audit_log_no_update on est_audit_log;
create trigger est_audit_log_no_update
  before update or delete on est_audit_log
  for each row execute function est_audit_log_block_mutation();
