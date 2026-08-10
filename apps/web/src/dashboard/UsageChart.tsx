import { useEffect, useState } from "react";
import type { InventoryUsageDay } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { getInventoryUsageSummary } from "../api";

export function UsageChart() {
  const { theme } = useTheme();
  const [days, setDays] = useState<InventoryUsageDay[]>([]);

  useEffect(() => {
    getInventoryUsageSummary(14).then(({ days }) => setDays(days));
  }, []);

  const max = Math.max(1, ...days.map((d) => Math.max(Number(d.entradas), Number(d.saidas))));
  const totalSaidas = days.reduce((sum, d) => sum + Number(d.saidas), 0);
  const chartHeight = 90;

  return (
    <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: theme.spacing.sm }}>
        <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>Uso de materiais</div>
        <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>{totalSaidas} saídas / 14 dias</div>
      </div>

      {/* Bars grow upward, so the whole chart block sits at the bottom of
          the card — anything above is just blank air, which reads more
          natural than the chart floating near the top with empty space below. */}
      <div style={{ marginTop: "auto" }}>
        {days.length === 0 ? (
          <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Sem movimentações ainda.</div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: chartHeight }}>
          {days.map((d) => {
            const entradaH = (Number(d.entradas) / max) * chartHeight;
            const saidaH = (Number(d.saidas) / max) * chartHeight;
            const dayNum = new Date(d.date).getDate();
            return (
              <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: chartHeight, width: "100%" }}>
                  <div
                    title={`${dayNum}: ${d.entradas} entradas`}
                    style={{
                      flex: 1,
                      height: Math.max(entradaH, 2),
                      background: theme.colors.primary,
                      borderRadius: 2,
                      opacity: 0.8,
                    }}
                  />
                  <div
                    title={`${dayNum}: ${d.saidas} saídas`}
                    style={{
                      flex: 1,
                      height: Math.max(saidaH, 2),
                      background: theme.colors.categoryAcademico,
                      borderRadius: 2,
                    }}
                  />
                </div>
                <span style={{ fontSize: 9, color: theme.colors.textSecondary }}>{dayNum}</span>
              </div>
            );
          })}
          </div>
        )}

        <div style={{ display: "flex", gap: theme.spacing.md, marginTop: theme.spacing.sm, fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
          <Legend color={theme.colors.primary} label="Entradas" />
          <Legend color={theme.colors.categoryAcademico} label="Saídas" />
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      {label}
    </div>
  );
}
