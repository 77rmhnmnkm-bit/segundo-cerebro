# Estoque da Clínica Escola de Odontologia — design

Data: 2026-08-10
Autor: Ricardo Augusto de Azevedo (decisões) + Claude (redação)
Status: aprovado, pronto para plano de implementação

## 1. Objetivo

Substituir a planilha `Estoque Consolidado - Clínica Escola de Odontologia.xlsx` por um
módulo do segundo-cérebro que roda no Mac e no iPhone, funciona sem rede, e cuja função
principal não é contar estoque — é **impedir que material morra no recesso da faculdade**.

O diferencial sobre qualquer software de estoque odontológico existente (Sowingo, Sortly,
MedRestock, Open Dental) é este: todos calculam "dias até vencer" cru. Nenhum sabe que a
clínica fecha três meses no fim do ano, e que por isso um lote que vence em janeiro está
morto desde 30 de novembro.

## 2. Onde vive

Módulo dentro do segundo-cérebro existente (`~/Desktop/CODE`), reconstruindo o `/estoque`
atual. Reaproveita:

- autenticação argon2 e sessão existentes;
- design system `packages/ui` (`glassSurface()`, tokens de tema, `AmbientBackground`);
- padrão de log append-only com trigger no Postgres, igual a `patient_audit_log`;
- impressão A4 via `window.print` já usada em receituário e prontuário.

Frontend `apps/web` (React/Vite), backend `apps/server` (Fastify + Postgres), tipos
compartilhados em `packages/core`.

## 3. Decisões travadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde vive | módulo do segundo-cérebro | reaproveita login, design, auditoria e impressão |
| iPhone | PWA instalada, offline total | o Mac dorme em casa; não pode falhar na Sala de Expurgo |
| Sincronia | iPhone ↔ Mac, Mac é o ponto de encontro | PWA não faz par-a-par; o servidor Fastify é o hub |
| Correção de digitação | algoritmo, não IA | precisa acertar 100% e responder offline em milissegundos |
| Assistente | Qwen2.5 local via Ollama | grátis, já instalado, nada sai da máquina |
| Lote e validade | nunca alterados automaticamente | pedido explícito do Ricardo |
| Itens zerados | preservados, nunca apagados | viram catálogo e lista de compras |

## 4. Modelo de dados

Dois níveis. Este é o ponto que a planilha não tinha e que resolve a lista de compras.

### 4.1 Produto

Identidade permanente de um material. Nunca é apagado, mesmo com saldo 0.

```
produtos
  id            uuid pk
  nome          text not null
  marca         text
  especialidade text not null          -- 10 valores, ver §6
  nome_norm     text not null          -- chave de deduplicação, ver §4.4
  marca_norm    text
  criado_em     timestamptz
  unique (nome_norm, marca_norm)
```

### 4.2 Lote

Uma remessa física com validade e local próprios. Pendurado num produto.

```
lotes
  id              uuid pk
  produto_id      uuid not null references produtos
  lote            text                 -- como veio, jamais normalizado
  validade        date                 -- como veio, jamais corrigida
  usar_ate        date                 -- calculado, ver §5
  usar_ate_motivo text                 -- 'validade' | 'recesso_fim_ano' | 'recesso_julho'
  local_id        uuid references locais
  quantidade      numeric not null default 0
  unidade         text                 -- 'un.', 'cx', 'pc'
  situacao        text                 -- 'aberto' | 'fechado'
  precisa_conferencia boolean default false   -- o "!"
  conferencia_motivo  text[]                  -- ['sem local','validade implausível']
  qr_id           uuid                 -- etiqueta impressa, ver §8
  descartado_em   timestamptz
  descarte_motivo text
  origem          text                 -- 'levantamento' | 'nf_737675' | 'controle' | 'manual'
```

`quantidade` é materializada para leitura rápida, mas a verdade é a soma dos movimentos
(§7). Um job de conferência recalcula e acusa divergência.

**Lote nunca é apagado, nem quando zera ou é descartado.** O registro fica completo —
lote, validade, local, quantidade final, motivo do descarte — por dois motivos:

1. **O leitor de código precisa resolver contra todos eles** (§8). Escanear a etiqueta de
   um pote antigo que voltou a ser abastecido tem que encontrar aquele lote, não criar um
   duplicado.
2. É o que alimenta a lista de compras e o rastro sanitário.

