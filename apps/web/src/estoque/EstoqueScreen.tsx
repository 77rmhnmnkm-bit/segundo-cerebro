import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
        minHeight: 118,
        color: theme.colors.textPrimary,
        animationDelay: `${Math.min(index * 14, 200)}ms`,
      }}
    >
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          lineHeight: 1.32,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {produto.nome}
      </span>
      <span style={{ fontSize: 10.5, color: theme.colors.textSecondary }}>{produto.marca ?? "—"}</span>
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

  const [cardAberto, setCardAberto] = useState<{ lote: EstoqueLote; topo: number; esquerda: number } | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [filtrosPos, setFiltrosPos] = useState<{ topo: number; esquerda: number } | null>(null);

  const areaRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const filtrosBtnRef = useRef<HTMLButtonElement>(null);
  const filtrosPopRef = useRef<HTMLDivElement>(null);
  const abrirTimer = useRef<number | null>(null);
  const fecharTimer = useRef<number | null>(null);

  // Padrão de "pontes" de hover-card: abrir tem atraso de 170ms (evita o card
  // pipocando enquanto o mouse só está passando por cima da lista); fechar
  // também tem um pequeno atraso, e tanto uma nova linha quanto o próprio
  // card cancelam esse fechamento — sem isso, o trajeto do mouse da linha até
  // o card (que flutua por cima da lista) dispara um pointerleave que fecha o
  // card antes que dê tempo de ler o conteúdo.
  const cancelarFechar = useCallback(() => {
    if (fecharTimer.current) {
      window.clearTimeout(fecharTimer.current);
      fecharTimer.current = null;
    }
  }, []);

  const agendarFechar = useCallback(() => {
    if (abrirTimer.current) {
      window.clearTimeout(abrirTimer.current);
      abrirTimer.current = null;
    }
    cancelarFechar();
    fecharTimer.current = window.setTimeout(() => setCardAberto(null), 150);
  }, [cancelarFechar]);

  const agendarAbrir = useCallback(
    (lote: EstoqueLote) => {
      cancelarFechar();
      if (abrirTimer.current) window.clearTimeout(abrirTimer.current);
      abrirTimer.current = window.setTimeout(() => {
        const rowEl = rowRefs.current.get(lote.id);
        const areaEl = areaRef.current;
        if (!rowEl || !areaEl) return;
        const r = rowEl.getBoundingClientRect();
        const a = areaEl.getBoundingClientRect();
        const largura = 330;
        const esquerda = Math.max(a.width - largura - 16, 16);
        const topo = Math.max(Math.min(r.top - a.top, Math.max(a.height - 40, 0)), 0);
        setCardAberto({ lote, topo, esquerda });
        setFiltrosAbertos(false);
      }, 170);
    },
    [cancelarFechar],
  );

  // Trocar de aba, filtro ou busca fecha o card — sem isso ele continuaria
  // flutuando com os dados do lote anterior por cima de uma lista diferente.
  useEffect(() => {
    if (abrirTimer.current) window.clearTimeout(abrirTimer.current);
    if (fecharTimer.current) window.clearTimeout(fecharTimer.current);
    setCardAberto(null);
  }, [visao, especialidade, local, busca, soFalta, soAberto]);

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
    setCardAberto(null);
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

    @keyframes lr-toast-kf { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
    .lr-toast-in { left: 50%; animation: lr-toast-kf 220ms cubic-bezier(.32,.72,0,1) both; }

    @media (prefers-reduced-motion: reduce) {
      .lr-in, .lr-pop-in, .lr-toast-in { animation: none !important; opacity: 1 !important; transform: none !important; }
      .lr-pill-indicator, .lr-row, .lr-tile { transition: none !important; }
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
          <PillSegmented options={opcoesVisaoComContagem} value={visao} onChange={setVisao} ariaLabel="Visão" />
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

          {!listaVazia && visao !== "comprar" && (
            <div key={chaveLista} style={modo === "icones" ? { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 9 } : { display: "flex", flexDirection: "column", gap: 2 }}>
              {lotes.map((lote, i) =>
                modo === "icones" ? (
                  <div
                    key={lote.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(lote.id, el);
                      else rowRefs.current.delete(lote.id);
                    }}
                    onPointerEnter={cancelarFechar}
                    onPointerLeave={agendarFechar}
                  >
                    <LoteTile lote={lote} onAbrir={agendarAbrir} index={i} ativo={cardAberto?.lote.id === lote.id} />
                  </div>
                ) : (
                  <div
                    key={lote.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(lote.id, el);
                      else rowRefs.current.delete(lote.id);
                    }}
                    onPointerEnter={cancelarFechar}
                    onPointerLeave={agendarFechar}
                  >
                    <LoteRow lote={lote} onAbrir={agendarAbrir} index={i} ativo={cardAberto?.lote.id === lote.id} />
                  </div>
                ),
              )}
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

        {cardAberto && (
          <div onPointerEnter={cancelarFechar}>
            <LoteCard lote={cardAberto.lote} topo={cardAberto.topo} esquerda={cardAberto.esquerda} onFechar={agendarFechar} />
          </div>
        )}

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
