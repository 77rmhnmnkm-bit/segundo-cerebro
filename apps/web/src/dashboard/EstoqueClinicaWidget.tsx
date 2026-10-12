import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { EstoqueContagens } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { getEstoqueContagens } from "../api";

// Antes o Estoque da Clínica Escola só existia se o usuário clicasse no
// atalho de módulo e navegasse até /estoque — os números urgentes (vencidos
// com saldo físico, fila de conferência) ficavam invisíveis no painel
// principal. Este widget traz esse resumo pro dashboard, com o mesmo dado
// que alimenta o banner "conferir agora" dentro da tela.
export function EstoqueClinicaWidget() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [c, setC] = useState<EstoqueContagens | null>(null);

  useEffect(() => {
    getEstoqueContagens().then(setC).catch(() => setC(null));
  }, []);

  const urgente = c && c.vencidosComEstoque > 0;

  return (
    <div
      onClick={() => navigate("/estoque")}
      style={{ ...glassSurface(theme), padding: theme.spacing.lg, cursor: "pointer", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            background: urgente ? theme.colors.danger : theme.colors.categoryAcademico,
            boxShadow: `0 0 0 6px ${(urgente ? theme.colors.danger : theme.colors.categoryAcademico)}22`,
          }}
        />
        <div style={{ fontSize: theme.typography.sizes.lg, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
          Estoque da Clínica
        </div>
      </div>

      {!c ? (
        <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Carregando…</div>
      ) : (
        <>
          {urgente && (
            <div style={{ color: theme.colors.danger, fontSize: theme.typography.sizes.sm, fontWeight: 600 }}>
              ⚠ {c.vencidosComEstoque} vencido{c.vencidosComEstoque === 1 ? "" : "s"} ainda com estoque físico
            </div>
          )}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>
            <span>
              <strong style={{ color: theme.colors.textPrimary }}>{c.estoque}</strong> em estoque
            </span>
            <span>
              <strong style={{ color: theme.colors.textPrimary }}>{c.conferencia}</strong> para conferir
            </span>
            <span>
              <strong style={{ color: theme.colors.textPrimary }}>{c.comprar}</strong> pra comprar
            </span>
          </div>
        </>
      )}
    </div>
  );
}
