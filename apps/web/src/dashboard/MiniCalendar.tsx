import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CalendarEvent, EventCategory } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { listEvents } from "../api";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function MiniCalendar() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const today = new Date();

  useEffect(() => {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const to = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
    listEvents({ from: from.toISOString(), to: to.toISOString() }).then(({ events }) => setEvents(events));
  }, []);

  function categoryColor(category: EventCategory) {
    if (category === "atendimento_paciente") return theme.colors.categoryAtendimento;
    if (category === "pessoal") return theme.colors.categoryPessoal;
    return theme.colors.categoryAcademico;
  }

  const eventsByDay = useMemo(() => {
    const map = new Map<number, EventCategory[]>();
    for (const event of events) {
      const d = new Date(event.start_at).getDate();
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(event.category);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result: (number | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(d);
    return result;
  }, []);

  return (
    <div style={{ ...glassSurface(theme), padding: theme.spacing.lg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: theme.spacing.sm }}>
        <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
          {today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </div>
        <button
          onClick={() => navigate("/agenda")}
          style={{ background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.xs, cursor: "pointer" }}
        >
          Ver agenda →
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
            {label}
          </div>
        ))}
        {cells.map((day, i) => {
          const isToday = day === today.getDate();
          const categories = day ? eventsByDay.get(day) : undefined;
          return (
            <div
              key={i}
              onClick={() => day && navigate("/agenda")}
              style={{
                aspectRatio: "1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: theme.radius.sm,
                background: isToday ? theme.colors.primary : "transparent",
                color: isToday ? theme.colors.onPrimary : day ? theme.colors.textPrimary : "transparent",
                fontSize: theme.typography.sizes.xs,
                cursor: day ? "pointer" : "default",
              }}
            >
              <span>{day ?? ""}</span>
              {categories && categories.length > 0 && (
                <div style={{ display: "flex", gap: 2, marginTop: 1 }}>
                  {Array.from(new Set(categories))
                    .slice(0, 3)
                    .map((cat) => (
                      <span
                        key={cat}
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 999,
                          background: isToday ? theme.colors.onPrimary : categoryColor(cat),
                        }}
                      />
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
