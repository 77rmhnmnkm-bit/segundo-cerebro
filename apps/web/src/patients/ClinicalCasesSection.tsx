import { useEffect, useState } from "react";
import type { ClinicalCase } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { GlassModal } from "../GlassModal";
import { TextField, PrimaryButton } from "../FormField";
import { createClinicalCase, deleteClinicalCase, getSetting, listClinicalCases } from "../api";

export function ClinicalCasesSection({ patientId }: { patientId: string }) {
  const { theme } = useTheme();
  const [cases, setCases] = useState<ClinicalCase[]>([]);
  const [supervisorEnabled, setSupervisorEnabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [supervisorName, setSupervisorName] = useState("");

  async function refresh() {
    const { cases } = await listClinicalCases(patientId);
    setCases(cases);
  }

  useEffect(() => {
    refresh();
    getSetting("supervisor_confirmation_enabled")
      .then(({ setting }) => setSupervisorEnabled(Boolean(setting.value)))
      .catch(() => setSupervisorEnabled(false));
  }, [patientId]);

  async function handleAdd() {
    if (!title.trim()) return;
    await createClinicalCase(patientId, {
      title: title.trim(),
      description: description || undefined,
      hours: hours ? Number(hours) : undefined,
      supervisorName: supervisorEnabled && supervisorName ? supervisorName : undefined,
    });
    setTitle("");
    setDescription("");
    setHours("");
    setSupervisorName("");
    setShowForm(false);
    refresh();
  }

  async function handleDelete(id: string) {
    await deleteClinicalCase(id);
    refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: theme.spacing.sm }}>
        <span style={{ fontSize: theme.typography.sizes.lg, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
          Casos Clínicos
        </span>
        <button onClick={() => setShowForm(true)} style={{ background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.sm, cursor: "pointer" }}>
          + Novo caso
        </button>
      </div>

      {cases.length === 0 && (
        <div style={{ ...glassSurface(theme), padding: theme.spacing.md, color: theme.colors.textSecondary, textAlign: "center" }}>
          Nenhum caso clínico registrado.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {cases.map((c) => (
          <div key={c.id} style={{ ...glassSurface(theme), padding: theme.spacing.md, display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.medium, color: theme.colors.textPrimary }}>{c.title}</div>
              <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
                {c.procedure_name ? `${c.procedure_name} · ` : ""}
                {c.hours ? `${c.hours}h · ` : ""}
                {new Date(c.created_at).toLocaleDateString("pt-BR")}
                {c.supervisor_name ? ` · Prof. ${c.supervisor_name}` : ""}
              </div>
              {c.description && <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginTop: 2 }}>{c.description}</div>}
            </div>
            <button onClick={() => handleDelete(c.id)} style={{ background: "none", border: "none", color: theme.colors.textSecondary, cursor: "pointer" }}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {showForm && (
        <GlassModal title="Novo caso clínico" onClose={() => setShowForm(false)}>
          <TextField label="Título" value={title} onChange={setTitle} required />
          <TextField label="Descrição" value={description} onChange={setDescription} />
          <TextField label="Carga horária (h)" type="number" value={hours} onChange={setHours} />
          {supervisorEnabled && (
            <TextField label="Professor supervisor" value={supervisorName} onChange={setSupervisorName} />
          )}
          <PrimaryButton onClick={handleAdd} disabled={!title.trim()}>
            Registrar
          </PrimaryButton>
        </GlassModal>
      )}
    </div>
  );
}
