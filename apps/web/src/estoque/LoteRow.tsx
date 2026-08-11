import type { EstoqueLote } from "@app/core";
import { useTheme } from "../ThemeProvider";

const COR: Record<string, string> = {
  vencido: "#C4333B",
  prazo_passou: "#C4333B",
  armadilha: "#B0700A",
  no_prazo: "#2C8C4E",
  sem_validade: "#8A9199",
};

const ROTULO: Record<string, string> = {
  vencido: "vencido",
  prazo_passou: "prazo passou",
  armadilha: "",
  no_prazo: "no prazo",
  sem_validade: "sem validade",
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
      className="lr-row"
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
        background: "transparent",
        cursor: "pointer",
        font: "inherit",
        color: theme.colors.textPrimary,
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
          <span aria-label="falta informação" style={{ color: "#B0700A", fontWeight: 700 }}>
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
            background: `${cor}22`,
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
