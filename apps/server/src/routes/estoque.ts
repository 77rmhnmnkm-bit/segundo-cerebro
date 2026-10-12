import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";
import { usarAte } from "../estoque/recesso.js";

const MOTIVOS_DESCARTE = ["vencido", "danificado", "contaminado", "perdido", "devolvido"] as const;
type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number];

// Usuário/dispositivo fixos por ora: sistema de um usuário só (§7.1 da spec),
// gravados mesmo assim para o histórico não ficar órfão se isso mudar.
const USUARIO = "Ricardo";
const DISPOSITIVO = "mac";

// `ativo` é coluna gerada no banco (quantidade > 0 and not eliminado_na_origem).
// Refazer essa conta à mão numa query já produziu 220 lotes onde são 215 —
// nunca escreva "quantidade > 0" aqui.
export function montarFiltroVisao(visao: string): string {
  if (visao === "validade") {
    // "usar_ate < l.validade" sozinho também pega lote já vencido (usar_ate
    // quase sempre <= validade), inflando a contagem de 54 para 60 na base
    // real. A armadilha é especificamente o lote que AINDA não venceu pelo
    // prazo real mas pareceria ok pela data impressa — por isso o piso
    // "usar_ate >= current_date". current_date é seguro aqui: a conexão do
    // banco usa timezone America/Sao_Paulo (verificado via `show timezone`),
    // então não sofre o mesmo rolamento de dia que toISOString() teria em JS.
    return "l.ativo and l.usar_ate is not null and l.usar_ate >= current_date and l.usar_ate < l.validade";
  }
  return "l.ativo";
}

// Ordena pelo prazo REAL, não pela validade impressa: é a razão de o módulo existir.
export function ordemDaVisao(visao: string): string {
  if (visao === "validade") return "order by l.usar_ate asc nulls last, l.quantidade desc";
  return "order by l.usar_ate asc nulls last, p.nome asc";
}

const SELECT_LOTE = `
  select l.id, l.produto_id, p.nome, p.marca, p.especialidade,
         l.lote, l.validade, l.usar_ate, l.usar_ate_motivo,
         loc.nome as local, l.local_id, l.quantidade, l.unidade, l.situacao, l.ativo,
         l.precisa_conferencia, l.conferencia_motivo, l.observacoes,
         coalesce(l.validade - l.usar_ate, 0) as dias_perdidos
  from est_lotes l
  join est_produtos p on p.id = l.produto_id
  left join est_locais loc on loc.id = l.local_id`;

