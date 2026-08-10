import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RecallSchedule } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { listUpcomingRecalls } from "../api";

export function RecallsWidget() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [recalls, setRecalls] = useState<RecallSchedule[]>([]);

  useEffect(() => {
    listUpcomingRecalls(30).then(({ recalls }) => setRecalls(recalls));
  }, []);

  if (recalls.length === 0) return null;

  return (
    <div style={{ ...glassSurface(theme), padding: theme.spacing.lg }}>
      <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }}>
        Retornos próximos
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {recalls.map((r) => {
          const overdue = new Date(r.due_date) < new Date();
          return (
            <div
              key={r.id}
              onClick={() => navigate(`/pacientes/${r.patient_id}`)}
              style={{ display: "flex", justifyContent: "space-between", fontSize: theme.typography.sizes.sm, cursor: "pointer" }}
            >
              <span style={{ color: theme.colors.textPrimary }}>
                {r.patient_name} <span style={{ color: theme.colors.textSecondary }}>· {r.recall_type}</span>
              </span>
              <span style={{ color: overdue ? theme.colors.danger : theme.colors.textSecondary, fontSize: theme.typography.sizes.xs }}>
                {new Date(r.due_date).toLocaleDateString("pt-BR")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