Mas **não vira tela para navegar**: os 173 lotes mortos não têm segmento próprio na
interface (§12). Ficam alcançáveis por busca, por escaneamento e pelo histórico do próprio
produto.

### 4.3 Local

As 30 strings soltas da planilha viram hierarquia de três níveis:
`sala › móvel › caixa`. Ex.: `Sala de Expurgo › Armário 02` e
`Prateleira IV › Caixa Endodontia`.

```
locais
  id        uuid pk
  pai_id    uuid references locais
  nome      text not null
  nivel     text        -- 'sala' | 'movel' | 'caixa'
```

### 4.4 Normalização — regra única

Server e cliente **precisam** usar exatamente esta função, senão o catálogo dá números
diferentes em tela e em relatório (aconteceu na prototipagem: 286 contra 288).

```
norm(s) = s
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .replace(/[^a-z0-9]/g, "")      // remove, NÃO substitui por espaço
```

Mora em `packages/core` como fonte da verdade, mas o server **não** a importa de lá: o
gotcha já documentado do monorepo é que `@app/core` resolve como CommonJS sob tsx/node-ESM,
e importar um valor em runtime quebra o servidor (`does not provide an export named…`).
Só `import type` funciona. Então a função é duplicada num módulo local do server
(`apps/server/src/estoque/norm.ts`), com um teste de contrato que roda a mesma bateria de
casos nos dois lados e falha se divergirem. O frontend (Vite) importa de `@app/core`
normalmente.

## 5. Motor de validade — o núcleo

### 5.1 Calendário

Fornecido pelo Ricardo, configurável em Configurações (a faculdade pode mudar):

| Recesso | Fechada de | Último dia letivo | Volta |
|---|---|---|---|
| Fim de ano | 01/12 | 30/11 | 03/03 |
| Meio de ano | 30/07 | 29/07 | 11/08 |

A clínica fecha **completamente** nos dois períodos. Julho até o dia 29 é letivo — a
armadilha real é a virada do mês, não "julho" inteiro.

### 5.2 Regra

```
usar_ate(validade):
  se validade cai dentro de um recesso:
      → último dia letivo antes daquele recesso        (motivo: recesso_*)
  se validade cai até 14 dias DEPOIS da volta às aulas:
      → último dia letivo antes daquele recesso        (motivo: recesso_*)
  senão:
      → a própria validade                             (motivo: validade)
```

A segunda cláusula é a rede de proteção: um lote que vence 06/03 dá 3 dias úteis de uso,
o que na prática é zero. Nos 215 lotes atuais ela não pega nenhum — é prevenção. Os 14
dias são configuráveis.

### 5.3 Consequências

- A lista **ordena por `usar_ate`**, nunca por `validade`.
- Cada lote mostra quantos dias de validade estão sendo jogados fora (`validade - usar_ate`).
- Estados: `vencido` (validade < hoje) · `prazo passou` (usar_ate < hoje ≤ validade) ·
  `armadilha` (usar_ate < validade) · `no prazo` · `sem validade`.

### 5.4 Números atuais

Dos 215 lotes vivos: 9 vencidos com estoque físico, 54 armadilhas de recesso, 124 no
prazo, 28 sem validade informada. **16 lotes têm prazo real 30/11/2026** — 112 dias a
partir de hoje.

## 6. Especialidades

As 12 grafias da planilha viram 10, juntando apenas diferenças de caixa, acento e espaço
(`Material De dentística` + `Material de denstística` → Dentística; idem endodontia e o
`Material De  prótese` de espaço duplo).

Dentística 100 · Prótese 75 · Endodontia 75 · Cirurgia 63 · Proteção 21 · Prevenção 18 ·
Uso geral 16 · Limpeza 8 · Esterilização 8 · Anestésico 4.

## 7. Movimentos e histórico

### 7.1 Fluxo

Entrada e saída são o mesmo gesto: **escanear → informar quantidade → confirmar**.

O registro grava, sem o usuário digitar nada disso:

produto · lote · tipo · quantidade · data e hora · usuário responsável · saldo antes → depois.

`usuario` é gravado mesmo sendo hoje um sistema de um usuário só, para que o histórico
antigo não fique órfão se outro técnico ganhar conta depois.

### 7.2 Descartar tudo

