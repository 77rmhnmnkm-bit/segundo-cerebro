# Estoque da Clínica Escola — Plano B: app usável

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar os 388 lotes que já estão no Postgres num app que o Ricardo consegue abrir e usar — ver o estoque, dar entrada e saída, descartar, e resolver os 53 lotes marcados para conferência.

**Architecture:** Rotas Fastify sobre as tabelas `est_*` que o Plano A criou, tipos compartilhados em `packages/core`, e telas React no design system Liquid Glass existente. A ordem das tarefas é deliberada: ao fim da **Task 2** o app já é utilizável para consulta, e ao fim da **Task 4** o Ricardo já resolve as pendências sozinho. Scanner, impressão e offline ficam para o Plano C.

**Tech Stack:** Fastify 5, Postgres (`pg`), React 18, React Router 6, Vite, Vitest.

## Global Constraints

- **O importador nunca corrige dado; o Ricardo corrige.** Editar validade, lote, local e quantidade **pela interface é permitido e esperado** — é para isso que o app existe. A proibição de "nunca alterar" vale para heurística automática, nunca para ação humana explícita.
- **Toda escrita grava em `est_audit_log`** com valor antes e depois. A tabela é append-only no banco (triggers bloqueiam UPDATE, DELETE e TRUNCATE).
- **Nenhum lote é apagado.** Descarte é `descartado_em` + `descarte_motivo`, sempre os dois juntos (constraint `est_lotes_descarte_completo`).
- **`ativo` é coluna gerada** (`quantidade > 0 and not eliminado_na_origem`). Nunca refaça essa conta à mão numa query — usar `where quantidade > 0` sozinho dá 220 em vez de 215.
- **A lista ordena por `usar_ate`**, nunca por `validade`.
- `est_lotes.quantidade >= 0` e `est_movimentos.quantidade > 0` são constraints do banco; a API precisa recusar antes com mensagem em português em vez de deixar estourar erro de Postgres.
- **Nunca `date.toISOString().slice(0,10)`** — UTC-3 rola para o dia errado à noite. Sempre componentes locais.
- **`position: fixed` quebra dentro de ancestral com `backdrop-filter`** (o filtro cria novo bloco contentor, e todo card de vidro tem um). Modais renderizam via `createPortal(..., document.body)`, como `GlassModal.tsx` já faz.
- Imports relativos no server terminam em `.js` (ESM). O server **não** importa valores de `@app/core` em runtime — resolve como CommonJS e derruba o processo; só `import type`. O frontend (Vite) importa valores normalmente.
- Design: `glassSurface(theme)` e tokens de `packages/ui`. Nunca parede de botões — controles agrupados, superfícies calmas.
- Mensagens de erro e de interface em português.

**Estado do banco ao começar:** 388 lotes, 288 produtos, 28 locais, 215 ativos, 5 eliminados com saldo, 53 marcados para conferência, 54 armadilhas de recesso, 9 vencidos com saldo.

**Quando o app fica usável:** Task 2 (consulta), Task 3 (operação), Task 4 (resolver pendências).

---

### Task 1: Tipos e rotas de leitura

**Files:**
- Create: `packages/core/src/estoque.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/server/src/routes/estoque.ts`
- Modify: `apps/server/src/index.ts`
- Create: `apps/server/src/routes/estoque.test.ts`

**Interfaces:**
- Consumes: tabelas `est_produtos`, `est_lotes`, `est_locais` (Plano A)
- Produces:
  - `type EstoqueVisao = "estoque" | "validade" | "comprar"`
  - `type EstoqueLote = { id: string; produtoId: string; nome: string; marca: string | null; especialidade: string; lote: string | null; validade: string | null; usarAte: string | null; usarAteMotivo: string | null; local: string | null; quantidade: number; unidade: string; situacao: string | null; ativo: boolean; precisaConferencia: boolean; conferenciaMotivo: string[]; observacoes: string | null; status: StatusLote; diasPerdidos: number }`
  - `type EstoqueProduto = { id: string; nome: string; marca: string | null; especialidade: string; lotes: number; saldo: number }`
  - `type EstoqueContagens = { estoque: number; validade: number; comprar: number; conferencia: number }`
  - `GET /estoque/lotes?visao=&especialidade=&local=&busca=&limite=&desde=` → `{ lotes, total }`
  - `GET /estoque/comprar` → `{ produtos }`
  - `GET /estoque/contagens` → `EstoqueContagens`
  - `GET /estoque/filtros` → `{ especialidades: Array<{nome,total}>, locais: Array<{id,nome,total}> }`

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/server/src/routes/estoque.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { montarFiltroVisao, ordemDaVisao } from "./estoque.js";

