import { useState } from "react";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import type { Aviso } from "./useRevisorAvisos";

export function RevisorPanel({ avisos, onAcao }: { avisos: Aviso[]; onAcao: (texto: string) => void }) {
  const { theme } = useTheme();
  const [i, setI] = useState(0);

  if (avisos.length === 0) return null;
  const indice = Math.min(i, avisos.length - 1);
  const aviso = avisos[indice];

  function avancar() {
    setI((x) => (x + 1) % avisos.length);
  }

  const botaoGhost: React.CSSProperties = {
    font: "inherit",
    color: theme.colors.textPrimary,
    cursor: "pointer",
    background: theme.glass.surfaceStrong,
    border: `1px solid ${theme.glass.borderSoft}`,
    borderRadius: theme.radius.sm,
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: theme.typography.weights.medium,
    transition: `background ${theme.motion.fast}ms ease, border-color ${theme.motion.fast}ms ease`,
  };

  return (
    <div
      key={aviso.id}
      className="lr-pop-in"
      role="status"
      style={{
        ...glassSurface(theme, { radius: theme.radius.lg }),
        display: "flex",
        alignItems: "flex-start",
        gap: theme.spacing.md,
        padding: "13px 15px",
        marginBottom: theme.spacing.md,
        borderLeft: `3px solid ${theme.colors.primary}`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: theme.colors.primary,
          boxShadow: `0 0 0 4px ${theme.colors.primary}22`,
          flex: "none",
          marginTop: 7,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: theme.colors.textSecondary,
            margin: "0 0 3px",
          }}
        >
          {aviso.rotulo}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: theme.colors.textPrimary, lineHeight: 1.5 }}>{aviso.texto}</p>
        <p style={{ fontSize: 11.5, color: theme.colors.textSecondary, margin: "5px 0 0", lineHeight: 1.45 }}>
          {aviso.justificativa}
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <button
            style={botaoGhost}
            onClick={() => {
              onAcao("Marcado como visto");
              avancar();
            }}
          >
            Marcar como visto
          </button>
          <button
            style={{ ...botaoGhost, background: "transparent" }}
            onClick={avancar}
          >
            Depois
          </button>
        </div>
      </div>
      {avisos.length > 1 && (
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: theme.colors.textSecondary,
            flex: "none",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {indice + 1}/{avisos.length}
        </span>
      )}
    </div>
  );
}
