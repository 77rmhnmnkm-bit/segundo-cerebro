-- A planilha de origem marca lotes que o técnico já retirou do estoque
-- ("Eliminados"). Sem esta coluna, um lote eliminado que ainda tinha quantidade
-- anotada entrava no banco parecendo estoque vivo — o sistema afirmaria que
-- existe material que já foi descartado. São 5 lotes nos dados reais.
alter table est_lotes
  add column if not exists eliminado_na_origem boolean not null default false;

comment on column est_lotes.eliminado_na_origem is
  'Marcado como eliminado na planilha de origem. Lote ativo = quantidade > 0 e não eliminado_na_origem.';
