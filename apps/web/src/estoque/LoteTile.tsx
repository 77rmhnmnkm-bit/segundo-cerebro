import type { EstoqueLote } from "@app/core";
import { useTheme } from "../ThemeProvider";
import { corStatus, etiqueta } from "./LoteRow";

export function LoteTile({
  lote,
  onAbrir,
  index = 0,
  ativo = false,
}: {
  lote: EstoqueLote;
  onAbrir: (l: EstoqueLote) => void;
  index?: number;
  ativo?: boolean;
}) {
  const { theme } = useTheme();
  const cor = corStatus(theme, lote.status);
  return (
    <button
      type="button"
      // Fundo/borda (padrão, hover, aberto) definidos no <style> de
      // EstoqueScreen — mesmo motivo do LoteRow: inline sempre venceria :hover.
      className={`lr-tile lr-in${ativo ? " lr-row-open" : ""}`}
      onClick={() => onAbrir(lote)}
      onPointerEnter={() => onAbrir(lote)}
      style={{
        borderRadius: theme.radius.md,
        padding: 12,
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        minHeight: 118,
        cursor: "pointer",
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
        {lote.nome}
        {lote.precisaConferencia && (
          <span aria-label="falta informação" style={{ color: theme.colors.warning, fontWeight: 700 }}>
            {" "}
            !
          </span>
        )}
      </span>
      <span style={{ fontSize: 10.5, color: theme.colors.textSecondary }}>{lote.marca ?? "—"}</span>
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 21,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          marginTop: "auto",
        }}
      >
        {lote.quantidade || 0}
        <i style={{ fontStyle: "normal", fontSize: 11, fontWeight: 400, color: theme.colors.textSecondary, marginLeft: 3 }}>
          {lote.unidade}
        </i>
      </span>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: 6,
            background: `${cor}1F`,
            color: cor,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {etiqueta(lote)}
        </span>
      </span>
    </button>
  );
}
