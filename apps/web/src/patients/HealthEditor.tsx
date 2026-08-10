import { useEffect, useState } from "react";
import { CONDITION_FLAGS } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { TextField, PrimaryButton } from "../FormField";
import { getPatientHealth, updatePatientHealth } from "../api";

const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

// Editor do perfil de saúde do paciente — alimenta o banner de alerta e a
// checagem de contraindicação no receituário.
export function HealthEditor({ patientId, onSaved }: { patientId: string; onSaved: () => void }) {
  const { theme } = useTheme();
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPatientHealth(patientId).then(({ health }) => {
      setAllergies((health.allergies ?? []).join(", "));
      setMedications((health.medications ?? []).join(", "));
      setConditions(health.conditions ?? []);
      setNotes(health.notes ?? "");
    });
  }, [patientId]);

  function toggle(key: string) {
    setConditions((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await updatePatientHealth(patientId, { allergies: toList(allergies), medications: toList(medications), conditions, notes: notes || undefined });
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, display: "flex", flexDirection: "column", gap: theme.spacing.md, maxWidth: 560 }}>
      <div style={{ fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary }}>Saúde e alertas</div>
      <TextField label="Alergias (separe por vírgula)" value={allergies} onChange={setAllergies} placeholder="ex.: penicilina, látex, dipirona" />
      <TextField label="Medicamentos em uso (vírgula)" value={medications} onChange={setMedications} placeholder="ex.: varfarina, losartana" />
      <div>
        <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }}>Condições de risco</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {CONDITION_FLAGS.map((f) => (
            <label key={f.key} title={f.implication} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.colors.textPrimary, cursor: "pointer" }}>
              <input type="checkbox" checked={conditions.includes(f.key)} onChange={() => toggle(f.key)} style={{ accentColor: f.severity === "alta" ? theme.colors.danger : "#FF9500" }} />
              {f.label}
            </label>
          ))}
        </div>
      </div>
      <TextField label="Observações de saúde" value={notes} onChange={setNotes} />
      <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.md }}>
        <PrimaryButton onClick={save}>{saving ? "Salvando..." : "Salvar saúde"}</PrimaryButton>
        {saved && <span style={{ color: theme.colors.primary, fontSize: theme.typography.sizes.sm }}>✓ Salvo</span>}
      </div>
    </div>
  );
}
