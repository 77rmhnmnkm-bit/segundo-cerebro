-- Lote ativo tem definição única no banco, não recalculada em cada consulta:
-- esquecer o "not eliminado_na_origem" já fez o sistema afirmar que existiam
-- 220 lotes vivos quando são 215.
alter table est_lotes
  add column if not exists ativo boolean
  generated always as (quantidade > 0 and not eliminado_na_origem) stored;

create index if not exists est_lotes_ativo_idx on est_lotes (ativo);

-- Coluna 15 ("Observações sanitárias") da planilha: 68 das 388 linhas trazem
-- informação insubstituível (fabricação, validade estimada, cor, item sem
-- lote individual) que não existe em nenhuma outra coluna.
alter table est_lotes add column if not exists observacoes text;

-- O insert de locais em applyImport.ts roda a cada importação; sem índice
-- único, reimportar sobre uma tabela não vazia duplicaria toda sala/móvel.
create unique index if not exists est_locais_nome_idx on est_locais (nome);