describe("montarFiltroVisao", () => {
  it("estoque mostra só o que existe fisicamente", () => {
    expect(montarFiltroVisao("estoque")).toBe("l.ativo");
  });

  it("validade pega vencido e armadilha, só do que tem saldo", () => {
    const f = montarFiltroVisao("validade");
    expect(f).toContain("l.ativo");
    expect(f).toContain("l.usar_ate");
  });

  it("nunca usa quantidade > 0 sozinho — ignoraria eliminado_na_origem", () => {
    for (const v of ["estoque", "validade"] as const) {
      expect(montarFiltroVisao(v)).not.toMatch(/quantidade\s*>\s*0/);
    }
  });
});

describe("ordemDaVisao", () => {
  it("ordena por usar_ate, não por validade", () => {
    expect(ordemDaVisao("validade")).toContain("usar_ate");
    expect(ordemDaVisao("validade")).not.toContain("l.validade");
  });

  it("nulos vão para o fim", () => {
    expect(ordemDaVisao("estoque")).toContain("nulls last");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test estoque`
Expected: FAIL — `Cannot find module './estoque.js'`

- [ ] **Step 3: Escrever os tipos compartilhados**

Create `packages/core/src/estoque.ts`:

```ts
export type StatusLote = "vencido" | "prazo_passou" | "armadilha" | "no_prazo" | "sem_validade";

export type EstoqueVisao = "estoque" | "validade" | "comprar";

export type EstoqueLote = {
  id: string;
  produtoId: string;
  nome: string;
  marca: string | null;
  especialidade: string;
  lote: string | null;
  validade: string | null;
  usarAte: string | null;
  usarAteMotivo: string | null;
  local: string | null;
  quantidade: number;
  unidade: string;
  situacao: string | null;
  ativo: boolean;
  precisaConferencia: boolean;
  conferenciaMotivo: string[];
  observacoes: string | null;
  status: StatusLote;
  diasPerdidos: number;
};

export type EstoqueProduto = {
  id: string;
  nome: string;
  marca: string | null;
  especialidade: string;
  lotes: number;
  saldo: number;
};

export type EstoqueContagens = {
  estoque: number;
  validade: number;
  comprar: number;
  conferencia: number;
};
```

- [ ] **Step 4: Exportar de core**

Modify `packages/core/src/index.ts`, adicionando ao final:

```ts
export * from "./estoque.js";
```

- [ ] **Step 5: Escrever as rotas**

Create `apps/server/src/routes/estoque.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";

// `ativo` é coluna gerada no banco (quantidade > 0 and not eliminado_na_origem).
// Refazer essa conta à mão numa query já produziu 220 lotes onde são 215 —
// nunca escreva "quantidade > 0" aqui.
export function montarFiltroVisao(visao: string): string {
  if (visao === "validade") {
    return "l.ativo and l.usar_ate is not null and l.usar_ate < l.validade";
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

function status(row: { validade: string | null; usar_ate: string | null }, hoje: string): string {
  if (!row.validade) return "sem_validade";
  if (row.validade < hoje) return "vencido";
  if (row.usar_ate && row.usar_ate < hoje) return "prazo_passou";
  if (row.usar_ate && row.usar_ate < row.validade) return "armadilha";
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
    const r = await pool.query(`
      select
        count(*) filter (where l.ativo) as estoque,
        count(*) filter (where l.ativo and l.usar_ate is not null and l.usar_ate < l.validade) as validade,
        count(*) filter (where l.precisa_conferencia) as conferencia
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
      lotes: rows.rows.map((r) => ({
        id: r.id, produtoId: r.produto_id, nome: r.nome, marca: r.marca,
        especialidade: r.especialidade, lote: r.lote,
        validade: r.validade, usarAte: r.usar_ate, usarAteMotivo: r.usar_ate_motivo,
        local: r.local, quantidade: Number(r.quantidade), unidade: r.unidade,
        situacao: r.situacao, ativo: r.ativo,
        precisaConferencia: r.precisa_conferencia,
        conferenciaMotivo: r.conferencia_motivo ?? [],
        observacoes: r.observacoes,
        status: status(r, hoje), diasPerdidos: Number(r.dias_perdidos),
      })),
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
```

- [ ] **Step 6: Registrar as rotas**

Modify `apps/server/src/index.ts`: acrescente o import junto aos outros (após a linha de `sterilizationRoutes`):

```ts
import { estoqueRoutes } from "./routes/estoque.js";
```

e o registro junto aos outros `await app.register(...)`:

```ts
await app.register(estoqueRoutes);
```

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `pnpm test estoque`
Expected: PASS — 5 testes

- [ ] **Step 8: Provar contra o banco real**

Suba o servidor (`pnpm dev:server`) e, com `DEV_SKIP_AUTH=true` no `apps/server/.env`, obtenha um token pelo `/auth/dev-bypass` e chame:

```bash
TOKEN=$(curl -s -X POST localhost:3333/auth/dev-bypass | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s localhost:3333/estoque/contagens -H "Authorization: Bearer $TOKEN"
```

Expected: `{"estoque":215,"validade":54,"comprar":111,"conferencia":53}`

Se `estoque` vier 220, alguma query está usando `quantidade > 0` em vez de `l.ativo`.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/estoque.ts packages/core/src/index.ts apps/server/src/routes/estoque.ts apps/server/src/routes/estoque.test.ts apps/server/src/index.ts
git commit -m "feat(estoque): rotas de leitura e tipos compartilhados"
```

---

### Task 2: A tela — app já fica utilizável

Ao fim desta tarefa o Ricardo abre `/estoque` no Mac e no iPhone e vê os 388 lotes com o prazo real.

**Files:**
- Create: `apps/web/src/estoque/EstoqueScreen.tsx`
- Create: `apps/web/src/estoque/LoteRow.tsx`
- Create: `apps/web/src/estoque/LoteCard.tsx`
- Create: `apps/web/src/estoque/useEstoque.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: rotas da Task 1; tipos de `@app/core`
- Produces: rota `/estoque` (substitui a atual `InventoryScreen`, que continua existindo em `/estoque-pessoal`); `useEstoque()` devolvendo `{ lotes, total, contagens, visao, setVisao, carregarMais, recarregar }`

- [ ] **Step 1: Acrescentar as funções de API**

Modify `apps/web/src/api.ts`, acrescentando ao final (siga o padrão de `fetchJson`/headers já usado no arquivo — leia as funções vizinhas antes de escrever):

```ts
export async function getEstoqueContagens(): Promise<EstoqueContagens> {
  return fetchJson("/estoque/contagens");
}

export async function getEstoqueLotes(params: {
  visao?: string; especialidade?: string; local?: string;
  busca?: string; conferencia?: boolean; limite?: number; desde?: number;
}): Promise<{ lotes: EstoqueLote[]; total: number }> {
  const q = new URLSearchParams();
  if (params.visao) q.set("visao", params.visao);
  if (params.especialidade) q.set("especialidade", params.especialidade);
  if (params.local) q.set("local", params.local);
  if (params.busca) q.set("busca", params.busca);
  if (params.conferencia) q.set("conferencia", "1");
  if (params.limite) q.set("limite", String(params.limite));
  if (params.desde) q.set("desde", String(params.desde));
  return fetchJson(`/estoque/lotes?${q}`);
}

export async function getEstoqueComprar(): Promise<{ produtos: EstoqueProduto[] }> {
  return fetchJson("/estoque/comprar");
}

export async function getEstoqueFiltros(): Promise<{
  especialidades: Array<{ nome: string; total: number }>;
  locais: Array<{ id: string; nome: string; total: number }>;
}> {
  return fetchJson("/estoque/filtros");
}
```

Acrescente os tipos ao bloco de `import type` do topo: `EstoqueContagens`, `EstoqueLote`, `EstoqueProduto`.

- [ ] **Step 2: Escrever o hook**

Create `apps/web/src/estoque/useEstoque.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import type { EstoqueContagens, EstoqueLote } from "@app/core";
import { getEstoqueContagens, getEstoqueLotes } from "../api";

const PAGINA = 60;

export function useEstoque() {
  const [visao, setVisao] = useState("estoque");
  const [conferencia, setConferencia] = useState(false);
  const [lotes, setLotes] = useState<EstoqueLote[]>([]);
  const [total, setTotal] = useState(0);
  const [contagens, setContagens] = useState<EstoqueContagens | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async (desde: number) => {
    const r = await getEstoqueLotes({ visao, conferencia, limite: PAGINA, desde });
    setTotal(r.total);
    setLotes((atual) => (desde === 0 ? r.lotes : [...atual, ...r.lotes]));
  }, [visao, conferencia]);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    await Promise.all([carregar(0), getEstoqueContagens().then(setContagens)]);
    setCarregando(false);
  }, [carregar]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return {
    lotes, total, contagens, visao, conferencia, carregando,
    setVisao, setConferencia, recarregar,
    carregarMais: () => carregar(lotes.length),
  };
}
```

- [ ] **Step 3: Escrever a linha compacta**

Create `apps/web/src/estoque/LoteRow.tsx`. A linha tem cinco colunas: tarja de status, nome com marca e lote, etiqueta, quantidade e `usar até`. **As três últimas são centralizadas** e usam `fontVariantNumeric: "tabular-nums"` para as datas empilharem alinhadas.

```tsx
import type { EstoqueLote } from "@app/core";
import { useTheme } from "../ThemeProvider";

const COR: Record<string, string> = {
  vencido: "#C4333B", prazo_passou: "#C4333B", armadilha: "#B0700A",
  no_prazo: "#2C8C4E", sem_validade: "#8A9199",
};

const ROTULO: Record<string, string> = {
  vencido: "vencido", prazo_passou: "prazo passou", armadilha: "",
  no_prazo: "no prazo", sem_validade: "sem validade",
};

export function etiqueta(l: EstoqueLote): string {
  if (l.status === "armadilha" && l.usarAte) {
    const [a, m, d] = l.usarAte.split("-");
    return `${d}/${m}/${a.slice(2)}`;
  }
  return ROTULO[l.status] ?? "";
}

export function LoteRow({ lote, onAbrir }: { lote: EstoqueLote; onAbrir: (l: EstoqueLote) => void }) {
  const { theme } = useTheme();
  const cor = COR[lote.status];
  return (
    <button
      onClick={() => onAbrir(lote)}
      onPointerEnter={() => onAbrir(lote)}
      style={{
        display: "grid",
        gridTemplateColumns: "4px minmax(0,1fr) 104px 80px 108px",
        gap: 10, alignItems: "center", width: "100%", textAlign: "left",
        padding: "9px 11px", borderRadius: 10, border: "none",
        background: "transparent", cursor: "pointer", font: "inherit",
        color: theme.colors.textPrimary,
      }}
    >
      <span style={{ width: 4, height: 25, borderRadius: 2, background: cor }} />
      <span style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden",
                     textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {lote.nome}
        {lote.precisaConferencia && (
          <span aria-label="falta informação" style={{ color: "#B0700A", fontWeight: 700 }}> !</span>
        )}
        <span style={{ fontSize: 11.5, color: theme.colors.textSecondary }}>
          {" · "}{lote.marca ?? "—"}{lote.lote ? ` · ${lote.lote}` : ""}
        </span>
      </span>
      <span style={{ display: "flex", justifyContent: "center" }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 8px",
                       borderRadius: 6, background: `${cor}22`, color: cor,
                       whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          {etiqueta(lote)}
        </span>
      </span>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12,
                     fontVariantNumeric: "tabular-nums", textAlign: "center",
                     color: theme.colors.textSecondary }}>
        {lote.quantidade ? `${lote.quantidade} ${lote.unidade}` : "—"}
      </span>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12,
                     fontVariantNumeric: "tabular-nums", textAlign: "center",
                     color: theme.colors.textSecondary }}>
        {lote.usarAte ? lote.usarAte.split("-").reverse().join("/") : "—"}
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Escrever o card flutuante**

Create `apps/web/src/estoque/LoteCard.tsx`. O card **flutua sobre a lista** — nada abaixo se move. Ele é posicionado com `position: absolute` dentro de um contêiner com `position: relative`, **nunca `position: fixed`**, que quebra dentro de ancestral com `backdrop-filter`.

```tsx
import type { EstoqueLote } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";

const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export function LoteCard({ lote, topo, esquerda, onFechar }: {
  lote: EstoqueLote; topo: number; esquerda: number; onFechar: () => void;
}) {
  const { theme } = useTheme();
  const linha = (rotulo: string, valor: string, cor?: string) => (
    <>
      <dt style={{ color: theme.colors.textSecondary }}>{rotulo}</dt>
      <dd style={{ margin: 0, textAlign: "right", fontFamily: "ui-monospace, monospace",
                   fontVariantNumeric: "tabular-nums", color: cor }}>{valor}</dd>
    </>
  );
  return (
    <div
      role="dialog"
      aria-label={`Detalhe de ${lote.nome}`}
      onPointerLeave={onFechar}
      style={{
        ...glassSurface(theme, { radius: 16 }),
        position: "absolute", zIndex: 40, top: topo, left: esquerda, width: 330,
        padding: "15px 17px", boxShadow: "0 18px 44px rgba(0,10,14,.28)",
      }}
    >
      <h3 style={{ margin: "0 0 2px", fontSize: 14.5, fontWeight: 600 }}>{lote.nome}</h3>
      <p style={{ margin: "0 0 11px", fontSize: 11.5, color: theme.colors.textSecondary }}>
        {lote.marca ?? "—"}{lote.lote ? ` · lote ${lote.lote}` : ""}
      </p>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr",
                   gap: "5px 14px", margin: "0 0 11px", fontSize: 12.5 }}>
        {linha("Validade", br(lote.validade))}
        {linha("Usar até", br(lote.usarAte), lote.status === "armadilha" ? "#B0700A" : undefined)}
        {linha("Em estoque", lote.quantidade ? `${lote.quantidade} ${lote.unidade}` : "0")}
        {linha("Local", lote.local ?? "—")}
        {linha("Especialidade", lote.especialidade)}
        {linha("Situação", lote.situacao ?? "—")}
      </dl>
      {lote.diasPerdidos > 0 && (
        <p style={{ fontSize: 11.5, padding: "8px 10px", borderRadius: 9, margin: "0 0 11px",
                    background: "rgba(176,112,10,.14)", color: "#B0700A", lineHeight: 1.45 }}>
          Vence no recesso. Perde {lote.diasPerdidos} dias de validade — use antes de {br(lote.usarAte)}.
        </p>
      )}
      {lote.precisaConferencia && (
        <p style={{ fontSize: 11.5, padding: "8px 10px", borderRadius: 9, margin: "0 0 11px",
                    background: "rgba(176,112,10,.14)", color: "#B0700A", lineHeight: 1.45 }}>
          {lote.conferenciaMotivo.join(" · ")}
        </p>
      )}
      {lote.observacoes && (
        <p style={{ fontSize: 11.5, margin: "0 0 11px", color: theme.colors.textSecondary,
                    lineHeight: 1.45 }}>{lote.observacoes}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Escrever a tela**

Create `apps/web/src/estoque/EstoqueScreen.tsx` com: cabeçalho de vidro com título e subtítulo de contagem; controle segmentado `Em estoque` / `Validade` / `Comprar` com os números; a lista dentro de um contêiner `position: relative` (para o card flutuar); e botão "Mostrar mais" quando `lotes.length < total`.

Use `SegmentedControl` de `apps/web/src/SegmentedControl.tsx` e `glassSurface(theme)`. O card abre no `onPointerEnter` da linha com atraso de ~170 ms e fecha no `onPointerLeave` do card. Guarde a posição do card lendo `getBoundingClientRect()` da linha relativa ao contêiner da lista.

- [ ] **Step 6: Registrar a rota**

Modify `apps/web/src/App.tsx`: acrescente o import de `EstoqueScreen` e troque a rota:

```tsx
          <Route path="/estoque" element={<EstoqueScreen />} />
          <Route path="/estoque-pessoal" element={<InventoryScreen />} />
```

- [ ] **Step 7: Verificar no navegador**

Suba `pnpm dev:server` e `pnpm dev:web`, abra `/estoque` e confirme visualmente: 215 no segmento "Em estoque", tarja colorida por status, colunas centralizadas, card abrindo no hover **sem empurrar a lista**, e "Mostrar mais" trazendo o restante.

Tire um screenshot e confira que nenhuma linha está com texto cortado.

- [ ] **Step 8: Verificar no iPhone**

Abra a mesma URL pelo Safari do iPhone (mesma rede) e confirme que a lista é legível e rolável. O card no toque longo é da Task 3 — aqui basta a lista.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/estoque apps/web/src/api.ts apps/web/src/App.tsx
git commit -m "feat(estoque): tela de consulta com card flutuante"
```

---

### Task 3: Movimentos — entrada, saída e descartar tudo

**Files:**
- Modify: `apps/server/src/routes/estoque.ts`
- Create: `apps/server/src/estoque/movimento.ts`
- Create: `apps/server/src/estoque/movimento.test.ts`
- Create: `apps/web/src/estoque/MovimentoModal.tsx`
- Modify: `apps/web/src/estoque/LoteCard.tsx`
- Modify: `apps/web/src/api.ts`

**Interfaces:**
- Consumes: Task 1 e 2
- Produces:
  - `aplicarMovimento(saldoAtual: number, tipo: TipoMovimento, quantidade: number): { saldoDepois: number } | { erro: string }`
  - `POST /estoque/lotes/:id/movimento` body `{ tipo, quantidade, motivo?, clientId }` → `{ lote, movimento }`
  - `POST /estoque/lotes/:id/descartar-tudo` body `{ motivo, clientId }` → `{ lote }`

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/server/src/estoque/movimento.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aplicarMovimento } from "./movimento.js";

describe("aplicarMovimento", () => {
  it("entrada soma", () => {
    expect(aplicarMovimento(10, "entrada", 3)).toEqual({ saldoDepois: 13 });
  });

  it("saída subtrai", () => {
    expect(aplicarMovimento(10, "saida", 3)).toEqual({ saldoDepois: 7 });
  });

  it("saída maior que o saldo é recusada com mensagem em português", () => {
    const r = aplicarMovimento(2, "saida", 5) as { erro: string };
    expect(r.erro).toContain("2");
    expect(r.erro).toMatch(/saldo|estoque/i);
  });

  it("quantidade zero é recusada — o banco também recusaria", () => {
    expect(aplicarMovimento(10, "saida", 0)).toHaveProperty("erro");
  });

  it("quantidade negativa é recusada", () => {
    expect(aplicarMovimento(10, "entrada", -1)).toHaveProperty("erro");
  });

  it("descarte zera o lote inteiro", () => {
    expect(aplicarMovimento(7, "descarte", 7)).toEqual({ saldoDepois: 0 });
  });

  it("contagem ajusta para o valor contado, inclusive zero", () => {
    expect(aplicarMovimento(10, "contagem", 4)).toEqual({ saldoDepois: 4 });
    expect(aplicarMovimento(10, "contagem", 0)).toEqual({ saldoDepois: 0 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test movimento`
Expected: FAIL — `Cannot find module './movimento.js'`

- [ ] **Step 3: Escrever a implementação**

Create `apps/server/src/estoque/movimento.ts`:

```ts
export type TipoMovimento = "entrada" | "saida" | "descarte" | "contagem" | "transferencia";

export type ResultadoMovimento = { saldoDepois: number } | { erro: string };

// O banco tem check (quantidade > 0) em est_movimentos e (quantidade >= 0) em
// est_lotes. Recusamos antes, com mensagem em português, para o usuário não ver
// erro cru de Postgres.
//
// "contagem" é a exceção que precisa aceitar zero: contar uma gaveta e achar
// nada é justamente o gesto de conferência deste módulo. Ela não vira linha de
// est_movimentos com quantidade 0 — grava a DIFERENÇA, ver a rota.
export function aplicarMovimento(
  saldoAtual: number,
  tipo: TipoMovimento,
  quantidade: number,
): ResultadoMovimento {
  if (!Number.isFinite(quantidade)) return { erro: "Quantidade inválida." };
  if (tipo === "contagem") {
    if (quantidade < 0) return { erro: "A contagem não pode ser negativa." };
    return { saldoDepois: quantidade };
  }
  if (quantidade <= 0) return { erro: "A quantidade precisa ser maior que zero." };
  if (tipo === "entrada") return { saldoDepois: saldoAtual + quantidade };
  if (quantidade > saldoAtual) {
    return { erro: `Não dá para tirar ${quantidade}: o lote tem ${saldoAtual}.` };
  }
  return { saldoDepois: saldoAtual - quantidade };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test movimento`
Expected: PASS — 7 testes

- [ ] **Step 5: Escrever as rotas de escrita**

Modify `apps/server/src/routes/estoque.ts`, acrescentando dentro de `estoqueRoutes`. Ambas rodam em transação e gravam no audit log. `clientId` garante idempotência: reenviar o mesmo movimento não desconta duas vezes.

```ts
  app.post("/estoque/lotes/:id/movimento", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { tipo: TipoMovimento; quantidade: number; motivo?: string; clientId: string };
    if (!b.clientId) return reply.code(400).send({ error: "clientId é obrigatório." });

    const client = await pool.connect();
    try {
      await client.query("begin");
      const dup = await client.query("select id from est_movimentos where client_id = $1", [b.clientId]);
      if (dup.rowCount) { await client.query("rollback"); return { repetido: true }; }

      const atual = await client.query(
        "select quantidade from est_lotes where id = $1 for update", [id]);
      if (!atual.rowCount) { await client.query("rollback"); return reply.code(404).send({ error: "Lote não encontrado." }); }

      const saldoAntes = Number(atual.rows[0].quantidade);
      const r = aplicarMovimento(saldoAntes, b.tipo, Number(b.quantidade));
      if ("erro" in r) { await client.query("rollback"); return reply.code(400).send({ error: r.erro }); }

      const delta = Math.abs(r.saldoDepois - saldoAntes);
      if (delta > 0) {
        await client.query(
          `insert into est_movimentos
             (lote_id, tipo, quantidade, saldo_antes, saldo_depois, motivo, usuario, dispositivo, client_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [id, b.tipo, delta, saldoAntes, r.saldoDepois, b.motivo ?? null,
           req.user?.name ?? "desconhecido", "mac", b.clientId]);
      }
      await client.query("update est_lotes set quantidade = $1, atualizado_em = now() where id = $2",
        [r.saldoDepois, id]);
      await client.query(
        `insert into est_audit_log (entidade, entidade_id, acao, campo, valor_antes, valor_depois, descricao, usuario)
         values ('lote', $1, $2, 'quantidade', $3, $4, $5, $6)`,
        [id, b.tipo, String(saldoAntes), String(r.saldoDepois),
         `${b.tipo} de ${delta}${b.motivo ? ` (${b.motivo})` : ""}`, req.user?.name ?? "desconhecido"]);
      await client.query("commit");

      const novo = await pool.query(`${SELECT_LOTE} where l.id = $1`, [id]);
      return { lote: novo.rows[0] };
    } catch (e) {
      await client.query("rollback"); throw e;
    } finally { client.release(); }
  });
```

A rota `descartar-tudo` segue o mesmo formato, com `tipo: "descarte"`, `quantidade` igual ao saldo inteiro, e além disso `update est_lotes set descartado_em = now(), descarte_motivo = $motivo`. Os dois campos vão **juntos** — a constraint `est_lotes_descarte_completo` recusa um sem o outro. Motivos aceitos: `vencido`, `danificado`, `contaminado`, `perdido`, `devolvido`, `lancamento duplicado`.

- [ ] **Step 6: Escrever o modal**

Create `apps/web/src/estoque/MovimentoModal.tsx`, renderizado via `createPortal(..., document.body)` — **obrigatório**, porque `position: fixed` quebra dentro de ancestral com `backdrop-filter`. Siga o padrão de `GlassModal.tsx`.

Três passos: escolher a quantidade com botões `−` e `+` e número grande; ver o resumo com produto, lote, tipo, quantidade, data/hora, usuário e saldo antes → depois; confirmar. `descartar-tudo` é um fluxo separado, em vermelho, com o saldo inteiro em número grande e escolha obrigatória de motivo — pré-selecionando `vencido` quando o lote já está vencido.

- [ ] **Step 7: Ligar no card**

Modify `apps/web/src/estoque/LoteCard.tsx`: acrescente a fileira de ações `Entrada` / `Saída` / `Histórico`, e — separada, em vermelho, só quando `lote.quantidade > 0` — `Descartar tudo (N)`.

- [ ] **Step 8: Verificar de ponta a ponta**

No navegador: dê saída de 1 unidade num lote com saldo, confirme que a linha atualiza sem recarregar a página, e confirme no banco que a linha de movimento e a de auditoria existem:

```bash
psql "$DATABASE_URL" -c "select tipo, quantidade, saldo_antes, saldo_depois, usuario from est_movimentos order by criado_em desc limit 3;"
```

Depois teste o caminho de erro: tente tirar mais do que o saldo e confirme que aparece a mensagem em português, sem erro de Postgres vazando.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/estoque/movimento.ts apps/server/src/estoque/movimento.test.ts apps/server/src/routes/estoque.ts apps/web/src/estoque apps/web/src/api.ts
git commit -m "feat(estoque): entrada, saida e descarte com auditoria"
```

---

### Task 4: Resolver a conferência — os 53

O que o Ricardo pediu: ser avisado no app e resolver ali. Ver §7.5 do spec.

**Files:**
- Modify: `apps/server/src/routes/estoque.ts`
- Create: `apps/web/src/estoque/ConferenciaScreen.tsx`
- Create: `apps/web/src/estoque/ResolverCard.tsx`
- Modify: `apps/web/src/estoque/EstoqueScreen.tsx`
- Modify: `apps/web/src/api.ts`

**Interfaces:**
- Consumes: Tasks 1–3
- Produces:
  - `PATCH /estoque/lotes/:id` body `{ validade?, lote?, localId?, quantidade?, observacoes?, resolverMotivo? }` → `{ lote }`
  - `GET /estoque/conferencia` → `{ lotes }` ordenado por consequência (saldo vivo primeiro, depois validade divergente)
  - `GET /estoque/lotes/:id/irmaos` → os outros lotes do mesmo produto com o mesmo número de lote, para comparar lado a lado

- [ ] **Step 1: Rota de edição com auditoria por campo**

Modify `apps/server/src/routes/estoque.ts`. Cada campo alterado grava sua própria linha no audit log, com valor antes e depois. `resolverMotivo` remove **apenas aquele** motivo de `conferencia_motivo`; quando o array esvazia, `precisa_conferencia` vira false.

Regras que o código precisa respeitar: editar validade recalcula `usar_ate` e `usar_ate_motivo` usando `usarAte()` de `apps/server/src/estoque/recesso.js`; quantidade alterada por aqui gera movimento do tipo `contagem`; e nenhum campo é apagado silenciosamente — enviar `null` explicitamente é diferente de não enviar o campo.

- [ ] **Step 2: Testes da rota**

Cubra: alterar validade recalcula `usar_ate`; resolver um motivo mantém os outros; resolver o último motivo baixa `precisa_conferencia`; e cada alteração gera linha de auditoria com antes e depois.

- [ ] **Step 3: A tela de conferência**

Create `apps/web/src/estoque/ConferenciaScreen.tsx`: fila de cartões, um lote por vez, ordenada por consequência. Cada cartão mostra o produto, o motivo, e **o formulário específico daquele motivo** — não um formulário genérico:

- `sem validade` → campo de data + botão "não tem validade impressa"
- `sem local` → seletor dos 28 locais
- `mesmo lote com validades diferentes` → as duas linhas lado a lado, com as duas datas, perguntando qual está no frasco
- `linha possivelmente duplicada` → as duas linhas lado a lado, com "são dois potes" ou "foi lançado duas vezes"
- `validade implausível` → mostra a data atual e pergunta se confirma
- `sem quantidade` → campo numérico

Todo cartão tem **"Não sei agora"**, que pula sem resolver. Um contador mostra quantos faltam.

- [ ] **Step 4: Entrada pela tela principal**

Modify `apps/web/src/estoque/EstoqueScreen.tsx`: quando `contagens.conferencia > 0`, mostre uma faixa de vidro no topo — calma, uma linha — com "53 lotes precisam de conferência" e botão que leva à fila. Some quando chega a zero.

- [ ] **Step 5: Verificar com dado real**

Resolva de verdade os 4 pares de validade divergente, comparando com o frasco físico. Confirme no banco que a validade mudou, que `usar_ate` foi recalculado, que o motivo saiu do array, e que o audit log tem o antes e o depois:

```bash
psql "$DATABASE_URL" -c "select campo, valor_antes, valor_depois, descricao from est_audit_log where entidade='lote' order by criado_em desc limit 10;"
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/estoque.ts apps/web/src/estoque apps/web/src/api.ts
git commit -m "feat(estoque): fila de conferencia com resolucao por motivo"
```

---

## Entregável deste plano

Um app que o Ricardo abre no Mac e no iPhone para ver o estoque com o prazo real, dar entrada e saída, descartar lote inteiro com motivo, e resolver as 53 pendências — tudo com histórico imutável.

## Plano C (depois)

Busca com correção de digitação e filtros flutuantes; impressão A4 (queimar antes do recesso, lista de compras, etiquetas QR); leitor de código de barras com ZXing e GS1; PWA offline com IndexedDB e fila de sincronia; e o revisor.

## Dívida herdada do Plano A, a pagar aqui

- `usar_ate` é materializado com calendário fixo e não tem caminho de recálculo. A Task 4 já recalcula ao editar validade — falta um comando que recalcule os 388 quando o calendário mudar.
- O leitor da planilha não valida o cabeçalho: inserir uma coluna no Excel faz ler tudo deslocado sem erro.
- `especialidadesDivergentes` (7 produtos usados em duas disciplinas) só vai para o console do importador; o filtro por especialidade vai esconder o IRM sem explicar.
- A hierarquia de locais não existe: os 28 estão achatados com `nivel = 'sala'`, o que é factualmente errado para `Prateleira IV - Caixa Endodontia`.
- `lerPlanilha` e `applyImport` não têm teste — são os dois códigos de maior consequência do Plano A.