Ação distinta, em vermelho, separada de entrada/saída no card. Zera o lote inteiro de uma
vez, exige motivo (`vencido` · `danificado` · `contaminado` · `perdido` · `devolvido`) e
pré-seleciona `vencido` quando o lote já está vencido. O lote permanece no histórico e o
produto entra na lista de compras. Nada é apagado.

### 7.3 Tabela

```
movimentos
  id            uuid pk
  lote_id       uuid not null references lotes
  tipo          text not null   -- 'entrada'|'saida'|'descarte'|'contagem'|'transferencia'
  quantidade    numeric not null
  motivo        text
  usuario       text not null
  dispositivo   text not null   -- 'mac' | 'iphone'
  criado_em     timestamptz not null default now()
  client_id     uuid unique     -- idempotência da sincronia (§9)
```

### 7.4 Auditoria

`estoque_audit_log`, append-only, com trigger no Postgres bloqueando UPDATE e DELETE —
mesmo padrão já verificado em `patient_audit_log`. Registra movimentos, edições de
cadastro (valor antes e depois, campo a campo), descartes, fusões de produto e impressões.

## 8. Código de barras

Biblioteca **ZXing** (`@zxing/browser`, Apache-2.0), câmera via `getUserMedia`.

- **EAN-13** — identifica o produto. O app acha no catálogo; o usuário escolhe o lote.
- **GS1 DataMatrix / GS1-128** — carrega Application Identifiers: `(01)` GTIN, `(10)` lote,
  `(17)` validade, `(11)` fabricação. Preenche produto, lote e validade sozinho. Exige
  parser próprio de AIs separados por FNC1.
- **Etiqueta QR própria** — para os lotes sem código legível, que são a maioria dos 215
  atuais. O app gera um QR por lote e imprime folha A4 de etiquetas adesivas. Cola no pote
  uma vez, escaneia para sempre.
- **Digitar o lote à mão** continua disponível em todos os passos.

**O índice de resolução cobre todos os lotes, vivos e mortos.** Um código escaneado é
procurado em `lotes` inteiro — sem filtrar por `quantidade > 0` nem por `descartado_em`.
Se cair num lote zerado, o app oferece dar entrada nele de volta em vez de cadastrar um
lote novo com o mesmo número. É o que evita o catálogo inchar de duplicados ao longo dos
semestres.

**Restrição dura:** a câmera só funciona em contexto seguro (HTTPS). No Mac, `localhost`
basta. O iPhone acessando o Mac por Tailscale em HTTP simples é **bloqueado pelo Safari**.
O Tailscale emite certificado TLS de graça (`tailscale cert` + MagicDNS) — resolve sem
custo, mas é passo de configuração obrigatório antes do scanner funcionar no celular.

## 9. Sincronia offline-first

Cada aparelho grava primeiro no banco local (IndexedDB no iPhone) e sincroniza depois.
É daí que vem a fluidez: nenhuma interação espera rede.

- **Movimentos são comutativos.** São deltas, não estados. Mac registra −1 e iPhone
  registra −1 offline: o total é −2. Conflito impossível por construção. `client_id`
  garante idempotência em reenvio.
- **Edição de cadastro é last-write-wins por campo**, não por registro. Cada campo carrega
  seu próprio timestamp. Mudar o local no Mac e a validade no iPhone: os dois sobrevivem.
- **Validade é a exceção.** Se dois aparelhos gravarem validades diferentes para o mesmo
  lote, o mais recente vence, **o perdedor vai para o audit log**, e o lote recebe
  `precisa_conferencia` com o motivo "divergência de validade — confira o produto físico".
  Dado sanitário não se resolve por timestamp.
- **Delete é soft** (`descartado_em`), então sincroniza como qualquer campo e nunca
  ressuscita.

## 10. Assistência

Separação deliberada. O que precisa acertar sempre é algoritmo; o que se beneficia de
julgamento é modelo local.

### 10.1 Determinístico — instantâneo, offline, sem IA

- Correção de digitação na busca: distância de edição contra o catálogo do próprio
  usuário, com sugestão "você quis dizer".
- Detecção de duplicata, matemática do recesso, ordem FEFO, marcação do `!`.

**Descoberta que mudou o desenho:** similaridade ingênua a 87% produz 141 pares nos dados
reais, e quase todos são falso positivo perigoso — `Resina LISS EA1` × `EA2` são cores
diferentes, `Protaper F2` × `F4` são limas diferentes, `Ultrapak #00` × `#000` são
espessuras diferentes. Em odontologia a informação que distingue o produto é justamente o
sufixo curto. Um corretor automático juntaria resina A2 com A3, que é erro clínico.

