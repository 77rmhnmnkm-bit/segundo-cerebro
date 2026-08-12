# Estoque — agrupamento por conhecimento clínico e expansão em linha

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development ou superpowers:executing-plans.

**Goal:** Parar de mandar comprar material que já existe sob outro nome, agrupando produtos por **substância e substrato clínico** (não por semelhança de texto), e trocar o card sobreposto por uma expansão em linha que empurra o conteúdo, com animação boa.

**Architecture:** O agrupamento nasce de uma classificação feita **uma vez** pelo modelo local (`qwen2.5:7b-instruct` via Ollama), **persistida** no Postgres como *proposta* e **confirmada pelo Ricardo** na interface. Em tempo de uso nada chama a IA — o app lê colunas do banco, então o agrupamento funciona com o Mac desligado. A interface troca sobreposição por expansão: o detalhe abre logo abaixo do item e empurra o resto.

**Tech Stack:** Postgres, Fastify, Ollama (qwen2.5:7b-instruct, local e grátis), React 18, Vitest.

## Global Constraints

- **Semelhança de texto não decide agrupamento clínico.** `Ácido fluorídrico` condiciona porcelana; `ácido fosfórico` condiciona esmalte e dentina. Agrupar os dois faria o usuário aplicar o ácido errado no paciente. A tentativa anterior de agrupar por "duas primeiras palavras significativas" foi descartada por isso — está no stash `agrupamento por heuristica de texto`.
- **A IA propõe, o Ricardo confirma, o banco guarda.** Nenhum grupo vale antes de `grupo_confirmado = true`. Produto não confirmado aparece sozinho, nunca fundido.
- **Runtime nunca chama a IA.** Toda leitura sai de colunas persistidas. O modelo só roda no comando de classificação, sob demanda.
- **O modelo local não pesquisa na web** — responde pelo treino. Toda proposta carrega `confianca` e fica visível para conferência. Nunca apresentar proposta de IA como fato.
- **Nenhum produto ou lote é apagado ou renomeado** pelo agrupamento. Agrupar é só uma leitura por cima; os registros originais ficam intactos.
- `ativo` é coluna gerada no banco (`quantidade > 0 and not eliminado_na_origem`). Nunca escrever `quantidade > 0` numa query.
- Nunca `date.toISOString().slice(0,10)` — UTC-3 rola para o dia errado.
- `position: fixed` quebra dentro de ancestral com `backdrop-filter`. Aqui isso deixa de importar para o detalhe (que passa a ser em fluxo), mas continua valendo para modais: `createPortal(..., document.body)`.
- Imports relativos no server terminam em `.js`. O server não importa valores de `@app/core` em runtime.
- Tudo em português. Funciona em 375px sem estouro horizontal.

**Estado ao começar:** 388 lotes, 288 produtos, 215 ativos, 90 testes, build limpo, HEAD `7f91723`.

---

### Task 1: Expansão em linha e ícones padronizados

Puramente de interface, sem tocar em dados. É o que o Ricardo vê primeiro.

**Files:**
- Modify: `apps/web/src/estoque/EstoqueScreen.tsx`
- Modify: `apps/web/src/estoque/LoteRow.tsx`
- Modify/Delete: `apps/web/src/estoque/LoteCard.tsx` (deixa de flutuar; vira painel em fluxo)
- Modify: `apps/web/src/estoque/PillSegmented.tsx`

**O que muda:**

1. **O detalhe deixa de sobrepor.** Hoje ele flutua por cima e cobre outras linhas. Passa a abrir **logo abaixo da linha sob o cursor**, empurrando as linhas seguintes para baixo. Nada de conteúdo coberto.

2. **A animação da expansão precisa ser bonita.** Anime a altura (via `grid-template-rows: 0fr → 1fr`, que anima suave sem `max-height` chutado) junto com opacidade e um leve deslocamento vertical do conteúdo, em `cubic-bezier(.32,.72,0,1)`, ~220ms. O conteúdo interno entra levemente depois da altura, para não parecer que salta. Respeite `prefers-reduced-motion`: sem movimento, só troca de estado.

3. **Só um item expandido por vez.** Abrir outro fecha o anterior, e as duas transições acontecem juntas.

4. **Modo Ícones: todos os blocos com o mesmo tamanho.** Hoje variam. Fixe a altura do bloco e trunque nome longo em duas linhas com reticências. A expansão em Ícones abre **na mesma coluna do bloco clicado**, ocupando a largura inteira da grade logo abaixo daquela fileira, empurrando as fileiras seguintes — o mesmo gesto da lista, adaptado à grade.

5. **Selo do segmento encavalado.** No segmento ativo, a pílula corta o número. Dê respiro entre rótulo e selo e garanta que a pílula cubra os dois, nos três segmentos (larguras diferentes).

