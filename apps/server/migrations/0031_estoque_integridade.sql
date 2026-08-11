-- O trigger da 0030 é "for each row", e TRUNCATE não dispara trigger de linha:
-- um "truncate est_audit_log" zerava todo o rastro sanitário sem erro nenhum.
-- Este trigger de statement fecha o buraco. A função já levanta exceção
-- incondicionalmente, então serve para os dois casos.
drop trigger if exists est_audit_log_no_truncate on est_audit_log;
create trigger est_audit_log_no_truncate
  before truncate on est_audit_log
  for each statement execute function est_audit_log_block_mutation();

-- Contagem negativa de material é estado impossível. Sem isto, um erro de
-- sincronia levaria um lote a saldo negativo e o banco aceitaria calado.
alter table est_lotes drop constraint if exists est_lotes_quantidade_nao_negativa;
alter table est_lotes add constraint est_lotes_quantidade_nao_negativa
  check (quantidade >= 0);

alter table est_movimentos drop constraint if exists est_movimentos_quantidade_positiva;
alter table est_movimentos add constraint est_movimentos_quantidade_positiva
  check (quantidade > 0);

alter table est_movimentos drop constraint if exists est_movimentos_saldos_nao_negativos;
alter table est_movimentos add constraint est_movimentos_saldos_nao_negativos
  check (saldo_antes >= 0 and saldo_depois >= 0);

-- Descarte é atômico: ou tem data E motivo, ou não aconteceu. "Meio descartado"
-- não é estado que o rastro sanitário possa representar.
alter table est_lotes drop constraint if exists est_lotes_descarte_completo;
alter table est_lotes add constraint est_lotes_descarte_completo
  check ((descartado_em is null) = (descarte_motivo is null));

-- Marcar "precisa conferência" sem dizer por quê não ajuda ninguém.
alter table est_lotes drop constraint if exists est_lotes_conferencia_tem_motivo;
alter table est_lotes add constraint est_lotes_conferencia_tem_motivo
  check (not precisa_conferencia or coalesce(array_length(conferencia_motivo, 1), 0) >= 1);