Portanto: **fusão automática só quando `norm()` das duas strings é idêntica** — ou seja,
diferença puramente cosmética. Nos dados atuais isso são 8 marcas (FMG/Fmg,
Maquira/maquira, MAXICOR/Maxicor, MEDIX/Medix, Rioquimica/Rioquímica/rioquimica,
SafeMax/Safemax, SS Plus/SSplus/Ssplus, VIGODENT/Vigodent) e 3 produtos (Ácido fosfórico
37%, EVIPLAC, tricresol formalina). Os outros 138 pares viram **pergunta**, nunca ação.

### 10.2 Modelo local — Qwen2.5 via Ollama

Leitura semanal do estado, sugestão de prioridade de consumo, redação da lista de compras
com justificativa. Sugestão, nunca regra. Requer o Mac ligado; degrada em silêncio quando
não está.

### 10.3 O revisor

Um aviso por vez, nunca um mural — a tela tem que continuar calma. Cada aviso declara de
antemão o que vai fazer:

| Rótulo | Comportamento |
|---|---|
| `conferir agora` | detectou, o usuário resolve |
| `posso corrigir` | é provadamente seguro, pede permissão |
| `não vou mexer` | encontrou, **recusa-se a agir**, e explica por quê |
| `pergunta` | não sabe, pergunta |
| `planejamento` | veio do modelo local, é sugestão |

Toda ação aceita entra no audit log e é reversível.

## 11. Importação da planilha

Fonte: aba `ESTOQUE COMPLETO`, 388 linhas.

1. Criar produtos por `(nome_norm, marca_norm)` aplicando §4.4. O importador **deve emitir
   a contagem final no relatório** em vez de assumir um número — as duas passadas de
   prototipagem deram 286 e 288 por divergirem em pontuação virar espaço ou nada; §4.4 fixa
   "nada".
2. Criar os 388 lotes. **Lote e validade entram exatamente como estão**, incluindo as
   validades de 2050 e 2051 — elas só recebem o `!`.
3. Marcar `precisa_conferencia` em **39 linhas**. Os motivos somam mais que 39 porque 21
   dessas linhas têm mais de um: sem validade com saldo positivo (28), sem local (23),
   validade posterior a 2035 (7 — cinco em 2050, uma em 2036, uma em 2051), sem
   quantidade (2). `conferencia_motivo` é array justamente por isso.
4. 215 lotes ficam ativos (saldo > 0 e não eliminados). 173 ficam inativos mas íntegros — 166
   zerados e os eliminados. **Nada é excluído**: os zerados são exatamente o que alimenta
   a lista de compras (107 produtos com saldo 0 hoje).
5. Aplicar as 11 fusões seguras de §10.1, registrando cada uma no audit log com
   possibilidade de desfazer.
6. Os 9 lotes vencidos com estoque físico entram na fila de descarte, não são zerados
   sozinhos.

Relatório de importação impresso ao final, com todas as contagens e a lista dos 39 `!`.

## 12. Interface

Liquid Glass, seguindo o design system existente. SF Pro no texto, monoespaçada com
`tabular-nums` em todo número e data, para as colunas empilharem alinhadas.

- **Cabeçalho**: título, busca (com correção), e `Escanear` como único botão preenchido da
  tela — é ação, não filtro.
- **A busca é global e ignora o segmento ativo.** Varre todos os lotes, vivos e mortos, e
  todos os produtos. Quem procura um material não sabe de antemão se ele tem saldo — achar
  "nada encontrado" quando o item existe zerado é pior que inútil, é enganoso. Cada
  resultado mostra o próprio estado (`no prazo`, `vencido`, `acabou`), e o segmento volta a
  valer quando a busca é limpa. Os filtros de especialidade e local continuam se aplicando
  sobre o resultado.
- **Revisor**: um card, um aviso por vez.
- **Controle segmentado**: `Em estoque` · `Validade` · `Comprar`, cada um com a contagem.
  "Em estoque" mostra só o que existe fisicamente; os zerados aparecem agrupados por
  produto em "Comprar". **Não há segmento "Histórico"** — os 173 lotes mortos continuam
  inteiros no banco (§4.2) e alcançáveis por busca e escaneamento, mas navegar por eles não
  serve para nada no dia a dia. O rastro de movimentos de um lote específico continua no
  botão `Histórico` dentro do card.