**Verificação:** screenshots de lista expandida e de ícones expandido, em claro e escuro, e em 375px. Confirme que nenhuma linha fica coberta e que os blocos de ícone têm todos a mesma altura. `pnpm test` (90) e `pnpm build` (0).

---

### Task 2: Classificação clínica pelo modelo local

**Files:**
- Create: `apps/server/migrations/0034_estoque_classificacao.sql`
- Create: `apps/server/src/estoque/classificar.ts`
- Create: `apps/server/src/estoque/classificar.test.ts`
- Create: `apps/server/src/estoque/classificarCli.ts`
- Modify: `apps/server/package.json`

**Esquema:**

```sql
alter table est_produtos
  add column if not exists substancia text,
  add column if not exists funcao text,
  add column if not exists substrato text,
  add column if not exists classificacao_confianca numeric,
  add column if not exists classificacao_origem text,
  add column if not exists classificado_em timestamptz,
  add column if not exists grupo_confirmado boolean not null default false;

create index if not exists est_produtos_grupo_idx
  on est_produtos (substancia, substrato) where grupo_confirmado;
```

`substrato` é vocabulário fechado: `esmalte`, `dentina`, `esmalte_dentina`, `porcelana`, `metal`, `resina`, `mucosa`, `canal`, `osso`, `instrumento`, `nenhum`. `substancia` é livre mas normalizada em minúsculas.

**A função pura a testar** é o *parser* da resposta do modelo, não o modelo:

```
interpretarResposta(bruto: string): { substancia, funcao, substrato, confianca } | { erro }
```

Testes: JSON válido; JSON com cercas ```` ```json ````; substrato fora do vocabulário → erro; confiança fora de 0–1 → erro; texto sem JSON → erro. **Nunca aceitar substrato inventado** — se o modelo devolver algo fora da lista, a proposta é recusada e o produto fica sem classificação, e não com classificação errada.

**O prompt** precisa deixar explícito que a distinção importa clinicamente, dar o vocabulário fechado, pedir JSON puro e pedir confiança baixa quando não souber. Exemplo do que precisa acertar: ácido fosfórico → substrato `esmalte_dentina`; ácido fluorídrico → `porcelana`. Esses dois casos entram como verificação manual obrigatória depois de rodar.

**O comando** `pnpm --filter server classificar:estoque` percorre os produtos sem classificação, um por um (7B local, sem paralelismo agressivo), grava a proposta com `classificacao_origem = 'qwen2.5:7b-instruct'` e `grupo_confirmado = false`, e imprime relatório: quantos classificados, quantos recusados por resposta inválida, e a distribuição por substrato. Se o Ollama não responder, falha com mensagem clara em português e **não** grava nada.

**Verificação obrigatória:** rode de verdade e confira à mão os dois ácidos e mais 8 produtos que você escolher, comparando com o que o rótulo diz. Relate quantos o modelo errou — esse número é a informação mais importante da tarefa, e não pode ser omitido.

---

### Task 3: Grupos na interface, com confirmação

**Files:**
- Modify: `apps/server/src/routes/estoque.ts`
- Modify: `packages/core/src/estoque.ts`
- Create: `apps/web/src/estoque/GrupoRow.tsx`
- Modify: `apps/web/src/estoque/EstoqueScreen.tsx`
- Modify: `apps/web/src/api.ts`

**Regra do agrupamento:** produtos com **mesma `substancia` e mesmo `substrato`** e `grupo_confirmado = true` formam um grupo. Produto não confirmado **nunca** entra em grupo — aparece sozinho.

**`GET /estoque/comprar`** devolve grupos; um grupo só entra se o saldo somado de **todas** as variantes for zero. É isto que faz o ácido fluorídrico sumir da lista quando existem 5 unidades sob nome mais longo.

Ao expandir um grupo, mostre duas seções:
- **Temos hoje** — as marcas com saldo ativo, com quantidade e local.
- **Já tivemos** — as marcas com histórico e saldo zero, para ele saber o que já passou por ali.

**Confirmação:** cada grupo proposto mas não confirmado aparece com marca visual de proposta e dois botões — confirmar o grupo, ou separar. Confirmar grava `grupo_confirmado = true` nos produtos e registra em `est_audit_log`. Separar mantém os produtos soltos. Enquanto não confirmado, o agrupamento **não** afeta a lista de compras.

**Verificação:** meça quantos grupos surgem, quantos produtos saem da lista de compras por terem estoque sob outro nome, e liste-os. Confirme na tela que `Ácido fluorídrico` sai depois da confirmação e que `ácido fosfórico` e `ácido fluorídrico` **nunca** caem no mesmo grupo.

---

## Fora de escopo

- Busca na web para embasar a classificação. Exigiria ligar um buscador livre (SearXNG); hoje o modelo responde pelo treino, e é por isso que existe confirmação humana.
- Reclassificar automaticamente quando um produto novo é cadastrado — por ora o comando roda sob demanda.
