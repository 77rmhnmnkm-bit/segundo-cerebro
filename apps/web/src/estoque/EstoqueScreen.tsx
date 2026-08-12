import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { EstoqueLote, EstoqueProduto, EstoqueVisao } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { PillSegmented, type PillOption } from "./PillSegmented";
import { RevisorPanel } from "./RevisorPanel";
import { FiltrosPopover } from "./FiltrosPopover";
import { LoteRow } from "./LoteRow";
import { LoteTile } from "./LoteTile";
import { LoteCard } from "./LoteCard";
import { Toast } from "./Toast";
import { useEstoque } from "./useEstoque";
import { useRevisorAvisos } from "./useRevisorAvisos";

// Mesmas 5 colunas do LoteRow, para as duas listas ficarem alinhadas quando
// o usuário troca de aba: tarja · nome · etiqueta (104px) · qtd (80px) · data (108px).
const COLUNAS = "4px minmax(0,1fr) 104px 80px 108px";

function ProdutoRow({ produto, index }: { produto: EstoqueProduto; index: number }) {
  const { theme } = useTheme();
  return (
    <div
      className="lr-row lr-in"
      style={{
        display: "grid",
        gridTemplateColumns: COLUNAS,
        gap: 10,
        alignItems: "center",
        width: "100%",
        padding: "9px 11px",
        borderRadius: 10,
        color: theme.colors.textPrimary,
        animationDelay: `${Math.min(index * 14, 200)}ms`,
      }}
    >
      <span style={{ width: 4, height: 25, borderRadius: 2, background: theme.colors.textSecondary }} />
      <span style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {produto.nome}
        <span style={{ fontSize: 11.5, color: theme.colors.textSecondary }}>
          {" · "}
          {produto.marca ?? "—"} · {produto.especialidade}
        </span>
      </span>
      <span style={{ display: "flex", justifyContent: "center" }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: 6,
            background: `${theme.colors.textSecondary}1F`,
            color: theme.colors.textSecondary,
            whiteSpace: "nowrap",
          }}
        >
          sem estoque
        </span>
      </span>
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
          color: theme.colors.textSecondary,
        }}
      >
        {produto.saldo || "—"}
      </span>
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
          color: theme.colors.textSecondary,
        }}
      >
        {produto.lotes} lote{produto.lotes === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function ProdutoTile({ produto, index }: { produto: EstoqueProduto; index: number }) {
  const { theme } = useTheme();
  return (
    <div
      className="lr-tile lr-in"
      style={{
        borderRadius: theme.radius.md,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 5,
        // Mesma altura/largura fixas do LoteTile — ver comentário lá para o motivo.
        height: 132,
        width: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        color: theme.colors.textPrimary,
        animationDelay: `${Math.min(index * 14, 200)}ms`,
      }}
    >
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          lineHeight: 1.32,
          height: "2.64em",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {produto.nome}
      </span>
      <span
        style={{
          fontSize: 10.5,
          color: theme.colors.textSecondary,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {produto.marca ?? "—"}
      </span>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          padding: "3px 8px",
          borderRadius: 6,
          background: `${theme.colors.textSecondary}1F`,
          color: theme.colors.textSecondary,
          marginTop: "auto",
          alignSelf: "flex-start",
          flex: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}
      >
        sem estoque · {produto.lotes} lote{produto.lotes === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function Cabecalho() {
  const { theme } = useTheme();
  return (
    <div
      className="lr-row"
      style={{
        display: "grid",
        gridTemplateColumns: COLUNAS,
        gap: 10,
        padding: "0 11px 6px",
        fontSize: 11,
        color: theme.colors.textSecondary,
        textTransform: "uppercase",
        letterSpacing: theme.typography.tracking.snug,
      }}
    >
      <span />
      <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>Produto</span>
      <span style={{ textAlign: "center" }}>Situação</span>
      <span style={{ textAlign: "center" }}>Qtd.</span>
      <span style={{ textAlign: "center" }}>Usar até</span>
    </div>
  );
}

const OPCOES_VISAO: { value: EstoqueVisao; label: string }[] = [
  { value: "estoque", label: "Em estoque" },
  { value: "validade", label: "Validade" },
  { value: "comprar", label: "Comprar" },
];

const OPCOES_MODO: PillOption<"lista" | "icones">[] = [
  { value: "lista", label: "Lista" },
  { value: "icones", label: "Ícones" },
];

export function EstoqueScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const {
    lotes,
    produtos,
    total,
    contagens,
    filtros,
    visao,
    modo,
    setModo,
    carregando,
    setVisao,
    carregarMais,
    buscaInput,
    setBuscaInput,
    busca,
    especialidade,
    setEspecialidade,
    local,
    setLocal,
    soFalta,
    setSoFalta,
    soAberto,
    setSoAberto,
    limparFiltros,
    filtrosAtivos,
  } = useEstoque();
  const { avisos } = useRevisorAvisos();
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // abertoId: qual lote está expandido agora (no máximo um). expandidos:
  // conjunto de ids que ainda têm o painel MONTADO no DOM — inclui o
  // `abertoId` atual e, durante a troca de um item para outro, também o
  // item anterior enquanto sua animação de fechamento ainda está correndo.
  // É o que permite as duas transições (a que fecha e a que abre) rodarem
  // juntas em vez de uma cortar a outra.
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [filtrosPos, setFiltrosPos] = useState<{ topo: number; esquerda: number } | null>(null);

  const areaRef = useRef<HTMLDivElement>(null);
  const filtrosBtnRef = useRef<HTMLButtonElement>(null);
  const filtrosPopRef = useRef<HTMLDivElement>(null);
  const abrirTimer = useRef<number | null>(null);
  const fecharTimer = useRef<number | null>(null);

  function reduzirMovimento() {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }

  const cancelarFechar = useCallback(() => {
    if (fecharTimer.current) {
      window.clearTimeout(fecharTimer.current);
      fecharTimer.current = null;
    }
  }, []);

  // Fecha imediatamente, sem esperar a animação — usado quando o filtro, a
  // aba ou a busca mudam (a lista toda vai remontar de qualquer forma) e
  // quando o popover de filtros abre.
  const fecharImediato = useCallback(() => {
    if (abrirTimer.current) {
      window.clearTimeout(abrirTimer.current);
      abrirTimer.current = null;
    }
    if (fecharTimer.current) {
      window.clearTimeout(fecharTimer.current);
      fecharTimer.current = null;
    }
    setAbertoId(null);
    setExpandidos(new Set());
  }, []);

  const abrirImediato = useCallback((lote: EstoqueLote) => {
    setAbertoId(lote.id);
    setExpandidos((atual) => {
      // Sem animação: não há transição de fechamento para esperar, então só
      // o item novo fica montado.
      if (reduzirMovimento()) return new Set([lote.id]);
      if (atual.has(lote.id)) return atual;
      const novo = new Set(atual);
      novo.add(lote.id);
      return novo;
    });
    setFiltrosAbertos(false);
  }, []);

  const agendarFechar = useCallback(() => {
    if (abrirTimer.current) {
      window.clearTimeout(abrirTimer.current);
      abrirTimer.current = null;
    }
    cancelarFechar();
    fecharTimer.current = window.setTimeout(() => {
      setAbertoId(null);
      if (reduzirMovimento()) setExpandidos(new Set());
    }, 150);
  }, [cancelarFechar]);

  const agendarAbrir = useCallback(
    (lote: EstoqueLote) => {
      cancelarFechar();
      if (abrirTimer.current) window.clearTimeout(abrirTimer.current);
      abrirTimer.current = window.setTimeout(() => abrirImediato(lote), 170);
    },
    [cancelarFechar, abrirImediato],
  );

  // Quando a transição de altura (fechando) termina num item que não é mais
  // o `abertoId` atual, ele sai de `expandidos` e desmonta. Se o item ainda
  // é o aberto (acabou de abrir), não faz nada — só a transição de abertura
  // terminou.
  const aoFecharTransicao = useCallback(
    (id: string, evento: React.TransitionEvent<HTMLDivElement>) => {
      if (evento.propertyName !== "grid-template-rows") return;
      if (id === abertoId) return;
      setExpandidos((atual) => {
        if (!atual.has(id)) return atual;
        const novo = new Set(atual);
        novo.delete(id);
        return novo;
      });
    },
    [abertoId],
  );

  // Trocar de aba, filtro ou busca fecha o painel — sem isso ele continuaria
  // mostrando os dados do lote anterior numa lista diferente.
  useEffect(() => {
    fecharImediato();
  }, [visao, especialidade, local, busca, soFalta, soAberto, fecharImediato]);

  // Fecha o popover de filtros ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!filtrosAbertos) return;
    function aoClicar(e: MouseEvent) {
      const t = e.target as Node;
      if (filtrosBtnRef.current?.contains(t)) return;
      if (filtrosPopRef.current?.contains(t)) return;
      setFiltrosAbertos(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setFiltrosAbertos(false);
    }
    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [filtrosAbertos]);

  function alternarFiltros() {
    if (filtrosAbertos) {
      setFiltrosAbertos(false);
      return;
    }
    const btn = filtrosBtnRef.current;
    const area = areaRef.current;
    if (!btn || !area) return;
    const b = btn.getBoundingClientRect();
    const a = area.getBoundingClientRect();
    const largura = 266;
    const esquerda = Math.max(8, Math.min(b.left - a.left, a.width - largura - 8));
    const topo = b.bottom - a.top + 6;
    setFiltrosPos({ topo, esquerda });
    setFiltrosAbertos(true);
    fecharImediato();
  }

  const opcoesVisaoComContagem: PillOption<EstoqueVisao>[] = OPCOES_VISAO.map((o) => ({
    ...o,
    badge: contagens ? String(contagens[o.value]) : undefined,
    badgeTone: o.value === "validade" ? "warning" : "accent",
  }));

  const nomeLocal = local ? filtros?.locais.find((l) => l.id === local)?.nome ?? null : null;

  const subtitulo = !contagens
    ? "Carregando..."
    : (() => {
        const nm = { estoque: "em estoque", validade: "com alerta de validade", comprar: "para comprar" }[visao];
        const partes = [`${total} ${nm}`];
        if (especialidade) partes.push(especialidade);
        if (nomeLocal) partes.push(nomeLocal);
        return partes.join(" · ");
      })();

  const listaVazia = visao === "comprar" ? produtos.length === 0 : lotes.length === 0;
  const podeMostrarMais = visao !== "comprar" && lotes.length < total;
  // Chave que muda exatamente quando o conjunto de resultados muda de fato
  // (não a cada tecla digitada — só quando a busca com debounce já bateu na
  // API), forçando o React a remontar a lista para o escalonamento de entrada
  // rodar de novo, como pedido: "quando o filtro muda".
  const chaveLista = `${visao}|${modo}|${especialidade ?? ""}|${local ?? ""}|${busca}|${soFalta}|${soAberto}`;

  async function mostrarMais() {
    setCarregandoMais(true);
    try {
      await carregarMais();
    } finally {
      setCarregandoMais(false);
    }
  }

  const estiloDinamico = useMemo(
    () => `
    @media (max-width: 520px) {
      .estoque-pagina { padding: 12px !important; }
      .estoque-painel { padding: 8px !important; }
      .lr-row {
        grid-template-columns: 4px minmax(0,1fr) 58px 40px 70px !important;
        gap: 6px !important;
        padding: 8px 6px !important;
      }
      .lr-row > span:nth-child(3) span,
      .lr-row > span:nth-child(4),
      .lr-row > span:nth-child(5) {
        font-size: 10px !important;
      }
    }

    /* O respiro entre rótulo e selo (gap 9px, selo com padding 1px 6px) fica
       ótimo em telas largas, mas em 375px os três segmentos ("Em estoque
       215" · "Validade 54" · "Comprar 111") não cabem mais na linha com
       esse respiro extra — estoura a largura da tela. Abaixo de 480px volta
       ao espaçamento mais compacto que já cabia. */
    @media (max-width: 480px) {
      .lr-pill-visao .lr-pill-btn { gap: 6px !important; }
      .lr-pill-visao .lr-pill-badge { padding: 1px 5px !important; }
    }

    .lr-row { background: transparent; }
    .lr-tile { background: ${theme.glass.surface}; border: 1px solid ${theme.glass.border}; }
    .lr-row, .lr-tile { transition: background ${theme.motion.fast}ms ease, border-color ${theme.motion.fast}ms ease; }
    .lr-row:hover, .lr-row.lr-row-open,
    .lr-tile:hover, .lr-tile.lr-row-open { background: ${theme.glass.surfaceStrong}; }
    .lr-tile:hover, .lr-tile.lr-row-open { border-color: ${theme.colors.primary}; }

    @keyframes lr-in-kf { from { opacity: .4; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .lr-in { animation: lr-in-kf 180ms cubic-bezier(.32,.72,0,1) both; }

    @keyframes lr-pop-kf { from { opacity: 0; transform: scale(.96) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    .lr-pop-in { animation: lr-pop-kf 190ms cubic-bezier(.32,.72,0,1) both; transform-origin: top left; }

    .lr-pill-indicator {
      transition: left 200ms cubic-bezier(.32,.72,0,1), top 200ms cubic-bezier(.32,.72,0,1),
        width 200ms cubic-bezier(.32,.72,0,1), height 200ms cubic-bezier(.32,.72,0,1);
    }

    /* Painel de detalhe em fluxo: a altura anima via grid-template-rows
       0fr → 1fr (não max-height "chutado" — esse truque anima suave até 0
       de verdade porque o item interno tem overflow:hidden, o que zera o
       tamanho mínimo automático que o grid respeitaria). Largura cheia
       sempre — em modo Ícones o próprio elemento recebe grid-column:1/-1
       inline para furar a grade e empurrar as fileiras seguintes. */
    .lr-expansor {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows 220ms cubic-bezier(.32,.72,0,1);
    }
    .lr-expansor.lr-expansor-open { grid-template-rows: 1fr; }
    .lr-expansor-inner { overflow: hidden; min-height: 0; }
    .lr-expansor-content {
      opacity: 0;
      transform: translateY(-6px);
      transition: opacity 220ms cubic-bezier(.32,.72,0,1), transform 220ms cubic-bezier(.32,.72,0,1);
    }
    /* O conteúdo entra ~70ms depois da altura começar a abrir, para não
       parecer que o texto "salta" para dentro de um espaço que ainda está
       crescendo. Ao fechar não há atraso — some junto com a altura. */
    .lr-expansor.lr-expansor-open .lr-expansor-content {
      opacity: 1;
      transform: translateY(0);
      transition-delay: 70ms;
    }

    @keyframes lr-toast-kf { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
    .lr-toast-in { left: 50%; animation: lr-toast-kf 220ms cubic-bezier(.32,.72,0,1) both; }

    @media (prefers-reduced-motion: reduce) {
      .lr-in, .lr-pop-in, .lr-toast-in { animation: none !important; opacity: 1 !important; transform: none !important; }
      .lr-pill-indicator, .lr-row, .lr-tile { transition: none !important; }
      .lr-expansor, .lr-expansor-content { transition: none !important; }
    }
  `,
    [theme],
  );

  return (
    <div className="estoque-pagina" style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: theme.spacing.xl }}>
      <style>{estiloDinamico}</style>

      <header
        style={{
          ...glassSurface(theme, { radius: theme.radius.lg }),
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: theme.spacing.md,
          padding: `${theme.spacing.md}px ${theme.spacing.lg}px`,
          marginBottom: theme.spacing.md,
        }}
      >
        <button
          onClick={() => navigate("/")}
          aria-label="Voltar"
          style={{ border: "none", background: "transparent", color: theme.colors.textSecondary, fontSize: theme.typography.sizes.lg, cursor: "pointer" }}
        >
          ←
        </button>
        <div style={{ flex: "1 1 180px", minWidth: 150 }}>
          <div
            style={{
              fontSize: theme.typography.sizes.xl,
              fontWeight: theme.typography.weights.bold,
              letterSpacing: theme.typography.tracking.tight,
              color: theme.colors.textPrimary,
            }}
          >
            Estoque
          </div>
          <div
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.typography.sizes.xs,
              fontVariantNumeric: "tabular-nums",
              marginTop: 1,
            }}
          >
            {subtitulo}
          </div>
        </div>
        <input
          type="search"
          value={buscaInput}
          onChange={(e) => setBuscaInput(e.target.value)}
          placeholder="Buscar material"
          aria-label="Buscar material"
          autoComplete="off"
          style={{
            font: "inherit",
            fontSize: 13,
            color: theme.colors.textPrimary,
            background: theme.glass.surfaceStrong,
            border: `1px solid ${theme.glass.borderSoft}`,
            borderRadius: theme.radius.sm,
            padding: "7px 12px",
            width: 190,
            maxWidth: "100%",
          }}
        />
        <button
          onClick={() => setToast("O leitor de código chega em outra tarefa.")}
          style={{
            font: "inherit",
            fontSize: 13,
            fontWeight: 600,
            color: theme.colors.onPrimary,
            background: theme.colors.primary,
            border: `1px solid ${theme.colors.primary}`,
            borderRadius: theme.radius.sm,
            padding: "7px 14px",
            cursor: "pointer",
          }}
        >
          Escanear
        </button>
      </header>

      <RevisorPanel avisos={avisos} onAcao={setToast} />

      <div ref={areaRef} style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.sm, flexWrap: "wrap", marginBottom: theme.spacing.md }}>
          <PillSegmented
            options={opcoesVisaoComContagem}
            value={visao}
            onChange={setVisao}
            ariaLabel="Visão"
            className="lr-pill-visao"
          />
          <div style={{ flex: 1 }} />
          <PillSegmented options={OPCOES_MODO} value={modo} onChange={setModo} ariaLabel="Modo de exibição" compact />
          <button
            ref={filtrosBtnRef}
            onClick={alternarFiltros}
            aria-expanded={filtrosAbertos}
            style={{
              font: "inherit",
              fontSize: 13,
              color: theme.colors.textPrimary,
              background: theme.glass.surfaceStrong,
              border: `1px solid ${theme.glass.borderSoft}`,
              borderRadius: theme.radius.sm,
              padding: "7px 13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Filtros
            {filtrosAtivos && (
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: theme.colors.primary }} />
            )}
          </button>
        </div>

        <div className="estoque-painel" style={{ ...glassSurface(theme, { radius: theme.radius.lg }), padding: theme.spacing.md }}>
          {carregando && listaVazia && (
            <div style={{ padding: theme.spacing.lg, textAlign: "center", color: theme.colors.textSecondary }}>Carregando...</div>
          )}

          {!carregando && listaVazia && (
            <div style={{ padding: theme.spacing.lg, textAlign: "center", color: theme.colors.textSecondary }}>
              {filtrosAtivos || busca
                ? "Nada aqui com esses filtros."
                : visao === "comprar"
                  ? "Nada para comprar agora."
                  : "Nenhum lote nesta visão."}
            </div>
          )}

          {!listaVazia && modo === "lista" && visao !== "comprar" && <Cabecalho />}

          {!listaVazia && visao !== "comprar" && modo === "lista" && (
            <div key={chaveLista} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {lotes.map((lote, i) => {
                const ativo = abertoId === lote.id;
                const montado = expandidos.has(lote.id);
                return (
                  <div key={lote.id} onPointerEnter={cancelarFechar} onPointerLeave={agendarFechar}>
                    <LoteRow lote={lote} onAbrir={agendarAbrir} index={i} ativo={ativo} />
                    {montado && (
                      <div
                        className={`lr-expansor${ativo ? " lr-expansor-open" : ""}`}
                        onTransitionEnd={(e) => aoFecharTransicao(lote.id, e)}
                      >
                        <div className="lr-expansor-inner">
                          <div className="lr-expansor-content">
                            <LoteCard lote={lote} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!listaVazia && visao !== "comprar" && modo === "icones" && (
            <div
              key={chaveLista}
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 9 }}
            >
              {lotes.map((lote, i) => {
                const ativo = abertoId === lote.id;
                const montado = expandidos.has(lote.id);
                return (
                  <Fragment key={lote.id}>
                    <div onPointerEnter={cancelarFechar} onPointerLeave={agendarFechar}>
                      <LoteTile lote={lote} onAbrir={agendarAbrir} index={i} ativo={ativo} />
                    </div>
                    {montado && (
                      // grid-column ligado ao bloco clicado: precisa ser item direto
                      // da mesma grade (por isso é irmão do wrapper acima, não filho
                      // dele) para furar a fileira inteira e empurrar as próximas.
                      <div
                        style={{ gridColumn: "1 / -1" }}
                        onPointerEnter={cancelarFechar}
                        onPointerLeave={agendarFechar}
                        className={`lr-expansor${ativo ? " lr-expansor-open" : ""}`}
                        onTransitionEnd={(e) => aoFecharTransicao(lote.id, e)}
                      >
                        <div className="lr-expansor-inner">
                          <div className="lr-expansor-content">
                            <LoteCard lote={lote} />
                          </div>
                        </div>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}

          {!listaVazia && visao === "comprar" && (
            <div
              key={chaveLista}
              style={
                modo === "icones"
                  ? { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 9 }
                  : { display: "flex", flexDirection: "column", gap: 2 }
              }
            >
              {produtos.map((produto, i) =>
                modo === "icones" ? (
                  <ProdutoTile key={produto.id} produto={produto} index={i} />
                ) : (
                  <ProdutoRow key={produto.id} produto={produto} index={i} />
                ),
              )}
            </div>
          )}

          {podeMostrarMais && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: theme.spacing.md }}>
              <button
                onClick={mostrarMais}
                disabled={carregandoMais}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: `${theme.spacing.xs + 2}px ${theme.spacing.lg}px`,
                  borderRadius: theme.radius.md,
                  border: `1px solid ${theme.glass.borderSoft}`,
                  background: theme.glass.surfaceStrong,
                  color: theme.colors.textPrimary,
                  fontSize: theme.typography.sizes.sm,
                  fontWeight: theme.typography.weights.medium,
                  cursor: carregandoMais ? "default" : "pointer",
                  opacity: carregandoMais ? 0.6 : 1,
                }}
              >
                {carregandoMais ? "Carregando..." : `Mostrar mais (${total - lotes.length})`}
              </button>
            </div>
          )}
        </div>

        {filtrosAbertos && filtrosPos && (
          <div ref={filtrosPopRef}>
            <FiltrosPopover
              filtros={filtros}
              especialidade={especialidade}
              setEspecialidade={setEspecialidade}
              local={local}
              setLocal={setLocal}
              soFalta={soFalta}
              setSoFalta={setSoFalta}
              soAberto={soAberto}
              setSoAberto={setSoAberto}
              conferenciaTotal={contagens?.conferencia ?? 0}
              onLimpar={limparFiltros}
              topo={filtrosPos.topo}
              esquerda={filtrosPos.esquerda}
            />
          </div>
        )}
      </div>

      <Toast mensagem={toast} onFechar={() => setToast(null)} />
    </div>
  );
}
