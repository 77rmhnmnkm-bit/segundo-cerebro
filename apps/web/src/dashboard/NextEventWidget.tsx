import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CalendarEvent, EventCategory } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { getNextEventBriefing } from "../api";

export function NextEventWidget() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNextEventBriefing()
      .then(({ event, tip }) => {
        setEvent(event);
        setTip(tip);
      })
      .finally(() => setLoading(false));
  }, []);

  function categoryColor(category: EventCategory) {
    if (category === "atendimento_paciente") return theme.colors.categoryAtendimento;
    if (category === "pessoal") return theme.colors.categoryPessoal;
    return theme.colors.categoryAcademico;
  }

  if (loading) return null;

  return (
    <div
      onClick={() => navigate("/agenda")}
      style={{
        ...glassSurface(theme),
        padding: `${theme.spacing.md}px ${theme.spacing.lg}px`,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: theme.spacing.lg,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, whiteSpace: "nowrap" }}>
        Próximo compromisso
      </div>

      {!event ? (
        <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Nenhum compromisso futuro agendado.</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: categoryColor(event.category) }} />
            <span style={{ fontWeight: theme.typography.weights.medium, color: theme.colors.textPrimary, fontSize: theme.typography.sizes.sm }}>
              {event.title}
            </span>
            <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
              {new Date(event.start_at).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {event.location_text ? ` · ${event.location_text}` : ""}
            </span>
          </div>

          {tip && (
            <div
              style={{
                flex: 1,
                minWidth: 200,
                fontSize: theme.typography.sizes.xs,
                color: theme.colors.textPrimary,
                borderLeft: `1px solid ${theme.glass.borderSoft}`,
                paddingLeft: theme.spacing.md,
              }}
            >
              <span style={{ color: theme.colors.primary }}>✦ </span>
              {tip}
            </div>
          )}
        </>
      )}
    </div>
  );
}