// pg devolve colunas `date` como objetos Date (não string). Comparar Date
// diretamente com a string de hojeLocal() nunca dá true (JS converte a
// string para NaN e a comparação falha em silêncio) — "vencido" e
// "prazo_passou" nunca disparavam, todo lote vencido caía em "no_prazo".
// Normaliza para "YYYY-MM-DD" pelos componentes locais (nunca toISOString,
// mesmo motivo do hojeLocal) antes de comparar ou devolver ao cliente.
export function dataLocal(d: unknown): string | null {
  if (d == null) return null;
  if (typeof d === "string") return d;
  const dt = d as Date;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function status(row: { validade: Date | string | null; usar_ate: Date | string | null }, hoje: string): string {
  const validadeNorm = dataLocal(row.validade);
  const usarAteNorm = dataLocal(row.usar_ate);
  if (!validadeNorm) return "sem_validade";
  if (validadeNorm < hoje) return "vencido";
  if (usarAteNorm && usarAteNorm < hoje) return "prazo_passou";
  if (usarAteNorm && usarAteNorm < validadeNorm) return "armadilha";
  return "no_prazo";
}

// Data local, nunca toISOString: em UTC-3 ele rola para o dia anterior à noite.
function hojeLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function estoqueRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/estoque/contagens", async () => {
    // Reaproveita montarFiltroVisao para não deixar a definição de "validade"
    // divergir entre esta contagem e o filtro usado em /estoque/lotes.
    // vencidos_com_estoque usa o mesmo primeiro critério de status() (validade
    // < hoje) — não duplica a comparação usar_ate/armadilha, que é mais frágil
    // e já tem cobertura de teste só em status(). Alimenta o painel do
    // revisor: nunca um número inventado, sempre contado de novo aqui.
    const r = await pool.query(`
      select
        count(*) filter (where ${montarFiltroVisao("estoque")}) as estoque,
        count(*) filter (where ${montarFiltroVisao("validade")}) as validade,
        count(*) filter (where l.precisa_conferencia) as conferencia,
        count(*) filter (where l.ativo and l.validade is not null and l.validade < current_date) as vencidos_com_estoque
      from est_lotes l`);
    const c = await pool.query(`
      select count(*) as comprar from (
        select p.id from est_produtos p
        left join est_lotes l on l.produto_id = p.id and l.ativo
        group by p.id having count(l.id) = 0) x`);
    return {
      estoque: Number(r.rows[0].estoque),
      validade: Number(r.rows[0].validade),
      comprar: Number(c.rows[0].comprar),
      conferencia: Number(r.rows[0].conferencia),
      vencidosComEstoque: Number(r.rows[0].vencidos_com_estoque),
    };
  });

  app.get("/estoque/lotes", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const cond: string[] = [];
    const args: unknown[] = [];

    // Filas dedicadas de triagem (modo swipe): trocam o filtro de visão
    // inteiro, mesmo padrão de `conferencia` — nunca somam com ele.
    if (q.conferencia === "1") cond.push("l.precisa_conferencia");
    else if (q.vencidos === "1") {
      // Mesma condição de vencidosComEstoque em /estoque/contagens: nunca
      // deixar essas duas contagens divergirem.
      cond.push("l.ativo and l.validade is not null and l.validade < current_date");
    } else cond.push(montarFiltroVisao(q.visao ?? "estoque"));

    if (q.especialidade) { args.push(q.especialidade); cond.push(`p.especialidade = $${args.length}`); }
    if (q.local) { args.push(q.local); cond.push(`loc.id = $${args.length}`); }
    if (q.busca) {
      args.push(`%${q.busca}%`);
      cond.push(`(p.nome ilike $${args.length} or p.marca ilike $${args.length} or l.lote ilike $${args.length})`);
    }
    // "Só mostrar" do painel de filtros — soma-se (AND) ao filtro de visão em
    // vez de substituí-lo, ao contrário de `conferencia` acima (que é a rota
    // dedicada da fila de conferência, e por isso troca o filtro inteiro).
    if (q.flag === "1") cond.push("l.precisa_conferencia");
    if (q.aberto === "1") cond.push("l.situacao = 'aberto'");

    const limite = Math.min(Number(q.limite) || 60, 200);
    const desde = Math.max(Number(q.desde) || 0, 0);
    const where = cond.join(" and ");

    const total = await pool.query(
      `select count(*) as n from est_lotes l
       join est_produtos p on p.id = l.produto_id
       left join est_locais loc on loc.id = l.local_id
       where ${where}`, args);

    args.push(limite, desde);
    const rows = await pool.query(
      `${SELECT_LOTE} where ${where} ${ordemDaVisao(q.visao ?? "estoque")}
       limit $${args.length - 1} offset $${args.length}`, args);

    const hoje = hojeLocal();
    return {
      total: Number(total.rows[0].n),
      lotes: rows.rows.map((r) => {
        const validade = dataLocal(r.validade);
        const usarAte = dataLocal(r.usar_ate);
        return {
          id: r.id, produtoId: r.produto_id, nome: r.nome, marca: r.marca,
          especialidade: r.especialidade, lote: r.lote,
          validade, usarAte, usarAteMotivo: r.usar_ate_motivo,
          local: r.local, localId: r.local_id, quantidade: Number(r.quantidade), unidade: r.unidade,
          situacao: r.situacao, ativo: r.ativo,
          precisaConferencia: r.precisa_conferencia,
          conferenciaMotivo: r.conferencia_motivo ?? [],
          observacoes: r.observacoes,
          status: status({ validade: r.validade, usar_ate: r.usar_ate }, hoje),
          diasPerdidos: Number(r.dias_perdidos),
        };
      }),
    };
  });

  // Produtos sem nenhum lote ativo: já existiram, hoje não tem. É a lista de compras.
  app.get("/estoque/comprar", async () => {
    const r = await pool.query(`
      select p.id, p.nome, p.marca, p.especialidade,
             count(l.id) as lotes, coalesce(sum(l.quantidade), 0) as saldo
      from est_produtos p
      left join est_lotes l on l.produto_id = p.id
      group by p.id
      having count(l.id) filter (where l.ativo) = 0
      order by p.nome`);
    return {
      produtos: r.rows.map((x) => ({
        id: x.id, nome: x.nome, marca: x.marca, especialidade: x.especialidade,
        lotes: Number(x.lotes), saldo: Number(x.saldo),
      })),
    };
  });

  app.get("/estoque/filtros", async () => {
    const esp = await pool.query(`
      select p.especialidade as nome, count(l.id) as total
      from est_produtos p join est_lotes l on l.produto_id = p.id
      group by p.especialidade order by total desc`);
    const loc = await pool.query(`
      select loc.id, loc.nome, count(l.id) as total
      from est_locais loc join est_lotes l on l.local_id = loc.id
      group by loc.id, loc.nome order by total desc`);
    return {
      especialidades: esp.rows.map((x) => ({ nome: x.nome, total: Number(x.total) })),
      locais: loc.rows.map((x) => ({ id: x.id, nome: x.nome, total: Number(x.total) })),
    };
  });

  // Todos os locais existentes (não só os que já têm lote) — para o seletor
  // de edição, que precisa oferecer qualquer sala/móvel/caixa cadastrado.
  app.get("/estoque/locais", async () => {
    const r = await pool.query(`select id, nome, nivel, pai_id from est_locais order by nome`);
    return { locais: r.rows.map((x) => ({ id: x.id, nome: x.nome, nivel: x.nivel, paiId: x.pai_id })) };
  });

  async function buscarLotePorId(id: string) {
    const r = await pool.query(`${SELECT_LOTE} where l.id = $1`, [id]);
    if (r.rowCount === 0) return null;
    const row = r.rows[0];
    const hoje = hojeLocal();
    const validade = dataLocal(row.validade);
    const usarAteStr = dataLocal(row.usar_ate);
    return {
      id: row.id, produtoId: row.produto_id, nome: row.nome, marca: row.marca,
      especialidade: row.especialidade, lote: row.lote,
      validade, usarAte: usarAteStr, usarAteMotivo: row.usar_ate_motivo,
      local: row.local, localId: row.local_id, quantidade: Number(row.quantidade), unidade: row.unidade,
      situacao: row.situacao, ativo: row.ativo,
      precisaConferencia: row.precisa_conferencia,
      conferenciaMotivo: row.conferencia_motivo ?? [],
      observacoes: row.observacoes,
      status: status({ validade: row.validade, usar_ate: row.usar_ate }, hoje),
      diasPerdidos: Number(row.dias_perdidos),
    };
  }

  async function registrarAuditoria(
    client: import("pg").PoolClient,
    entidadeId: string,
    campo: string | null,
    antes: string | null,
    depois: string | null,
    descricao: string,
    acao = "editar",
  ) {
    await client.query(
      `insert into est_audit_log (entidade, entidade_id, acao, campo, valor_antes, valor_depois, descricao, usuario, dispositivo)
       values ('lote', $1, $2, $3, $4, $5, $6, $7, $8)`,
      [entidadeId, acao, campo, antes, depois, descricao, USUARIO, DISPOSITIVO],
    );
  }

  // Resolve a conferência com a mão do Ricardo, produto físico na mesa — nunca
  // inventa dado (§7.5). Cada campo enviado grava valor antes/depois no
  // audit log; o motivo correspondente sai de conferencia_motivo só quando o
  // campo que ele cobra é de fato preenchido.
  app.patch("/estoque/lotes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      localId?: string | null;
      validade?: string | null;
      semValidadeImpressa?: boolean;
      quantidade?: number;
      observacoes?: string | null;
      situacao?: string | null;
      resolverMotivos?: string[];
    };

    const client = await pool.connect();
    try {
      await client.query("begin");
      const atual = (await client.query("select * from est_lotes where id = $1 for update", [id])).rows[0];
      if (!atual) {
        await client.query("rollback");
        return reply.code(404).send({ error: "Lote não encontrado." });
      }

      const sets: string[] = [];
      const args: unknown[] = [];
      let motivos = new Set<string>(atual.conferencia_motivo ?? []);

      if (body.localId !== undefined) {
        const localNovo = body.localId
          ? (await client.query("select nome from est_locais where id = $1", [body.localId])).rows[0]?.nome ?? null
          : null;
        const localAntigo = atual.local_id
          ? (await client.query("select nome from est_locais where id = $1", [atual.local_id])).rows[0]?.nome ?? null
          : null;
        if (body.localId !== atual.local_id) {
          args.push(body.localId);
          sets.push(`local_id = $${args.length}`);
          await registrarAuditoria(client, id, "local", localAntigo, localNovo, `Local: ${localAntigo ?? "—"} → ${localNovo ?? "—"}`);
        }
        // Só resolve "sem local" quando um local de verdade foi escolhido —
        // o formulário sempre reenvia este campo (mesmo sem o usuário mexer
        // nele), então localId vazio aqui não pode apagar o aviso.
        if (body.localId) motivos.delete("sem local");
      }

      const validadeAtualStr = dataLocal(atual.validade);
      if (body.validade !== undefined && body.validade !== validadeAtualStr) {
        const validadeAntes = validadeAtualStr;
        args.push(body.validade);
        sets.push(`validade = $${args.length}`);
        if (body.validade) {
          const r = usarAte(new Date(`${body.validade}T12:00:00`));
          const usarAteStr = dataLocal(r.data);
          args.push(usarAteStr, r.motivo);
          sets.push(`usar_ate = $${args.length - 1}`, `usar_ate_motivo = $${args.length}`);
        }
        await registrarAuditoria(client, id, "validade", validadeAntes, body.validade, `Validade: ${validadeAntes ?? "—"} → ${body.validade ?? "—"}`);
        motivos.delete("sem validade");
        motivos.delete("validade implausível");
      } else if (body.semValidadeImpressa) {
        motivos.delete("sem validade");
        await registrarAuditoria(client, id, "validade", dataLocal(atual.validade), null, "Confirmado: produto não tem validade impressa no rótulo.");
      }

      if (body.quantidade !== undefined && Number(body.quantidade) !== Number(atual.quantidade)) {
        args.push(body.quantidade);
        sets.push(`quantidade = $${args.length}`);
        await registrarAuditoria(client, id, "quantidade", String(atual.quantidade), String(body.quantidade), `Quantidade: ${atual.quantidade} → ${body.quantidade}`);
        motivos.delete("sem quantidade");
      }

      if (body.observacoes !== undefined && body.observacoes !== atual.observacoes) {
        args.push(body.observacoes || null);
        sets.push(`observacoes = $${args.length}`);
        await registrarAuditoria(client, id, "observacoes", atual.observacoes, body.observacoes, "Observações atualizadas.");
      }

      if (body.situacao !== undefined && body.situacao !== atual.situacao) {
        args.push(body.situacao || null);
        sets.push(`situacao = $${args.length}`);
        await registrarAuditoria(client, id, "situacao", atual.situacao, body.situacao, `Situação: ${atual.situacao ?? "—"} → ${body.situacao ?? "—"}`);
      }

      // "Resolver" explícito (ex.: confirmar 2050 mesmo, ou aceitar a duplicata):
      // remove só o motivo indicado, sem mexer em nenhum campo.
      for (const m of body.resolverMotivos ?? []) motivos.delete(m);

      const motivosArr = [...motivos];
      args.push(motivosArr, motivosArr.length > 0);
      sets.push(`conferencia_motivo = $${args.length - 1}`, `precisa_conferencia = $${args.length}`);
      sets.push(`atualizado_em = now()`);

      if (sets.length > 0) {
        args.push(id);
        await client.query(`update est_lotes set ${sets.join(", ")} where id = $${args.length}`, args);
      }

      await client.query("commit");
      return { lote: await buscarLotePorId(id) };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  });

  // "Descartar tudo" (§7.2) — é o "excluir" da interface: zera o lote, exige
  // motivo, registra o movimento e o audit log. Nada é apagado de fato.
  app.post("/estoque/lotes/:id/descartar", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { motivo } = req.body as { motivo?: string };
    if (!motivo || !MOTIVOS_DESCARTE.includes(motivo as MotivoDescarte)) {
      return reply.code(400).send({ error: `motivo é obrigatório: ${MOTIVOS_DESCARTE.join(", ")}.` });
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const atual = (await client.query("select * from est_lotes where id = $1 for update", [id])).rows[0];
      if (!atual) {
        await client.query("rollback");
        return reply.code(404).send({ error: "Lote não encontrado." });
      }
      const saldoAntes = Number(atual.quantidade);
      if (saldoAntes > 0) {
        await client.query(
          `insert into est_movimentos (lote_id, tipo, quantidade, saldo_antes, saldo_depois, motivo, usuario, dispositivo, client_id)
           values ($1, 'descarte', $2, $3, 0, $4, $5, $6, $7)`,
          [id, saldoAntes, saldoAntes, motivo, USUARIO, DISPOSITIVO, randomUUID()],
        );
      }
      await client.query(
        `update est_lotes set quantidade = 0, descartado_em = now(), descarte_motivo = $1, atualizado_em = now() where id = $2`,
        [motivo, id],
      );
      await registrarAuditoria(client, id, null, String(saldoAntes), "0", `Descartado (${motivo}) — ${saldoAntes} ${atual.unidade} removidos.`, "descarte");
      await client.query("commit");
      return { lote: await buscarLotePorId(id) };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  });

  // Entrada/saída de material (§7.1): escanear → informar quantidade →
  // confirmar. Aqui sem scanner ainda — quantidade digitada.
  app.post("/estoque/lotes/:id/movimento", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { tipo, quantidade, motivo } = req.body as { tipo?: string; quantidade?: number; motivo?: string };
    if (tipo !== "entrada" && tipo !== "saida") {
      return reply.code(400).send({ error: "tipo deve ser 'entrada' ou 'saida'." });
    }
    const qtd = Number(quantidade);
    if (!(qtd > 0)) return reply.code(400).send({ error: "quantidade deve ser maior que zero." });

    const client = await pool.connect();
    try {
      await client.query("begin");
      const atual = (await client.query("select * from est_lotes where id = $1 for update", [id])).rows[0];
      if (!atual) {
        await client.query("rollback");
        return reply.code(404).send({ error: "Lote não encontrado." });
      }
      const saldoAntes = Number(atual.quantidade);
      const saldoDepois = tipo === "entrada" ? saldoAntes + qtd : saldoAntes - qtd;
      if (saldoDepois < 0) {
        await client.query("rollback");
        return reply.code(400).send({ error: `Só há ${saldoAntes} ${atual.unidade} em estoque.` });
      }
      await client.query(
        `insert into est_movimentos (lote_id, tipo, quantidade, saldo_antes, saldo_depois, motivo, usuario, dispositivo, client_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, tipo, qtd, saldoAntes, saldoDepois, motivo ?? null, USUARIO, DISPOSITIVO, randomUUID()],
      );
      await client.query(`update est_lotes set quantidade = $1, atualizado_em = now() where id = $2`, [saldoDepois, id]);
      await client.query("commit");
      return { lote: await buscarLotePorId(id) };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  });

  // Histórico do lote: movimentos + edições de cadastro, mais recente primeiro.
  app.get("/estoque/lotes/:id/historico", async (req) => {
    const { id } = req.params as { id: string };
    const mov = await pool.query(
      `select id, tipo, quantidade, saldo_antes, saldo_depois, motivo, usuario, criado_em
       from est_movimentos where lote_id = $1 order by criado_em desc`,
      [id],
    );
    const aud = await pool.query(
      `select id, acao, campo, valor_antes, valor_depois, descricao, usuario, criado_em
       from est_audit_log where entidade = 'lote' and entidade_id = $1 order by criado_em desc`,
      [id],
    );
    return {
      movimentos: mov.rows.map((r) => ({
        id: r.id, tipo: r.tipo, quantidade: Number(r.quantidade),
        saldoAntes: Number(r.saldo_antes), saldoDepois: Number(r.saldo_depois),
        motivo: r.motivo, usuario: r.usuario, criadoEm: r.criado_em,
      })),
      auditoria: aud.rows.map((r) => ({
        id: r.id, acao: r.acao, campo: r.campo, valorAntes: r.valor_antes, valorDepois: r.valor_depois,
        descricao: r.descricao, usuario: r.usuario, criadoEm: r.criado_em,
      })),
    };
  });
}
