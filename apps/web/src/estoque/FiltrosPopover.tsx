import type { EstoqueFiltros } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";

export function FiltrosPopover({
  filtros,
  especialidade,
  setEspecialidade,
  local,
  setLocal,
  soFalta,
  setSoFalta,
  soAberto,
  setSoAberto,
  conferenciaTotal,
  onLimpar,
  topo,
  esquerda,
}: {
  filtros: EstoqueFiltros | null;
  especialidade: string | null;
  setEspecialidade: (v: string | null) => void;
  local: string | null;
  setLocal: (v: string | null) => void;
  soFalta: boolean;
  setSoFalta: (v: boolean) => void;
  soAberto: boolean;
  setSoAberto: (v: boolean) => void;
  conferenciaTotal: number;
  onLimpar: () => void;
  topo: number;
  esquerda: number;
}) {
  const { theme } = useTheme();

  const cabecalho: React.CSSProperties = {
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: theme.colors.textSecondary,
    margin: "13px 3px 6px",
  };

  const linha = (
    label: string,
    ativo: boolean,
    onClick: () => void,
    badge?: number,
    key?: string,
  ) => (
    <button
      key={key ?? label}
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        width: "100%",
        textAlign: "left",
        padding: "6px 9px",
        borderRadius: theme.radius.sm,
        border: "none",
        background: ativo ? theme.colors.primary : "transparent",
        color: ativo ? theme.colors.onPrimary : theme.colors.textPrimary,
        fontSize: 12.5,
        fontWeight: ativo ? 600 : 450,
        marginBottom: 1,
        cursor: "pointer",
        transition: `background ${theme.motion.fast}ms ease, color ${theme.motion.fast}ms ease`,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {badge != null && (
        <b
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            fontWeight: 500,
            opacity: 0.62,
            flex: "none",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {badge}
        </b>
      )}
    </button>
  );

  return (
    <div
      role="dialog"
      aria-label="Filtros"
      className="lr-pop-in"
      style={{
        ...glassSurface(theme, { strong: true, radius: theme.radius.lg }),
        position: "absolute",
        zIndex: 45,
        top: topo,
        left: esquerda,
        width: "min(266px, calc(100vw - 32px))",
        padding: 13,
        boxShadow: `0 18px 46px ${theme.glass.shadow}`,
      }}
    >
      <p style={{ ...cabecalho, marginTop: 0 }}>Especialidade</p>
      <div style={{ maxHeight: 184, overflowY: "auto", margin: "0 -3px", padding: "0 3px" }}>
        {filtros?.especialidades.length ? (
          filtros.especialidades.map((e) =>
            linha(e.nome, especialidade === e.nome, () => setEspecialidade(especialidade === e.nome ? null : e.nome), e.total, e.nome),
          )
        ) : (
          <p style={{ fontSize: 12, color: theme.colors.textSecondary, padding: "4px 3px" }}>Carregando…</p>
        )}
      </div>

      <p style={cabecalho}>Local</p>
      <div style={{ maxHeight: 184, overflowY: "auto", margin: "0 -3px", padding: "0 3px" }}>
        {filtros?.locais.length ? (
          filtros.locais.map((l) => linha(l.nome, local === l.id, () => setLocal(local === l.id ? null : l.id), l.total, l.id))
        ) : (
          <p style={{ fontSize: 12, color: theme.colors.textSecondary, padding: "4px 3px" }}>Carregando…</p>
        )}
      </div>

      <p style={cabecalho}>Só mostrar</p>
      {linha("Falta informação", soFalta, () => setSoFalta(!soFalta), conferenciaTotal, "flag")}
      {linha("Frascos abertos", soAberto, () => setSoAberto(!soAberto), undefined, "aberto")}

      <button
        type="button"
        onClick={onLimpar}
        style={{
          width: "100%",
          marginTop: 11,
          fontSize: 12,
          padding: "6px 0",
          textAlign: "center",
          borderRadius: theme.radius.sm,
          border: `1px solid ${theme.glass.borderSoft}`,
          background: theme.glass.surface,
          color: theme.colors.textSecondary,
          cursor: "pointer",
        }}
      >
        Limpar filtros
      </button>
    </div>
  );
}