- **Filtros**: um botão só, abrindo card flutuante com Especialidade (as 10, com rolagem),
  Local e "Só mostrar". Nada de parede de chips.
- **Linha compacta**: tarja de status à esquerda, nome e marca, e as colunas de etiqueta,
  quantidade e `usar até` **centralizadas**.
- **Card flutuante**: abre no hover no Mac (com ~170 ms de atraso) e no toque longo no
  iPhone. **Flutua sobre a lista**, sem empurrar nada. Traz os campos completos, as ações
  de entrada/saída/histórico e, separado, `Descartar tudo`.
- **Ícones ou lista**: preferência persistida nas Configurações do segundo-cérebro, com
  alternador rápido também na barra da tela.
- **Paginação**: 60 itens por vez com "Mostrar mais". 215 superfícies de vidro fosco
  simultâneas travam a rolagem.

**Gotcha conhecido do projeto:** qualquer `position: fixed` dentro de um ancestral com
`backdrop-filter` quebra (o filtro cria novo bloco contentor). Modais renderizam via
`createPortal(..., document.body)`, como `GlassModal.tsx` já faz.

## 13. Impressão

- **Queimar antes do recesso** — A4 agrupada por local, para percorrer sala por sala.
  Mostra `usar até` em destaque, quantos dias de validade se perdem, e caixa de conferência
  a caneta. É a folha que cola no armário.
- **Lista de compras** — os produtos com saldo 0: nome, marca, e quantos lotes já passaram.
- **Etiquetas QR** — folha A4 no formato de etiqueta adesiva.
- **Conferência geral** — o estoque ativo com espaço para contagem manual.
- **Relatório de importação** — §11.

Toda impressão é registrada no audit log.

## 14. Fora de escopo

- **Baixa automática por procedimento realizado** (o que o Open Dental faz). Erra muito e
  não resolve o problema do Ricardo, que é validade.
- **Contas para alunos e outros técnicos.** Sistema de um usuário; o campo `usuario` já
  está gravado para permitir isso depois sem migração.
- **Push instantâneo de validade.** Notificação depende do Mac ligado. Para validade, que
  anda em semanas, um empurrão por dia quando o Mac acorda basta. Não prometer tempo real.
- **Integração com fornecedor / cotação de preço.**

## 15. Riscos

| Risco | Mitigação |
|---|---|
| HTTPS no iPhone bloqueia a câmera | `tailscale cert` antes de testar o scanner; digitação manual sempre disponível |
| `norm()` divergir entre server e cliente | função única em `packages/core`, com teste de contrato; cuidado com o gotcha CJS |
| Fusão indevida de produtos | só fusão por `norm()` idêntica; tudo reversível via audit log |
| Divergência de validade na sincronia | perdedor preservado no log + `!` no lote |
| Saldo materializado divergir dos movimentos | job de reconciliação que recalcula e acusa |

## 16. Critérios de aceite

1. Importar as 388 linhas sem alterar nenhum lote nem nenhuma validade, e emitir o
   relatório com as contagens.
2. "Em estoque" mostra 215 lotes e "Comprar" mostra 107 produtos. Os 173 lotes mortos
   continuam no banco, íntegros, sem aparecer em nenhuma das duas listas.
2b. Escanear a etiqueta de um lote já zerado encontra aquele lote e oferece dar entrada
   nele, em vez de criar um lote novo com o mesmo número.
3. Um lote que vence 01/03/2027 aparece com `usar até 30/11/2026` e "perde 91 dias".
4. Escanear → quantidade → confirmar grava os 7 campos e atualiza o saldo.
5. `Descartar tudo` exige motivo, zera o lote, mantém histórico e move o produto para a
   lista de compras.
6. Editar a validade no iPhone offline e o local no Mac: ao sincronizar, ambos sobrevivem.
7. Duas validades conflitantes: uma vence, a outra fica no log, o lote recebe `!`.
8. Buscar "asido fosforico" sugere "Ácido fosfórico 37%".
9. O revisor nunca funde `Resina LISS EA1` com `EA2`.
10. A lista de queima imprime agrupada por local em A4.

## 17. Questão aberta

O repositório `~/Desktop/CODE` **ainda não é um repositório git**. Este spec e todo o
código do módulo estão sem versionamento. Recomendado `git init` antes de começar a
implementação.
