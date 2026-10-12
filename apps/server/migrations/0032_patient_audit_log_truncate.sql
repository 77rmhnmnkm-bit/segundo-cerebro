-- O trigger da 0018 é "for each row", e TRUNCATE não dispara trigger de linha:
-- um "truncate patient_audit_log" apagava todo o rastro de exclusões e
-- impressões de dado de paciente sem erro nenhum. É o mesmo buraco que a 0031
-- fechou no est_audit_log; aqui ele continuava aberto. A função já levanta
-- exceção incondicionalmente, então serve para os dois casos.
drop trigger if exists patient_audit_log_no_truncate on patient_audit_log;
create trigger patient_audit_log_no_truncate
  before truncate on patient_audit_log
  for each statement execute function patient_audit_log_block_mutation();

-- Sem "revoke truncate": o papel da aplicação é superuser e dono da tabela,
-- então ignora GRANT/REVOKE. O revoke daria falsa sensação de defesa em
-- profundidade sem bloquear nada. Se um dia a aplicação passar a rodar com um
-- papel comum, aí sim vale revogar TRUNCATE dele.
