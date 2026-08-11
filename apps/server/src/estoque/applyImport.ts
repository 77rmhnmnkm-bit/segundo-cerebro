import { pool } from "../db/pool.js";
import type { PlanoImportacao, ResumoImportacao } from "./importPlan.js";

// Roda dentro de uma transação: importar metade da planilha é pior que não
// importar nada. É idempotente por (nome_norm, marca_norm) nos produtos, mas
// NÃO nos lotes — rodar duas vezes duplica lotes. Limpe antes de reimportar.
export async function applyImport(plano: PlanoImportacao, usuario: string): Promise<ResumoImportacao> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const idLocal = new Map<string, string>();
    for (const nome of plano.locais) {
      const r = await client.query<{ id: string }>(
        "insert into est_locais (nome, nivel) values ($1, 'sala') returning id",
        [nome],
      );
      idLocal.set(nome, r.rows[0].id);
    }

    const idProduto = new Map<string, string>();
    for (const p of plano.produtos) {
      const r = await client.query<{ id: string }>(
        `insert into est_produtos (nome, marca, especialidade, nome_norm, marca_norm)
         values ($1, $2, $3, $4, $5)
         on conflict (nome_norm, marca_norm) do update set nome = est_produtos.nome
         returning id`,
        [p.nome, p.marca || null, p.especialidade, p.nomeNorm, p.marcaNorm],
      );
      idProduto.set(`${p.nomeNorm}|${p.marcaNorm}`, r.rows[0].id);
    }

    for (const l of plano.lotes) {
      await client.query(
        `insert into est_lotes
           (produto_id, lote, validade, usar_ate, usar_ate_motivo, local_id, quantidade,
            unidade, situacao, precisa_conferencia, conferencia_motivo, origem, eliminado_na_origem)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          idProduto.get(l.chaveProduto),
          l.lote || null,
          l.validade,
          l.usarAte,
          l.usarAteMotivo,
          l.local ? idLocal.get(l.local) : null,
          l.quantidade,
          l.unidade,
          l.situacao,
          l.precisaConferencia,
          l.conferenciaMotivo,
          l.origem,
          l.eliminado,
        ],
      );
    }

    for (const f of plano.resumo.fusoes) {
      await client.query(
        `insert into est_audit_log (entidade, acao, descricao, usuario)
         values ('produto', 'fusao', $1, $2)`,
        [`Grafias unificadas: ${f.de.join(" + ")} → ${f.para}`, usuario],
      );
    }

    await client.query(
      `insert into est_audit_log (entidade, acao, descricao, usuario)
       values ('importacao', 'importar', $1, $2)`,
      [
        `Importadas ${plano.resumo.linhas} linhas: ${plano.resumo.produtos} produtos, ` +
          `${plano.resumo.ativos} lotes ativos, ${plano.resumo.inativos} inativos, ` +
          `${plano.resumo.conferencia} a conferir.`,
        usuario,
      ],
    );

    await client.query("commit");
    return plano.resumo;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
