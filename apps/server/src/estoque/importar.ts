import "dotenv/config";
import { pool } from "../db/pool.js";
import { lerPlanilha } from "./planilha.js";
import { planImport } from "./importPlan.js";
import { applyImport } from "./applyImport.js";

const caminho = process.argv[2];
if (!caminho) {
  console.error("Uso: pnpm --filter server importar:estoque -- <caminho do .xlsx>");
  process.exit(1);
}

const linhas = await lerPlanilha(caminho);
const plano = planImport(linhas, new Date());

const existentes = await pool.query<{ n: string }>("select count(*)::text as n from est_lotes");
if (existentes.rows[0].n !== "0") {
  console.error(
    `Já existem ${existentes.rows[0].n} lotes no banco. Reimportar duplicaria tudo.\n` +
      `Se é isso mesmo que você quer, limpe antes:\n` +
      `  psql "$DATABASE_URL" -c 'truncate est_movimentos, est_lotes, est_produtos, est_locais cascade;'`,
  );
  process.exit(1);
}

const r = await applyImport(plano, "Ricardo Augusto de Azevedo");

console.log(`
RELATÓRIO DE IMPORTAÇÃO — Estoque da Clínica Escola
${"=".repeat(52)}
Linhas lidas na planilha ......... ${r.linhas}
Produtos no catálogo ............. ${r.produtos}
Lotes gravados ................... ${r.lotes}
  ativos (com saldo) ............. ${r.ativos}
  inativos (preservados) ......... ${r.inativos}

ATENÇÃO
Vencidos ainda com saldo físico .. ${r.vencidosComSaldo}
Prazo morreu no recesso .......... ${r.prazoPassouComSaldo}
Armadilhas de recesso ............ ${r.armadilhas}
Marcados para conferência (!) .... ${r.conferencia}

Grafias unificadas ............... ${r.fusoes.length}`);

for (const f of r.fusoes) console.log(`  ${f.de.join(" + ")} → ${f.para}`);

if (r.especialidadesDivergentes.length) {
  console.log(`
Usados em mais de uma disciplina . ${r.especialidadesDivergentes.length}
O banco guarda uma especialidade por produto — a primeira vista. Estes materiais
aparecem em mais de uma, então filtrar por disciplina vai esconder alguns deles:`);
  for (const d of r.especialidadesDivergentes) {
    console.log(`  ${d.produto}: ${d.especialidades.join(" / ")}`);
  }
}

console.log(`
Nenhum lote e nenhuma validade foram alterados.
`);

await pool.end();
