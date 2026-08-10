import { useEffect, useState } from "react";
import type { RecallSchedule } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { GlassModal } from "../GlassModal";
import { TextField, PrimaryButton } from "../FormField";
import { createRecall, deleteRecall, listRecalls, setRecallCompleted } from "../api";

export function RecallSection({ patientId }: { patientId: string }) {
  const { theme } = useTheme();
  const [recalls, setRecalls] = useState<RecallSchedule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [recallType, setRecallType] = useState("");
  const [dueDate, setDueDate] = useState("");

  async function refresh() {
    const { recalls } = await listRecalls(patientId);
    setRecalls(recalls);
  }

  useEffect(() => {
    refresh();
  }, [patientId]);

  async function handleAdd() {
    if (!recallType.trim() || !dueDate) return;
    await createRecall(patientId, { recallType: recallType.trim(), dueDate });
    setRecallType("");
    setDueDate("");
    setShowForm(false);
    refresh();
  }

  async function toggle(recall: RecallSchedule) {
    await setRecallCompleted(recall.id, !recall.completed);
    refresh();
  }

  async function remove(id: string) {
    await deleteRecall(id);
    refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: theme.spacing.sm }}>
        <span style={{ fontSize: theme.typography.sizes.lg, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
          Retornos (Recall)
        </span>
        <button onClick={() => setShowForm(true)} style={{ background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.sm, cursor: "pointer" }}>
          + Novo retorno
        </button>
      </div>

      {recalls.length === 0 && (
        <div style={{ ...glassSurface(theme), padding: theme.spacing.md, color: theme.colors.textSecondary, textAlign: "center" }}>
          Nenhum retorno agendado.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {recalls.map((r) => {
          const overdue = !r.completed && new Date(r.due_date) < new Date();
          return (
            <div key={r.id} style={{ ...glassSurface(theme), padding: theme.spacing.md, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.sm }}>
                <input type="checkbox" checked={r.completed} onChange={() => toggle(r)} style={{ accentColor: theme.colors.primary }} />
                <div>
                  <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, textDecoration: r.completed ? "line-through" : "none" }}>
                    {r.recall_type}
                  </div>
                  <div style={{ fontSize: theme.typography.sizes.xs, color: overdue ? theme.colors.danger : theme.colors.textSecondary }}>
                    {new Date(r.due_date).toLocaleDateString("pt-BR")} {overdue ? "(atrasado)" : ""}
                  </div>
                </div>
              </div>
              <button onClick={() => remove(r.id)} style={{ background: "none", border: "none", color: theme.colors.textSecondary, cursor: "pointer" }}>
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {showForm && (
        <GlassModal title="Novo retorno" onClose={() => setShowForm(false)}>
          <TextField label="Tipo de retorno" value={recallType} onChange={setRecallType} placeholder="Profilaxia, manutenção..." required />
          <TextField label="Data prevista" type="date" value={dueDate} onChange={setDueDate} required />
          <PrimaryButton onClick={handleAdd} disabled={!recallType.trim() || !dueDate}>
            Agendar
          </PrimaryButton>
        </GlassModal>
      )}
    </div>
  );
}
