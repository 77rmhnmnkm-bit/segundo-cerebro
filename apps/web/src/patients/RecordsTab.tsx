import { useEffect, useState, type FormEvent } from "react";
import type { MedicalRecord } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { createMedicalRecord, deleteMedicalRecord, listMedicalRecords } from "../api";
import { VoiceButton } from "../VoiceButton";

export function RecordsTab({ patientId }: { patientId: string }) {
  const { theme } = useTheme();
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [text, setText] = useState("");
  const [nextSteps, setNextSteps] = useState("");

  async function refresh() {
    const { records } = await listMedicalRecords(patientId);
    setRecords(records);
  }

  useEffect(() => {
    refresh();
  }, [patientId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await createMedicalRecord(patientId, text.trim(), nextSteps.trim() || undefined);
    setText("");
    setNextSteps("");
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta anotação de evolução? A exclusão fica registrada no histórico do paciente.")) return;
    await deleteMedicalRecord(id);
    refresh();
  }

  return (
    <div>
      <form onSubmit={handleAdd} style={{ ...glassSurface(theme), padding: theme.spacing.md, marginBottom: theme.spacing.lg, display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>Procedimento realizado</span>
            <VoiceButton onTranscribed={(transcribed) => setText((prev) => (prev ? `${prev} ${transcribed}` : transcribed))} />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Registrar evolução do atendimento de hoje..."
            rows={3}
            style={{
              background: theme.mode === "light" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${theme.glass.borderSoft}`,
              borderRadius: theme.radius.sm,
              padding: theme.spacing.sm,
              fontSize: theme.typography.sizes.sm,
              color: theme.colors.textPrimary,
              outline: "none",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
            Procedimento para a próxima consulta (opcional)
          </span>
          <textarea
            value={nextSteps}
            onChange={(e) => setNextSteps(e.target.value)}
            rows={2}
            style={{
              background: theme.mode === "light" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${theme.glass.borderSoft}`,
              borderRadius: theme.radius.sm,
              padding: theme.spacing.sm,
              fontSize: theme.typography.sizes.sm,
              color: theme.colors.textPrimary,
              outline: "none",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </label>

        <button
          type="submit"
          style={{
            alignSelf: "flex-end",
            background: theme.colors.primary,
            color: theme.colors.onPrimary,
            border: "none",
            borderRadius: theme.radius.sm,
            padding: `${theme.spacing.xs + 2}px ${theme.spacing.md}px`,
            fontSize: theme.typography.sizes.sm,
            cursor: "pointer",
          }}
        >
          Registrar
        </button>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {records.length === 0 && (
          <div style={{ color: theme.colors.textSecondary, textAlign: "center" }}>Nenhuma evolução registrada ainda.</div>
        )}
        {records.map((r) => (
          <div key={r.id} style={{ ...glassSurface(theme), padding: theme.spacing.md }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
                {new Date(r.created_at).toLocaleString("pt-BR")}
              </span>
              <button
                onClick={() => handleDelete(r.id)}
                title="Excluir"
                style={{ background: "none", border: "none", color: theme.colors.danger, cursor: "pointer", fontSize: theme.typography.sizes.sm }}
              >
                🗑
              </button>
            </div>
            <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, whiteSpace: "pre-wrap" }}>
              {r.content}
            </div>
            {r.next_steps && (
              <div
                style={{
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: `1px solid ${theme.glass.borderSoft}`,
                  fontSize: theme.typography.sizes.xs,
                  color: theme.colors.textSecondary,
                }}
              >
                <strong style={{ color: theme.colors.textPrimary }}>Próxima consulta:</strong> {r.next_steps}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
