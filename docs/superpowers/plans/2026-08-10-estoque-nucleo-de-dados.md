# Estoque da Clínica Escola — Plano A: núcleo de dados

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar os 388 lotes da planilha no Postgres, corretamente classificados pelo calendário de recesso da faculdade, com relatório de importação conferível.

**Architecture:** Duas funções puras carregam toda a lógica de negócio — `norm()` (deduplicação) e `usarAte()` (motor de validade) — e são testadas isoladamente antes de qualquer banco existir. Sobre elas, uma migration cria o modelo produto/lote/local/movimento, e um importador em duas fases (`planImport` puro → `applyImport` com efeito) transforma a planilha em dados. Nenhuma rota HTTP e nenhuma tela neste plano: o entregável é um banco correto e verificável por linha de comando.

**Tech Stack:** TypeScript ESM, Vitest, Postgres (`pg`), ExcelJS para ler o `.xlsx`, pnpm workspaces.

## Global Constraints

- **Lote e validade da planilha nunca são alterados nem corrigidos** — nem os de 2050/2051. Só recebem marcação.
- **Nenhum lote é apagado.** Zerados e eliminados entram como inativos, íntegros e resolvíveis por leitor de código.
- **`norm()` é a regra única de deduplicação**, definida uma vez: `lowercase → NFD → remove diacríticos → remove tudo que não for [a-z0-9]`. Pontuação é **removida**, não vira espaço.
- **O server não importa valores de `@app/core` em runtime** — resolve como CommonJS sob tsx/node-ESM e derruba o processo. Só `import type`. Valores compartilhados são duplicados em módulo local do server, com teste de contrato.
- **Nunca usar `date.toISOString().slice(0,10)`** para obter dia/mês/ano — em UTC-3 isso rola para o dia errado à noite. Sempre `getFullYear()/getMonth()/getDate()` locais.
- Imports relativos no server terminam em `.js` (ESM), mesmo apontando para arquivos `.ts`.
- Migrations são idempotentes (`create table if not exists`, `create or replace`).
- Mensagens de erro e de relatório em português.

**Calendário do recesso** (configurável, mas estes são os valores de partida):

| Recesso | Último dia letivo | Volta | Margem |
|---|---|---|---|
| Fim de ano | 30/11 | 03/03 | 14 dias |
| Julho | 29/07 | 11/08 | 14 dias |

**Números esperados ao fim do plano:** 388 lotes, 215 ativos, 173 inativos, 39 com `precisa_conferencia`, 9 vencidos com saldo, 54 armadilhas de recesso, 10 especialidades.

---

### Task 1: Infraestrutura de teste

Não existe nenhum teste no repositório hoje. Sem isto não há ciclo de TDD para as tarefas seguintes.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `apps/server/src/estoque/sanity.test.ts` (removido na Task 2)

**Interfaces:**
- Consumes: nada
- Produces: comando `pnpm test`, que roda Vitest sobre todo o monorepo

- [ ] **Step 1: Instalar o Vitest na raiz**

```bash
pnpm add -Dw vitest@^2.1.0
```

