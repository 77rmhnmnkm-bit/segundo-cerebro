import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Habit } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { TextField, PrimaryButton } from "../FormField";
import { listHabits, createHabit, toggleHabit, deleteHabit } from "../api";

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function last7(): { iso: string; label: string }[] {
  const days = ["D", "S", "T", "Q", "Q", "S", "S"];
  const out: { iso: string; label: string }[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 6);
  for (let i = 0; i < 7; i++) {
    out.push({ iso: localIso(d), label: days[d.getDay()] });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function HabitsScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const week = last7();

  async function refresh() {
    const { habits } = await listHabits();
    setHabits(habits);
  }
  useEffect(() => {
    refresh();
  }, []);

  async function add() {
    if (!name.trim()) return;
    await createHabit({ name: name.trim(), source: source.trim() || undefined });
    setName("");
    setSource("");
    refresh();
  }
  async function toggle(h: Habit, iso: string) {
    await toggleHabit(h.id, iso);
    refresh();
  }
  async function remove(h: Habit) {
    if (!confirm(`Remover o hábito "${h.name}"?`)) return;
    await deleteHabit(h.id);
    refresh();
  }

  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: theme.spacing.xl }}>
      <header
        style={{
          ...glassSurface(theme, { radius: theme.radius.lg }),
          display: "flex",
          alignItems: "center",
          gap: theme.spacing.md,
          padding: `${theme.spacing.md}px ${theme.spacing.lg}px`,
          marginBottom: theme.spacing.xl,
        }}
      >
        <button onClick={() => navigate("/")} aria-label="Voltar" style={{ border: "none", background: "transparent", color: theme.colors.textSecondary, fontSize: theme.typography.sizes.lg, cursor: "pointer" }}>
          ←
        </button>
        <div>
          <div style={{ fontSize: theme.typography.sizes.xl, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary }}>Hábitos</div>
          <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Rotinas baseadas em ciência — marque cada dia, mantenha a sequência.</div>
        </div>
      </header>

      <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, marginBottom: theme.spacing.lg, display: "flex", gap: theme.spacing.sm, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 220px" }}>
          <TextField label="Novo hábito" value={name} onChange={setName} placeholder="ex.: Meditar 10 min" />
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <TextField label="Fonte (opcional)" value={source} onChange={setSource} placeholder="ex.: OMS" />
        </div>
        <PrimaryButton onClick={add}>Adicionar</PrimaryButton>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.md }}>
        {habits.map((h) => {
          const logs = new Set(h.log_dates ?? []);
          return (
            <div key={h.id} style={{ ...glassSurface(theme, { radius: theme.radius.md }), padding: theme.spacing.lg }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: theme.spacing.md, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: theme.typography.sizes.md, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary }}>{h.name}</span>
                    {(h.streak ?? 0) > 0 && <span style={{ fontSize: 12, color: "#FF9500" }}>🔥 {h.streak}</span>}
                    <span style={{ fontSize: 11, color: theme.colors.textSecondary }}>{h.done_last_7 ?? 0}/7 na semana</span>
                  </div>
                  {h.rationale && <div style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 }}>{h.rationale}</div>}
                  {h.source && <div style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2, opacity: 0.8 }}>Fonte: {h.source}</div>}
                </div>
                <button onClick={() => remove(h)} title="Remover" style={{ border: "none", background: "transparent", color: theme.colors.textSecondary, cursor: "pointer" }}>✕</button>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: theme.spacing.md }}>
                {week.map((d) => {
                  const done = logs.has(d.iso);
                  const isToday = d.iso === localIso(new Date());
                  return (
                    <button
                      key={d.iso}
                      onClick={() => toggle(h, d.iso)}
                      title={d.iso}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ fontSize: 10, color: theme.colors.textSecondary }}>{d.label}</span>
                      <span
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "50%",
                          background: done ? theme.colors.primary : "transparent",
                          border: `2px solid ${done ? theme.colors.primary : isToday ? theme.colors.textSecondary : theme.glass.borderSoft}`,
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 14,
                        }}
                      >
                        {done ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
