import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";

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
         loc.nome as local, l.quantidade, l.unidade, l.situacao, l.ativo,
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

    if (q.conferencia === "1") cond.push("l.precisa_conferencia");
    else cond.push(montarFiltroVisao(q.visao ?? "estoque"));

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
          local: r.local, quantidade: Number(r.quantidade), unidade: r.unidade,
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
}
