import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { EstoqueLote, EstoqueProduto, EstoqueVisao } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { SegmentedControl } from "../SegmentedControl";
import { LoteRow } from "./LoteRow";
import { LoteCard } from "./LoteCard";
import { useEstoque } from "./useEstoque";

const OPCOES: { value: EstoqueVisao; label: string }[] = [
  { value: "estoque", label: "Em estoque" },
  { value: "validade", label: "Validade" },
  { value: "comprar", label: "Comprar" },
];

// Mesmas 5 colunas do LoteRow, para as duas listas ficarem alinhadas quando
// o usuário troca de aba: tarja · nome · etiqueta (104px) · qtd (80px) · data (108px).
const COLUNAS = "4px minmax(0,1fr) 104px 80px 108px";

function ProdutoRow({ produto }: { produto: EstoqueProduto }) {
  const { theme } = useTheme();
  return (
    <div
      className="lr-row"
      style={{
        display: "grid",
        gridTemplateColumns: COLUNAS,
        gap: 10,
        alignItems: "center",
        width: "100%",
        padding: "9px 11px",
        borderRadius: 10,
        color: theme.colors.textPrimary,
      }}
    >
      <span style={{ width: 4, height: 25, borderRadius: 2, background: "#8A9199" }} />
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
            background: "#8A919922",
            color: "#8A9199",
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

export function EstoqueScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { lotes, produtos, total, contagens, visao, carregando, setVisao, carregarMais } = useEstoque();
  const [carregandoMais, setCarregandoMais] = useState(false);

  const [cardAberto, setCardAberto] = useState<{ lote: EstoqueLote; topo: number; esquerda: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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
        const containerEl = containerRef.current;
        if (!rowEl || !containerEl) return;
        const r = rowEl.getBoundingClientRect();
        const c = containerEl.getBoundingClientRect();
        const largura = 330;
        const esquerda = Math.max(c.width - largura - 16, 16);
        const topo = Math.max(Math.min(r.top - c.top, Math.max(c.height - 40, 0)), 0);
        setCardAberto({ lote, topo, esquerda });
      }, 170);
    },
    [cancelarFechar],
  );

  // Trocar de aba troca a lista embaixo do card — sem isso ele continuaria
  // flutuando com os dados do lote da aba anterior por cima da lista nova.
  useEffect(() => {
    if (abrirTimer.current) window.clearTimeout(abrirTimer.current);
    if (fecharTimer.current) window.clearTimeout(fecharTimer.current);
    setCardAberto(null);
  }, [visao]);

  const opcoesComContagem = OPCOES.map((o) => ({
    ...o,
    label: contagens ? `${o.label} · ${contagens[o.value]}` : o.label,
  }));

  const subtitulo = !contagens
    ? "Carregando..."
    : visao === "comprar"
      ? `${contagens.comprar} produto${contagens.comprar === 1 ? "" : "s"} sem estoque`
      : visao === "validade"
        ? `${contagens.validade} lote${contagens.validade === 1 ? "" : "s"} vencendo antes da validade impressa`
        : `${contagens.estoque} lote${contagens.estoque === 1 ? "" : "s"} em estoque`;

  const listaVazia = visao === "comprar" ? produtos.length === 0 : lotes.length === 0;
  const podeMostrarMais = visao !== "comprar" && lotes.length < total;

  async function mostrarMais() {
    setCarregandoMais(true);
    try {
      await carregarMais();
    } finally {
      setCarregandoMais(false);
    }
  }

  return (
    <div className="estoque-pagina" style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: theme.spacing.xl }}>
      {/* Colunas de etiqueta/qtd/usar-até têm largura fixa em px para as datas
          empilharem alinhadas entre linhas (cada linha é seu próprio grid, então
          só larguras fixas garantem o alinhamento visual). Isso não sobra espaço
          num viewport de celular — a media query abaixo reduz essas larguras e os
          respiros ao redor com !important (única forma de vencer o inline style
          sem reescrever a estrutura da linha). */}
      <style>{`
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
      `}</style>
      <header
        style={{
          ...glassSurface(theme, { radius: theme.radius.lg }),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: theme.spacing.md,
          padding: `${theme.spacing.md}px ${theme.spacing.lg}px`,
          marginBottom: theme.spacing.lg,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.md }}>
          <button
            onClick={() => navigate("/")}
            aria-label="Voltar"
            style={{ border: "none", background: "transparent", color: theme.colors.textSecondary, fontSize: theme.typography.sizes.lg, cursor: "pointer" }}
          >
            ←
          </button>
          <div>
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
            <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>{subtitulo}</div>
          </div>
        </div>

        <SegmentedControl options={opcoesComContagem} value={visao} onChange={setVisao} />
      </header>

      <div ref={containerRef} style={{ position: "relative" }}>
        <div className="estoque-painel" style={{ ...glassSurface(theme, { radius: theme.radius.lg }), padding: theme.spacing.md }}>
          {carregando && listaVazia && (
            <div style={{ padding: theme.spacing.lg, textAlign: "center", color: theme.colors.textSecondary }}>
              Carregando...
            </div>
          )}

          {!carregando && listaVazia && (
            <div style={{ padding: theme.spacing.lg, textAlign: "center", color: theme.colors.textSecondary }}>
              {visao === "comprar" ? "Nada para comprar agora." : "Nenhum lote nesta visão."}
            </div>
          )}

          {!listaVazia && <Cabecalho />}

          {visao !== "comprar" && lotes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {lotes.map((lote) => (
                <div
                  key={lote.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(lote.id, el);
                    else rowRefs.current.delete(lote.id);
                  }}
                  onPointerEnter={cancelarFechar}
                  onPointerLeave={agendarFechar}
                >
                  <LoteRow lote={lote} onAbrir={agendarAbrir} />
                </div>
              ))}
            </div>
          )}

          {visao === "comprar" && produtos.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {produtos.map((produto) => (
                <ProdutoRow key={produto.id} produto={produto} />
              ))}
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
      </div>
    </div>
  );
}
