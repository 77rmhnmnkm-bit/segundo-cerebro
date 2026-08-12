import type { EstoqueLote, StatusLote } from "@app/core";
import type { Theme } from "@app/ui";
import { useTheme } from "../ThemeProvider";

const ROTULO: Record<StatusLote, string> = {
  vencido: "vencido",
  prazo_passou: "prazo passou",
  armadilha: "",
  no_prazo: "no prazo",
  sem_validade: "sem validade",
};

// Cores derivadas dos tokens de tema (não hex fixo do protótipo) — pedido
// explícito da tarefa: "no app, derive dos tokens".
export function corStatus(theme: Theme, status: StatusLote): string {
  if (status === "vencido" || status === "prazo_passou") return theme.colors.danger;
  if (status === "armadilha") return theme.colors.warning;
  if (status === "no_prazo") return theme.colors.success;
  return theme.colors.textSecondary;
}

export function etiqueta(l: EstoqueLote): string {
  if (l.status === "armadilha" && l.usarAte) {
    const [a, m, d] = l.usarAte.split("-");
    return `${d}/${m}/${a.slice(2)}`;
  }
  return ROTULO[l.status] ?? "";
}

export function LoteRow({
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
      // O fundo (padrão/hover/aberto) mora no <style> injetado por
      // EstoqueScreen, não aqui: um background inline sempre venceria a regra
      // ".lr-row:hover" no cascade CSS (inline bate qualquer seletor de
      // classe, mesmo :hover), o que apagaria a transição de cor no hover.
      className={`lr-row lr-in${ativo ? " lr-row-open" : ""}`}
      onClick={() => onAbrir(lote)}
      onPointerEnter={() => onAbrir(lote)}
      style={{
        display: "grid",
        gridTemplateColumns: "4px minmax(0,1fr) 104px 80px 108px",
        gap: 10,
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        padding: "9px 11px",
        borderRadius: 10,
        border: "none",
        cursor: "pointer",
        font: "inherit",
        color: theme.colors.textPrimary,
        animationDelay: `${Math.min(index * 14, 200)}ms`,
      }}
    >
      <span style={{ width: 4, height: 25, borderRadius: 2, background: cor }} />
      <span
        style={{
          fontSize: 13.5,
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {lote.nome}
        {lote.precisaConferencia && (
          <span aria-label="falta informação" style={{ color: theme.colors.warning, fontWeight: 700 }}>
            {" "}
            !
          </span>
        )}
        <span style={{ fontSize: 11.5, color: theme.colors.textSecondary }}>
          {" · "}
          {lote.marca ?? "—"}
          {lote.lote ? ` · ${lote.lote}` : ""}
        </span>
      </span>
      <span style={{ display: "flex", justifyContent: "center" }}>
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
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
          color: theme.colors.textSecondary,
        }}
      >
        {lote.quantidade ? `${lote.quantidade} ${lote.unidade}` : "—"}
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
        {lote.usarAte ? lote.usarAte.split("-").reverse().join("/") : "—"}
      </span>
    </button>
  );
}
