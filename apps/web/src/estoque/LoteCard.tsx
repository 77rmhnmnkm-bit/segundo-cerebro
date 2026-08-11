import type { EstoqueLote } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";

const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export function LoteCard({
  lote,
  topo,
  esquerda,
  onFechar,
}: {
  lote: EstoqueLote;
  topo: number;
  esquerda: number;
  onFechar: () => void;
}) {
  const { theme } = useTheme();
  const linha = (rotulo: string, valor: string, cor?: string) => (
    <>
      <dt style={{ color: theme.colors.textSecondary }}>{rotulo}</dt>
      <dd
        style={{
          margin: 0,
          textAlign: "right",
          fontFamily: "ui-monospace, monospace",
          fontVariantNumeric: "tabular-nums",
          color: cor,
        }}
      >
        {valor}
      </dd>
    </>
  );
  return (
    <div
      role="dialog"
      aria-label={`Detalhe de ${lote.nome}`}
      onPointerLeave={onFechar}
      style={{
        ...glassSurface(theme, { radius: 16 }),
        position: "absolute",
        zIndex: 40,
        top: topo,
        left: esquerda,
        width: 330,
        padding: "15px 17px",
        boxShadow: "0 18px 44px rgba(0,10,14,.28)",
      }}
    >
      <h3 style={{ margin: "0 0 2px", fontSize: 14.5, fontWeight: 600 }}>{lote.nome}</h3>
      <p style={{ margin: "0 0 11px", fontSize: 11.5, color: theme.colors.textSecondary }}>
        {lote.marca ?? "—"}
        {lote.lote ? ` · lote ${lote.lote}` : ""}
      </p>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "5px 14px",
          margin: "0 0 11px",
          fontSize: 12.5,
        }}
      >
        {linha("Validade", br(lote.validade))}
        {linha("Usar até", br(lote.usarAte), lote.status === "armadilha" ? "#B0700A" : undefined)}
        {linha("Em estoque", lote.quantidade ? `${lote.quantidade} ${lote.unidade}` : "0")}
        {linha("Local", lote.local ?? "—")}
        {linha("Especialidade", lote.especialidade)}
        {linha("Situação", lote.situacao ?? "—")}
      </dl>
      {lote.diasPerdidos > 0 && (
        <p
          style={{
            fontSize: 11.5,
            padding: "8px 10px",
            borderRadius: 9,
            margin: "0 0 11px",
            background: "rgba(176,112,10,.14)",
            color: "#B0700A",
            lineHeight: 1.45,
          }}
        >
          Vence no recesso. Perde {lote.diasPerdidos} dias de validade — use antes de {br(lote.usarAte)}.
        </p>
      )}
      {lote.precisaConferencia && (
        <p
          style={{
            fontSize: 11.5,
            padding: "8px 10px",
            borderRadius: 9,
            margin: "0 0 11px",
            background: "rgba(176,112,10,.14)",
            color: "#B0700A",
            lineHeight: 1.45,
          }}
        >
          {lote.conferenciaMotivo.join(" · ")}
        </p>
      )}
      {lote.observacoes && (
        <p style={{ fontSize: 11.5, margin: "0 0 11px", color: theme.colors.textSecondary, lineHeight: 1.45 }}>
          {lote.observacoes}
        </p>
      )}
    </div>
  );
}