- [ ] **Step 2: Criar a configuração**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/ml-venv/**"],
    environment: "node",
  },
});
```

`ml-venv` precisa ficar de fora: são milhares de arquivos Python do detector de radiografia.

- [ ] **Step 3: Adicionar o script**

Modify `package.json`, dentro de `"scripts"`, após `"build"`:

```json
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Escrever um teste que falha**

Create `apps/server/src/estoque/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("infra de teste", () => {
  it("roda", () => {
    expect(1 + 1).toBe(3);
  });
});
```

- [ ] **Step 5: Rodar e confirmar que falha**

Run: `pnpm test`
Expected: FAIL — `expected 2 to be 3`

- [ ] **Step 6: Corrigir para passar**

Modify `apps/server/src/estoque/sanity.test.ts`, trocar `toBe(3)` por `toBe(2)`.

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `pnpm test`
Expected: PASS — `1 passed`

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts apps/server/src/estoque/sanity.test.ts
git commit -m "chore: adiciona Vitest ao monorepo"
```

---

### Task 2: `norm()` e o teste de contrato

A função de deduplicação. Vive em dois lugares por causa da restrição de CommonJS, e um teste garante que as duas cópias nunca divirjam — foi exatamente essa divergência que fez o catálogo dar 286 numa contagem e 288 noutra.

**Files:**
- Create: `packages/core/src/norm.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/server/src/estoque/norm.ts`
- Create: `apps/server/src/estoque/norm.test.ts`
- Delete: `apps/server/src/estoque/sanity.test.ts`

**Interfaces:**
- Consumes: Task 1 (`pnpm test`)
- Produces: `norm(s: string | null | undefined): string` — disponível como `@app/core` no frontend e como `apps/server/src/estoque/norm.js` no server. `NORM_CASES: ReadonlyArray<[string, string]>` exportado pelas duas cópias, usado pelo teste de contrato.

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/server/src/estoque/norm.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { norm, NORM_CASES } from "./norm.js";
import { norm as normCore, NORM_CASES as CASES_CORE } from "../../../../packages/core/src/norm.js";

describe("norm", () => {
  it("remove maiúscula, acento e pontuação", () => {
    expect(norm("Ácido fosfórico 37%")).toBe("acidofosforico37");
  });

  it("junta grafias que só diferem em caixa", () => {
    expect(norm("FMG")).toBe(norm("Fmg"));
    expect(norm("MAXICOR")).toBe(norm("Maxicor"));
  });

  it("junta grafias que só diferem em acento", () => {
    expect(norm("Rioquimica")).toBe(norm("Rioquímica"));
  });

  it("remove espaço em vez de preservá-lo", () => {
    expect(norm("SS Plus")).toBe("ssplus");
    expect(norm("SSplus")).toBe("ssplus");
    expect(norm("tricresol formalina")).toBe("tricresolformalina");
  });

  it("NÃO junta produtos que diferem no sufixo — cor, calibre, tamanho", () => {
    expect(norm("Resina LISS - EA1")).not.toBe(norm("Resina LISS - EA2"));
    expect(norm("Protaper Universal - F2")).not.toBe(norm("Protaper Universal - F4"));
    expect(norm("Ultrapak - fio Retrator - #00")).not.toBe(norm("Ultrapak - fio Retrator - #000"));
    expect(norm("Luvas Cirugicas - 7.0")).not.toBe(norm("Luvas Cirugicas - 8.0"));
  });

  it("aceita nulo e indefinido", () => {
    expect(norm(null)).toBe("");
    expect(norm(undefined)).toBe("");
  });
});

describe("contrato entre as duas cópias", () => {
  it("core e server têm a mesma bateria de casos", () => {
    expect(CASES_CORE).toEqual(NORM_CASES);
  });

  it("core e server produzem o mesmo resultado em todos os casos", () => {
    for (const [entrada, esperado] of NORM_CASES) {
      expect(norm(entrada), `server: ${entrada}`).toBe(esperado);
      expect(normCore(entrada), `core: ${entrada}`).toBe(esperado);
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test norm`
Expected: FAIL — `Cannot find module './norm.js'`

- [ ] **Step 3: Escrever a implementação em core**

Create `packages/core/src/norm.ts`:

```ts
// Regra ÚNICA de deduplicação de produtos e marcas.
// Pontuação e espaço são REMOVIDOS, não substituídos por espaço: é o que faz
// "SS Plus" e "SSplus" virarem a mesma marca. Qualquer mudança aqui precisa
// ser espelhada em apps/server/src/estoque/norm.ts — o teste de contrato falha
// se as duas divergirem.
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

export const NORM_CASES: ReadonlyArray<[string, string]> = [
  ["Ácido fosfórico 37%", "acidofosforico37"],
  ["FMG", "fmg"],
  ["Fmg", "fmg"],
  ["Rioquímica", "rioquimica"],
  ["SS Plus", "ssplus"],
  ["SSplus", "ssplus"],
  ["tricresol formalina", "tricresolformalina"],
  ["tricresolformalina", "tricresolformalina"],
  ["Resina LISS - EA1", "resinalissea1"],
  ["Resina LISS - EA2", "resinalissea2"],
  ["Ultrapak - fio Retrator - #00", "ultrapakfioretrator00"],
  ["Ultrapak - fio Retrator - #000", "ultrapakfioretrator000"],
  ["", ""],
];
```

- [ ] **Step 4: Exportar de core**

Modify `packages/core/src/index.ts`, adicionando ao final:

```ts
export * from "./norm.js";
```

- [ ] **Step 5: Escrever a cópia do server**

Create `apps/server/src/estoque/norm.ts` com **conteúdo idêntico** ao de `packages/core/src/norm.ts`, trocando apenas o comentário do topo:

```ts
// Cópia local de packages/core/norm.ts.
// NÃO importar de @app/core: o pacote resolve como CommonJS sob tsx/node-ESM e
// importar um valor em runtime derruba o servidor com "does not provide an
// export named". Só `import type` funciona de lá.
// O teste de contrato em norm.test.ts falha se esta cópia divergir do core.
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

export const NORM_CASES: ReadonlyArray<[string, string]> = [
  ["Ácido fosfórico 37%", "acidofosforico37"],
  ["FMG", "fmg"],
  ["Fmg", "fmg"],
  ["Rioquímica", "rioquimica"],
  ["SS Plus", "ssplus"],
  ["SSplus", "ssplus"],
  ["tricresol formalina", "tricresolformalina"],
  ["tricresolformalina", "tricresolformalina"],
  ["Resina LISS - EA1", "resinalissea1"],
  ["Resina LISS - EA2", "resinalissea2"],
  ["Ultrapak - fio Retrator - #00", "ultrapakfioretrator00"],
  ["Ultrapak - fio Retrator - #000", "ultrapakfioretrator000"],
  ["", ""],
];
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `pnpm test norm`
Expected: PASS — 8 testes

- [ ] **Step 7: Remover o teste de sanidade**

```bash
rm apps/server/src/estoque/sanity.test.ts
```

- [ ] **Step 8: Rodar tudo**

Run: `pnpm test`
Expected: PASS — 8 testes, nenhum falhando

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/norm.ts packages/core/src/index.ts apps/server/src/estoque/norm.ts apps/server/src/estoque/norm.test.ts
git rm apps/server/src/estoque/sanity.test.ts
git commit -m "feat(estoque): regra unica de normalizacao com teste de contrato"
```

---

### Task 3: Motor de validade

O coração do módulo. Função pura, sem banco, sem rede. É o que sabe que um lote que vence em janeiro morreu em 30 de novembro.

**Files:**
- Create: `apps/server/src/estoque/recesso.ts`
- Create: `apps/server/src/estoque/recesso.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `type MotivoUsarAte = "validade" | "recesso_fim_ano" | "recesso_julho"`
  - `type ResultadoUsarAte = { data: Date; motivo: MotivoUsarAte; diasPerdidos: number }`
  - `type CalendarioRecesso = { fimAno: JanelaRecesso; julho: JanelaRecesso; margemDias: number }`
  - `type JanelaRecesso = { ultimoLetivo: { mes: number; dia: number }; volta: { mes: number; dia: number } }`
  - `CALENDARIO_PADRAO: CalendarioRecesso`
  - `usarAte(validade: Date, cal?: CalendarioRecesso): ResultadoUsarAte`
  - `classificar(validade: Date | null, hoje: Date, cal?: CalendarioRecesso): StatusLote`
  - `type StatusLote = "vencido" | "prazo_passou" | "armadilha" | "no_prazo" | "sem_validade"`

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/server/src/estoque/recesso.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { usarAte, classificar, CALENDARIO_PADRAO } from "./recesso.js";

const d = (ano: number, mes: number, dia: number) => new Date(ano, mes - 1, dia);
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

describe("usarAte — recesso de fim de ano", () => {
  it("dezembro cai no recesso e recua para 30/11 do mesmo ano", () => {
    const r = usarAte(d(2026, 12, 22));
    expect(iso(r.data)).toBe("2026-11-30");
    expect(r.motivo).toBe("recesso_fim_ano");
    expect(r.diasPerdidos).toBe(22);
  });

  it("janeiro recua para 30/11 do ano ANTERIOR", () => {
    const r = usarAte(d(2027, 1, 1));
    expect(iso(r.data)).toBe("2026-11-30");
    expect(r.motivo).toBe("recesso_fim_ano");
  });

  it("fevereiro recua para 30/11 do ano anterior", () => {
    expect(iso(usarAte(d(2027, 2, 1)).data)).toBe("2026-11-30");
  });

  it("01/03 ainda é recesso — a volta é dia 3", () => {
    const r = usarAte(d(2027, 3, 1));
    expect(iso(r.data)).toBe("2026-11-30");
    expect(r.diasPerdidos).toBe(91);
  });

  it("30/11 é o último dia letivo e não é armadilha", () => {
    const r = usarAte(d(2026, 11, 30));
    expect(iso(r.data)).toBe("2026-11-30");
    expect(r.motivo).toBe("validade");
    expect(r.diasPerdidos).toBe(0);
  });
});

describe("usarAte — margem de 14 dias após a volta", () => {
  it("vencer no próprio dia da volta é armadilha", () => {
    const r = usarAte(d(2027, 3, 3));
    expect(iso(r.data)).toBe("2026-11-30");
    expect(r.motivo).toBe("recesso_fim_ano");
  });

  it("vencer 13 dias após a volta ainda é armadilha", () => {
    expect(usarAte(d(2027, 3, 16)).motivo).toBe("recesso_fim_ano");
  });

  it("vencer exatamente 14 dias após a volta já é seguro", () => {
    const r = usarAte(d(2027, 3, 17));
    expect(iso(r.data)).toBe("2027-03-17");
    expect(r.motivo).toBe("validade");
  });
});

describe("usarAte — recesso de julho", () => {
  it("julho até o dia 29 é letivo e seguro", () => {
    const r = usarAte(d(2027, 7, 15));
    expect(iso(r.data)).toBe("2027-07-15");
    expect(r.motivo).toBe("validade");
  });

  it("30/07 já é recesso e recua para 29/07", () => {
    const r = usarAte(d(2027, 7, 30));
    expect(iso(r.data)).toBe("2027-07-29");
    expect(r.motivo).toBe("recesso_julho");
  });

  it("01/08 recua para 29/07", () => {
    const r = usarAte(d(2027, 8, 1));
    expect(iso(r.data)).toBe("2027-07-29");
    expect(r.diasPerdidos).toBe(3);
  });

  it("11/08 é a volta e ainda é armadilha pela margem", () => {
    expect(usarAte(d(2027, 8, 11)).motivo).toBe("recesso_julho");
  });

  it("25/08 é 14 dias após a volta e já é seguro", () => {
    expect(usarAte(d(2027, 8, 25)).motivo).toBe("validade");
  });
});

describe("usarAte — calendário configurável", () => {
  it("respeita um calendário diferente do padrão", () => {
    const cal = {
      ...CALENDARIO_PADRAO,
      margemDias: 0,
    };
    expect(usarAte(d(2027, 3, 3), cal).motivo).toBe("validade");
  });
});

describe("classificar", () => {
  const hoje = d(2026, 8, 10);

  it("sem validade informada", () => {
    expect(classificar(null, hoje)).toBe("sem_validade");
  });

  it("validade já passou", () => {
    expect(classificar(d(2026, 8, 1), hoje)).toBe("vencido");
  });

  it("validade impressa ainda no futuro, mas o prazo real morreu no recesso", () => {
    // 05/08/2026 cai dentro do recesso de julho (30/07 a 10/08), entao o prazo
    // util era 29/07. Em 03/08 o rotulo ainda diz que esta bom — nao e "vencido".
    expect(classificar(d(2026, 8, 5), d(2026, 8, 3))).toBe("prazo_passou");
  });

  it("armadilha de recesso ainda no futuro", () => {
    expect(classificar(d(2026, 12, 22), hoje)).toBe("armadilha");
  });

  it("no prazo", () => {
    expect(classificar(d(2027, 6, 1), hoje)).toBe("no_prazo");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test recesso`
Expected: FAIL — `Cannot find module './recesso.js'`

- [ ] **Step 3: Escrever a implementação**

Create `apps/server/src/estoque/recesso.ts`:

```ts
// Motor de validade. A clínica escola fecha completamente em dois períodos, e
// um lote que vence com a faculdade fechada morre antes da data impressa:
// ninguém vai usar. Este módulo calcula a data-limite real de uso.
//
// NUNCA usar toISOString() aqui: em UTC-3 ele rola para o dia anterior à noite.
// Todo cálculo usa componentes locais.

export type MotivoUsarAte = "validade" | "recesso_fim_ano" | "recesso_julho";

export type StatusLote = "vencido" | "prazo_passou" | "armadilha" | "no_prazo" | "sem_validade";

export type JanelaRecesso = {
  ultimoLetivo: { mes: number; dia: number };
  volta: { mes: number; dia: number };
};

export type CalendarioRecesso = {
  fimAno: JanelaRecesso;
  julho: JanelaRecesso;
  margemDias: number;
};

export type ResultadoUsarAte = {
  data: Date;
  motivo: MotivoUsarAte;
  diasPerdidos: number;
};

export const CALENDARIO_PADRAO: CalendarioRecesso = {
  fimAno: { ultimoLetivo: { mes: 11, dia: 30 }, volta: { mes: 3, dia: 3 } },
  julho: { ultimoLetivo: { mes: 7, dia: 29 }, volta: { mes: 8, dia: 11 } },
  margemDias: 14,
};

const dia = (ano: number, mes: number, d: number) => new Date(ano, mes - 1, d);

function diffDias(a: Date, b: Date): number {
  const ma = dia(a.getFullYear(), a.getMonth() + 1, a.getDate()).getTime();
  const mb = dia(b.getFullYear(), b.getMonth() + 1, b.getDate()).getTime();
  return Math.round((ma - mb) / 86_400_000);
}

// Para uma validade, devolve os candidatos de recesso relevantes: o par
// (último dia letivo, volta) de cada janela, ancorado no ano certo. O recesso
// de fim de ano atravessa a virada, então gera duas âncoras.
function janelas(validade: Date, cal: CalendarioRecesso) {
  const y = validade.getFullYear();
  const out: Array<{ ultimo: Date; volta: Date; motivo: MotivoUsarAte }> = [];
  for (const base of [y - 1, y]) {
    out.push({
      ultimo: dia(base, cal.fimAno.ultimoLetivo.mes, cal.fimAno.ultimoLetivo.dia),
      volta: dia(base + 1, cal.fimAno.volta.mes, cal.fimAno.volta.dia),
      motivo: "recesso_fim_ano",
    });
    out.push({
      ultimo: dia(base, cal.julho.ultimoLetivo.mes, cal.julho.ultimoLetivo.dia),
      volta: dia(base, cal.julho.volta.mes, cal.julho.volta.dia),
      motivo: "recesso_julho",
    });
  }
  return out;
}

export function usarAte(validade: Date, cal: CalendarioRecesso = CALENDARIO_PADRAO): ResultadoUsarAte {
  for (const j of janelas(validade, cal)) {
    const dentroDoRecesso = validade > j.ultimo && validade < j.volta;
    const logoAposAVolta = validade >= j.volta && diffDias(validade, j.volta) < cal.margemDias;
    if (dentroDoRecesso || logoAposAVolta) {
      return { data: j.ultimo, motivo: j.motivo, diasPerdidos: diffDias(validade, j.ultimo) };
    }
  }
  return { data: validade, motivo: "validade", diasPerdidos: 0 };
}

// "vencido" e "prazo_passou" NAO podem colapsar. Um lote cuja validade impressa
// ainda nao chegou, mas cujo prazo util morreu no recesso, nao esta vencido: quem
// conferir a caixa fisica vai ler uma data futura no rotulo. Chamar isso de
// "vencido" contradiz o produto na mao do tecnico e destroi a confianca no
// sistema — e mistura achado sanitario com achado operacional no mesmo numero.
export function classificar(
  validade: Date | null,
  hoje: Date,
  cal: CalendarioRecesso = CALENDARIO_PADRAO,
): StatusLote {
  if (!validade) return "sem_validade";
  if (diffDias(validade, hoje) < 0) return "vencido";
  const r = usarAte(validade, cal);
  if (diffDias(r.data, hoje) < 0) return "prazo_passou";
  return r.motivo === "validade" ? "no_prazo" : "armadilha";
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test recesso`
Expected: PASS — 19 testes

Se `01/03/2027` falhar devolvendo `validade`, a comparação `validade < j.volta` está usando a janela do ano errado: a âncora tem que ser `y - 1` para datas de janeiro a março.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/estoque/recesso.ts apps/server/src/estoque/recesso.test.ts
git commit -m "feat(estoque): motor de validade com calendario de recesso"
```

---

### Task 4: Esquema do banco

**Files:**
- Create: `apps/server/migrations/0030_estoque_clinica.sql`

**Interfaces:**
- Consumes: nada
- Produces: tabelas `est_locais`, `est_produtos`, `est_lotes`, `est_movimentos`, `est_audit_log`. Prefixo `est_` para não colidir com o `inventory_items` do estoque pessoal, que continua existindo.

- [ ] **Step 1: Escrever a migration**

Create `apps/server/migrations/0030_estoque_clinica.sql`:

```sql
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
```

- [ ] **Step 2: Rodar a migration**

Run: `pnpm --filter server migrate`
Expected: `Running migration: 0030_estoque_clinica.sql` seguido de `Migrations complete.`

- [ ] **Step 3: Verificar que as tabelas existem**

```bash
psql "$DATABASE_URL" -c "\dt est_*"
```

Expected: cinco linhas — `est_audit_log`, `est_locais`, `est_lotes`, `est_movimentos`, `est_produtos`.

- [ ] **Step 4: Verificar que o log é mesmo append-only**

```bash
psql "$DATABASE_URL" -c "insert into est_audit_log (entidade, acao, descricao, usuario) values ('teste','teste','teste','teste');"
psql "$DATABASE_URL" -c "delete from est_audit_log where entidade = 'teste';"
```

Expected: o `insert` responde `INSERT 0 1`; o `delete` falha com `ERROR: est_audit_log é append-only: UPDATE/DELETE não são permitidos.`

A linha de teste fica lá para sempre — é o comportamento correto e o preço de testar isto.

- [ ] **Step 5: Fechar o buraco do TRUNCATE e travar saldos negativos**

O trigger da 0030 é `for each row`, e **`TRUNCATE` não dispara trigger de linha** — o log
inteiro podia ser zerado sem erro. Verificado empiricamente no banco.

Create `apps/server/migrations/0031_estoque_integridade.sql`:

```sql
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
```

Run: `pnpm --filter server migrate`
Expected: `Running migration: 0031_estoque_integridade.sql` seguido de `Migrations complete.`

- [ ] **Step 6: Provar que o TRUNCATE agora falha**

```bash
psql "$DATABASE_URL" -c "begin; truncate est_audit_log; rollback;"
```

Expected: falha com `ERROR: est_audit_log é append-only: UPDATE/DELETE não são permitidos.`

Se passar sem erro, o trigger de statement não foi criado — confira o `before truncate`.

- [ ] **Step 7: Conferir as constraints**

```bash
psql "$DATABASE_URL" -tAc "select conname from pg_constraint where conrelid = 'est_lotes'::regclass and contype = 'c' order by conname;"
```

Expected: inclui `est_lotes_conferencia_tem_motivo`, `est_lotes_descarte_completo` e
`est_lotes_quantidade_nao_negativa`.

- [ ] **Step 8: Commit**

```bash
git add apps/server/migrations/0030_estoque_clinica.sql apps/server/migrations/0031_estoque_integridade.sql
git commit -m "feat(estoque): esquema produto/lote/local/movimento com log append-only"
```

---

### Task 5: Leitor da planilha

Transforma o `.xlsx` em linhas tipadas. Sem banco, sem regra de negócio — só leitura fiel, incluindo as células estranhas.

**Files:**
- Modify: `apps/server/package.json`
- Create: `apps/server/src/estoque/planilha.ts`
- Create: `apps/server/src/estoque/planilha.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `type LinhaPlanilha = { categoria: string; nome: string; marca: string; lote: string; situacao: string; local: string; quantidade: number | null; unidade: string; validade: Date | null; eliminado: boolean; origem: string; observacoes: string }` — repare que `quantidade` é `number | null`: célula vazia significa falta de informação e é diferente de zero. A Task 6 depende dessa distinção.
  - `parseQuantidade(bruto: string): { valor: number | null; unidade: string }`
  - `parseValidadeSerial(bruto: string | number | null): Date | null`
  - `lerPlanilha(caminho: string): Promise<LinhaPlanilha[]>`

- [ ] **Step 1: Instalar o leitor de xlsx**

```bash
pnpm --filter server add -D exceljs@^4.4.0
```

ExcelJS é MIT e lê `.xlsx` sem dependência nativa. Fica em `devDependencies` porque a importação é um script pontual, não roda em produção.

- [ ] **Step 2: Escrever o teste que falha**

Create `apps/server/src/estoque/planilha.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseQuantidade, parseValidadeSerial } from "./planilha.js";

const iso = (x: Date | null) =>
  x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}` : null;

describe("parseQuantidade", () => {
  it("lê número simples", () => {
    expect(parseQuantidade("13")).toEqual({ valor: 13, unidade: "un." });
  });

  it("lê zero como zero, não como ausente", () => {
    expect(parseQuantidade("0")).toEqual({ valor: 0, unidade: "un." });
  });

  it("lê caixas", () => {
    expect(parseQuantidade("4cx")).toEqual({ valor: 4, unidade: "cx" });
  });

  it("lê pacote com total de unidades", () => {
    expect(parseQuantidade("20pc - 2000u")).toEqual({ valor: 20, unidade: "pc - 2000u" });
  });

  it("lê caixa zerada", () => {
    expect(parseQuantidade("0cx")).toEqual({ valor: 0, unidade: "cx" });
  });

  it("célula vazia devolve nulo — é falta de informação, não zero", () => {
    expect(parseQuantidade("")).toEqual({ valor: null, unidade: "un." });
    expect(parseQuantidade("   ")).toEqual({ valor: null, unidade: "un." });
  });
});

describe("parseValidadeSerial", () => {
  it("converte serial do Excel em data local", () => {
    expect(iso(parseValidadeSerial(46023))).toBe("2026-01-01");
  });

  it("preserva validade implausível em vez de descartar", () => {
    expect(iso(parseValidadeSerial(54789))).toBe("2050-01-01");
  });

  it("célula vazia devolve nulo", () => {
    expect(parseValidadeSerial("")).toBeNull();
    expect(parseValidadeSerial(null)).toBeNull();
  });

  it("aceita Date já convertida pelo ExcelJS", () => {
    expect(iso(parseValidadeSerial(new Date(2027, 2, 1) as unknown as number))).toBe("2027-03-01");
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `pnpm test planilha`
Expected: FAIL — `Cannot find module './planilha.js'`

- [ ] **Step 4: Escrever a implementação**

Create `apps/server/src/estoque/planilha.ts`:

```ts
import ExcelJS from "exceljs";

export type LinhaPlanilha = {
  categoria: string;
  nome: string;
  marca: string;
  lote: string;
  situacao: string;
  local: string;
  quantidade: number | null;
  unidade: string;
  validade: Date | null;
  eliminado: boolean;
  origem: string;
  observacoes: string;
};

// A coluna "Unidade" da planilha mistura contagem e embalagem numa string só:
// "13", "4cx", "20pc - 2000u", "0cx". O número da frente é a contagem; o resto
// é a descrição da embalagem. Célula vazia é falta de informação, NÃO zero —
// os dois casos existem na planilha e significam coisas diferentes.
export function parseQuantidade(bruto: string): { valor: number | null; unidade: string } {
  const s = (bruto ?? "").trim();
  if (!s) return { valor: null, unidade: "un." };
  const m = s.match(/^(\d+)\s*(.*)$/);
  if (!m) return { valor: null, unidade: "un." };
  const resto = m[2].trim();
  return { valor: Number(m[1]), unidade: resto || "un." };
}

// Excel conta dias desde 30/12/1899. Construímos a data com componentes locais
// para não cair no bug de fuso: new Date(serial * 86400000) daria o dia anterior
// em UTC-3.
const EPOCH_EXCEL = Date.UTC(1899, 11, 30);

export function parseValidadeSerial(bruto: string | number | Date | null): Date | null {
  if (bruto === null || bruto === undefined || bruto === "") return null;
  if (bruto instanceof Date) {
    return new Date(bruto.getFullYear(), bruto.getMonth(), bruto.getDate());
  }
  const n = Number(bruto);
  if (!Number.isFinite(n)) return null;
  const utc = new Date(EPOCH_EXCEL + n * 86_400_000);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

const COLUNAS = {
  categoria: 1, nome: 2, marca: 3, lote: 4, situacao: 5, local: 6,
  unidade: 7, validade: 8, eliminado: 16, origem: 17,
} as const;

const texto = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text).trim();
  return String(v).trim();
};

export async function lerPlanilha(caminho: string): Promise<LinhaPlanilha[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const ws = wb.getWorksheet("ESTOQUE COMPLETO");
  if (!ws) throw new Error('A aba "ESTOQUE COMPLETO" não existe nesse arquivo.');

  const linhas: LinhaPlanilha[] = [];
  ws.eachRow((row, numero) => {
    if (numero === 1) return; // cabeçalho
    const nome = texto(row.getCell(COLUNAS.nome).value);
    if (!nome) return;
    const q = parseQuantidade(texto(row.getCell(COLUNAS.unidade).value));
    linhas.push({
      categoria: texto(row.getCell(COLUNAS.categoria).value),
      nome,
      marca: texto(row.getCell(COLUNAS.marca).value),
      lote: texto(row.getCell(COLUNAS.lote).value),
      situacao: texto(row.getCell(COLUNAS.situacao).value).toLowerCase(),
      local: texto(row.getCell(COLUNAS.local).value),
      quantidade: q.valor,
      unidade: q.unidade,
      validade: parseValidadeSerial(row.getCell(COLUNAS.validade).value as string | number | Date | null),
      eliminado: texto(row.getCell(COLUNAS.eliminado).value) === "1",
      origem: texto(row.getCell(COLUNAS.origem).value),
      observacoes: "",
    });
  });
  return linhas;
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `pnpm test planilha`
Expected: PASS — 10 testes

- [ ] **Step 6: Conferir contra o arquivo real**

```bash
pnpm --filter server exec tsx -e "
import { lerPlanilha } from './src/estoque/planilha.js';
const l = await lerPlanilha(process.env.HOME + '/Downloads/Estoque Consolidado - Clínica Escola de Odontologia.xlsx');
console.log('linhas:', l.length);
console.log('com quantidade nula:', l.filter(x => x.quantidade === null).length);
console.log('eliminados:', l.filter(x => x.eliminado).length);
console.log('sem validade:', l.filter(x => !x.validade).length);
"
```

Expected: `linhas: 388`, `com quantidade nula: 2`, `eliminados: 47`, `sem validade: 30`.

Se `linhas` vier 0, confira o nome da aba; se as colunas vierem trocadas, confira `COLUNAS` contra o cabeçalho real.

- [ ] **Step 7: Commit**

```bash
git add apps/server/package.json pnpm-lock.yaml apps/server/src/estoque/planilha.ts apps/server/src/estoque/planilha.test.ts
git commit -m "feat(estoque): leitor da planilha consolidada"
```

---

### Task 6: Plano de importação

Função pura que decide tudo — quais produtos existem, quais lotes ficam ativos, quem leva `!`, quais grafias podem ser fundidas — sem tocar no banco. É onde mora a regra que recusa juntar resina EA1 com EA2.

**Files:**
- Create: `apps/server/src/estoque/importPlan.ts`
- Create: `apps/server/src/estoque/importPlan.test.ts`

**Interfaces:**
- Consumes: `norm` (Task 2), `usarAte`/`classificar` (Task 3), `LinhaPlanilha` (Task 5)
- Produces:
  - `type ProdutoPlanejado = { nomeNorm: string; marcaNorm: string; nome: string; marca: string; especialidade: string; grafias: string[] }`
  - `type LotePlanejado = { chaveProduto: string; lote: string; validade: Date | null; usarAte: Date | null; usarAteMotivo: string | null; local: string; quantidade: number; unidade: string; situacao: string | null; ativo: boolean; precisaConferencia: boolean; conferenciaMotivo: string[]; origem: string }`
  - `type PlanoImportacao = { produtos: ProdutoPlanejado[]; lotes: LotePlanejado[]; locais: string[]; resumo: ResumoImportacao }`
  - `type ResumoImportacao = { linhas: number; produtos: number; lotes: number; ativos: number; inativos: number; conferencia: number; vencidosComSaldo: number; prazoPassouComSaldo: number; armadilhas: number; fusoes: Array<{ de: string[]; para: string }> }`
  - `planImport(linhas: LinhaPlanilha[], hoje: Date): PlanoImportacao`
  - `ESPECIALIDADES: Record<string, string>`

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/server/src/estoque/importPlan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planImport } from "./importPlan.js";
import type { LinhaPlanilha } from "./planilha.js";

const HOJE = new Date(2026, 7, 10);

const linha = (over: Partial<LinhaPlanilha> = {}): LinhaPlanilha => ({
  categoria: "Material De Endodontia",
  nome: "Gutapercha Ponta",
  marca: "Dentsply Sirona",
  lote: "384480",
  situacao: "fechado",
  local: "Prateleira IV - Caixa Endodontia",
  quantidade: 3,
  unidade: "un.",
  validade: new Date(2027, 5, 1),
  eliminado: false,
  origem: "LEVANTAMENTO",
  observacoes: "",
  ...over,
});

describe("planImport — especialidades", () => {
  it("junta as grafias de dentística num só nome", () => {
    const p = planImport(
      [
        linha({ categoria: "Material De dentística", nome: "A" }),
        linha({ categoria: "Material de denstística ", nome: "B" }),
      ],
      HOJE,
    );
    expect(p.produtos.map((x) => x.especialidade)).toEqual(["Dentística", "Dentística"]);
  });

  it("junta as grafias de endodontia", () => {
    const p = planImport(
      [
        linha({ categoria: "Material De Endodontia", nome: "A" }),
        linha({ categoria: "Material De endodontia", nome: "B" }),
      ],
      HOJE,
    );
    expect(new Set(p.produtos.map((x) => x.especialidade))).toEqual(new Set(["Endodontia"]));
  });
});

describe("planImport — fusão de produtos", () => {
  it("funde grafias que só diferem em caixa e acento", () => {
    const p = planImport(
      [
        linha({ nome: "Ácido fosfórico 37%", marca: "SSWHITE", lote: "1" }),
        linha({ nome: "Acido fosforico 37%", marca: "SSWHITE", lote: "2" }),
      ],
      HOJE,
    );
    expect(p.produtos).toHaveLength(1);
    expect(p.lotes).toHaveLength(2);
    expect(p.resumo.fusoes).toHaveLength(1);
  });

  it("funde marcas que só diferem em caixa", () => {
    const p = planImport(
      [
        linha({ nome: "Maxxion", marca: "FMG", lote: "1" }),
        linha({ nome: "Maxxion", marca: "Fmg", lote: "2" }),
      ],
      HOJE,
    );
    expect(p.produtos).toHaveLength(1);
  });

  it("NUNCA funde produtos que diferem no sufixo de cor", () => {
    const p = planImport(
      [
        linha({ nome: "Resina LISS - EA1", marca: "FGM", lote: "1" }),
        linha({ nome: "Resina LISS - EA2", marca: "FGM", lote: "2" }),
      ],
      HOJE,
    );
    expect(p.produtos).toHaveLength(2);
    expect(p.resumo.fusoes).toHaveLength(0);
  });

  it("NUNCA funde limas de calibres diferentes", () => {
    const p = planImport(
      [
        linha({ nome: "Protaper Universal - F2", lote: "1" }),
        linha({ nome: "Protaper Universal - F4", lote: "2" }),
      ],
      HOJE,
    );
    expect(p.produtos).toHaveLength(2);
  });
});

describe("planImport — ativo contra inativo", () => {
  it("saldo positivo e não eliminado fica ativo", () => {
    expect(planImport([linha({ quantidade: 3 })], HOJE).lotes[0].ativo).toBe(true);
  });

  it("saldo zero fica inativo mas é preservado", () => {
    const p = planImport([linha({ quantidade: 0 })], HOJE);
    expect(p.lotes).toHaveLength(1);
    expect(p.lotes[0].ativo).toBe(false);
  });

  it("eliminado fica inativo mas é preservado", () => {
    const p = planImport([linha({ quantidade: 5, eliminado: true })], HOJE);
    expect(p.lotes).toHaveLength(1);
    expect(p.lotes[0].ativo).toBe(false);
  });
});

describe("planImport — marcação de conferência", () => {
  it("marca sem local", () => {
    const l = planImport([linha({ local: "" })], HOJE).lotes[0];
    expect(l.precisaConferencia).toBe(true);
    expect(l.conferenciaMotivo).toContain("sem local");
  });

  it("marca sem quantidade", () => {
    const l = planImport([linha({ quantidade: null })], HOJE).lotes[0];
    expect(l.conferenciaMotivo).toContain("sem quantidade");
  });

  it("marca validade implausível SEM alterá-la", () => {
    const l = planImport([linha({ validade: new Date(2050, 0, 1) })], HOJE).lotes[0];
    expect(l.conferenciaMotivo).toContain("validade implausível");
    expect(l.validade?.getFullYear()).toBe(2050);
  });

  it("marca sem validade quando há saldo", () => {
    const l = planImport([linha({ validade: null, quantidade: 4 })], HOJE).lotes[0];
    expect(l.conferenciaMotivo).toContain("sem validade");
  });

  it("acumula vários motivos na mesma linha", () => {
    const l = planImport([linha({ local: "", validade: null, quantidade: 4 })], HOJE).lotes[0];
    expect(l.conferenciaMotivo).toHaveLength(2);
  });
});

describe("planImport — prazo real", () => {
  it("calcula usarAte recuando para antes do recesso", () => {
    const l = planImport([linha({ validade: new Date(2026, 11, 22) })], HOJE).lotes[0];
    expect(l.usarAte?.getMonth()).toBe(10);
    expect(l.usarAte?.getDate()).toBe(30);
    expect(l.usarAteMotivo).toBe("recesso_fim_ano");
  });

  it("não recua quando a validade cai em período letivo", () => {
    const l = planImport([linha({ validade: new Date(2027, 5, 1) })], HOJE).lotes[0];
    expect(l.usarAteMotivo).toBe("validade");
  });

  it("lote sem validade não tem prazo real", () => {
    const l = planImport([linha({ validade: null })], HOJE).lotes[0];
    expect(l.usarAte).toBeNull();
  });
});

describe("planImport — resumo", () => {
  it("conta vencidos com saldo separadamente", () => {
    const p = planImport(
      [
        linha({ validade: new Date(2026, 6, 1), quantidade: 5 }),
        linha({ validade: new Date(2026, 6, 1), quantidade: 0, lote: "z" }),
      ],
      HOJE,
    );
    expect(p.resumo.vencidosComSaldo).toBe(1);
  });

  it("nao mistura vencido com prazo morto no recesso", () => {
    // 05/08/2026: rotulo ainda valido, mas o prazo util morreu em 29/07.
    const p = planImport([linha({ validade: new Date(2026, 7, 5), quantidade: 5 })], new Date(2026, 7, 3));
    expect(p.resumo.vencidosComSaldo).toBe(0);
    expect(p.resumo.prazoPassouComSaldo).toBe(1);
  });

  it("coleta os locais distintos", () => {
    const p = planImport(
      [linha({ local: "Sala A" }), linha({ local: "Sala B", lote: "2" }), linha({ local: "Sala A", lote: "3" })],
      HOJE,
    );
    expect(p.locais.sort()).toEqual(["Sala A", "Sala B"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm test importPlan`
Expected: FAIL — `Cannot find module './importPlan.js'`

- [ ] **Step 3: Escrever a implementação**

Create `apps/server/src/estoque/importPlan.ts`:

```ts
import { norm } from "./norm.js";
import { usarAte, classificar, CALENDARIO_PADRAO } from "./recesso.js";
import type { LinhaPlanilha } from "./planilha.js";

export type ProdutoPlanejado = {
  nomeNorm: string;
  marcaNorm: string;
  nome: string;
  marca: string;
  especialidade: string;
  grafias: string[];
};

export type LotePlanejado = {
  chaveProduto: string;
  lote: string;
  validade: Date | null;
  usarAte: Date | null;
  usarAteMotivo: string | null;
  local: string;
  quantidade: number;
  unidade: string;
  situacao: string | null;
  ativo: boolean;
  precisaConferencia: boolean;
  conferenciaMotivo: string[];
  origem: string;
};

export type ResumoImportacao = {
  linhas: number;
  produtos: number;
  lotes: number;
  ativos: number;
  inativos: number;
  conferencia: number;
  vencidosComSaldo: number;
  prazoPassouComSaldo: number;
  armadilhas: number;
  fusoes: Array<{ de: string[]; para: string }>;
};

export type PlanoImportacao = {
  produtos: ProdutoPlanejado[];
  lotes: LotePlanejado[];
  locais: string[];
  resumo: ResumoImportacao;
};

// As 12 grafias da planilha viram 10 especialidades. "denstística" é typo de
// "dentística" — a única fusão aqui que não é só caixa/acento, e por isso está
// escrita à mão em vez de sair de norm().
export const ESPECIALIDADES: Record<string, string> = {
  materialanestesico: "Anestésico",
  materialdecirurgia: "Cirurgia",
  materialdedentistica: "Dentística",
  materialdedenstistica: "Dentística",
  materialdeendodontia: "Endodontia",
  materialdeesterilizacao: "Esterilização",
  materialdelimpeza: "Limpeza",
  materialdeprevencao: "Prevenção",
  materialdeprotecao: "Proteção",
  materialdeprotese: "Prótese",
  materialdeusogeral: "Uso geral",
};

const ANO_IMPLAUSIVEL = 2035;

export function planImport(linhas: LinhaPlanilha[], hoje: Date): PlanoImportacao {
  const produtos = new Map<string, ProdutoPlanejado>();
  const lotes: LotePlanejado[] = [];
  const locais = new Set<string>();

  for (const l of linhas) {
    const nomeNorm = norm(l.nome);
    const marcaNorm = norm(l.marca);
    const chave = `${nomeNorm}|${marcaNorm}`;

    if (!produtos.has(chave)) {
      produtos.set(chave, {
        nomeNorm,
        marcaNorm,
        nome: l.nome,
        marca: l.marca,
        especialidade: ESPECIALIDADES[norm(l.categoria)] ?? "Uso geral",
        grafias: [],
      });
    }
    const p = produtos.get(chave)!;
    const grafia = `${l.nome} / ${l.marca}`;
    if (!p.grafias.includes(grafia)) p.grafias.push(grafia);

    if (l.local) locais.add(l.local);

    const motivos: string[] = [];
    if (!l.local) motivos.push("sem local");
    if (l.quantidade === null) motivos.push("sem quantidade");
    if (l.validade && l.validade.getFullYear() > ANO_IMPLAUSIVEL) motivos.push("validade implausível");
    const qtd = l.quantidade ?? 0;
    if (!l.validade && qtd > 0) motivos.push("sem validade");

    const r = l.validade ? usarAte(l.validade, CALENDARIO_PADRAO) : null;

    lotes.push({
      chaveProduto: chave,
      lote: l.lote,
      validade: l.validade,
      usarAte: r ? r.data : null,
      usarAteMotivo: r ? r.motivo : null,
      local: l.local,
      quantidade: qtd,
      unidade: l.unidade,
      situacao: l.situacao === "aberto" || l.situacao === "fechado" ? l.situacao : null,
      ativo: qtd > 0 && !l.eliminado,
      precisaConferencia: motivos.length > 0,
      conferenciaMotivo: motivos,
      origem: l.origem || "manual",
    });
  }

  const fusoes = [...produtos.values()]
    .filter((p) => p.grafias.length > 1)
    .map((p) => ({ de: p.grafias, para: `${p.nome} / ${p.marca}` }));

  const ativos = lotes.filter((x) => x.ativo);

  return {
    produtos: [...produtos.values()],
    lotes,
    locais: [...locais],
    resumo: {
      linhas: linhas.length,
      produtos: produtos.size,
      lotes: lotes.length,
      ativos: ativos.length,
      inativos: lotes.length - ativos.length,
      conferencia: lotes.filter((x) => x.precisaConferencia).length,
      vencidosComSaldo: ativos.filter(
        (x) => x.validade && classificar(x.validade, hoje) === "vencido",
      ).length,
      prazoPassouComSaldo: ativos.filter(
        (x) => x.validade && classificar(x.validade, hoje) === "prazo_passou",
      ).length,
      armadilhas: ativos.filter(
        (x) => x.validade && classificar(x.validade, hoje) === "armadilha",
      ).length,
      fusoes,
    },
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test importPlan`
Expected: PASS — 20 testes

- [ ] **Step 5: Conferir contra a planilha real**

```bash
pnpm --filter server exec tsx -e "
import { lerPlanilha } from './src/estoque/planilha.js';
import { planImport } from './src/estoque/importPlan.js';
const l = await lerPlanilha(process.env.HOME + '/Downloads/Estoque Consolidado - Clínica Escola de Odontologia.xlsx');
console.log(planImport(l, new Date(2026, 7, 10)).resumo);
"
```

Expected: `linhas: 388`, `ativos: 215`, `inativos: 173`, `conferencia: 39`, `vencidosComSaldo: 9`, `prazoPassouComSaldo: 0`, `armadilhas: 54`, e `produtos` entre 286 e 289.

`prazoPassouComSaldo` dá 0 hoje — foi medido nos dados reais. Não é sinal de que o
contador está quebrado: nenhum lote está, neste momento, com o rótulo válido e o prazo
útil já morto. Se der diferente de 0, investigue antes de seguir.

O número exato de produtos é a saída canônica desta função — anote o valor obtido, porque é ele que a interface vai mostrar como "produtos no catálogo".

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/estoque/importPlan.ts apps/server/src/estoque/importPlan.test.ts
git commit -m "feat(estoque): plano de importacao com fusao segura de grafias"
```

---

### Task 7: Gravar e relatar

Aplica o plano no banco e imprime o relatório de conferência.

**Files:**
- Create: `apps/server/src/estoque/applyImport.ts`
- Create: `apps/server/src/estoque/importar.ts`
- Modify: `apps/server/package.json`

**Interfaces:**
- Consumes: `PlanoImportacao` (Task 6), `pool` (`../db/pool.js`), tabelas da Task 4
- Produces: `applyImport(plano: PlanoImportacao, usuario: string): Promise<ResumoImportacao>`, comando `pnpm --filter server importar:estoque -- <caminho>`

- [ ] **Step 1: Escrever a gravação**

Create `apps/server/src/estoque/applyImport.ts`:

```ts
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
            unidade, situacao, precisa_conferencia, conferencia_motivo, origem)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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
```

- [ ] **Step 2: Escrever o comando**

Create `apps/server/src/estoque/importar.ts`:

```ts
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

console.log(`
Nenhum lote e nenhuma validade foram alterados.
`);

await pool.end();
```

- [ ] **Step 3: Registrar o script**

Modify `apps/server/package.json`, dentro de `"scripts"`, após `"migrate"`:

```json
    "migrate": "tsx src/db/migrate.ts",
    "importar:estoque": "tsx src/estoque/importar.ts"
```

- [ ] **Step 4: Rodar a importação de verdade**

```bash
pnpm --filter server importar:estoque -- "$HOME/Downloads/Estoque Consolidado - Clínica Escola de Odontologia.xlsx"
```

Expected: o relatório com `Linhas lidas: 388`, `ativos: 215`, `inativos: 173`, `Vencidos ainda com saldo físico: 9`, `Armadilhas de recesso: 54`, `Marcados para conferência: 39`.

- [ ] **Step 5: Conferir o banco**

```bash
psql "$DATABASE_URL" -c "
select count(*) filter (where quantidade > 0) as ativos,
       count(*) filter (where quantidade = 0) as zerados,
       count(*) filter (where precisa_conferencia) as a_conferir,
       count(*) filter (where usar_ate < validade) as armadilhas,
       count(*) as total
from est_lotes;"
```

Expected: `total` 388, `a_conferir` 39, `armadilhas` 54.

- [ ] **Step 6: Conferir que nenhuma validade foi mexida**

```bash
psql "$DATABASE_URL" -c "
select p.nome, l.lote, l.validade
from est_lotes l join est_produtos p on p.id = l.produto_id
where extract(year from l.validade) > 2035 order by l.validade;"
```

Expected: 7 linhas, com as validades de 2036, 2050 (cinco) e 2051 intactas.

- [ ] **Step 7: Rodar a suíte inteira**

Run: `pnpm test`
Expected: PASS — 57 testes (8 de `norm`, 19 de `recesso`, 10 de `planilha`, 20 de `importPlan`), nenhum falhando

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/estoque/applyImport.ts apps/server/src/estoque/importar.ts apps/server/package.json
git commit -m "feat(estoque): importador da planilha com relatorio de conferencia"
```

---

## Entregável deste plano

Ao fim das 7 tarefas: os 388 lotes estão no Postgres com produto, local e prazo real
calculados; 39 estão marcados para conferência; nenhum lote e nenhuma validade foram
alterados; e `pnpm test` prova que o motor de recesso acerta as bordas do calendário.

Nada disso tem tela ainda — isso é o Plano B.

## Planos seguintes

- **Plano B — API e interface**: rotas de leitura e movimento, telas (segmentos, card
  flutuante, filtros, busca com correção), leitor de código com ZXing e GS1, etiquetas QR,
  impressão A4.
- **Plano C — offline e assistência**: IndexedDB, fila de sincronia, last-write-wins por
  campo, divergência de validade, e o revisor (regras determinísticas + Qwen2.5 local).

## Pendências herdadas do spec

- `~/Desktop/CODE` ainda não é repositório git — todos os `git commit` deste plano
  dependem de um `git init` prévio.
- O certificado TLS do Tailscale só vira bloqueio no Plano B (câmera exige contexto
  seguro), mas vale resolver antes.
