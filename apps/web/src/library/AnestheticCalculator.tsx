import { useEffect, useState } from "react";
import type { Drug, Patient } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { SelectField, TextField } from "../FormField";
import { listDrugs, listPatients, getSetting, putSetting, createDoseCalculation } from "../api";

function tubeteMg(concentration: string | null): number | null {
  if (!concentration) return null;
  const percent = parseFloat(concentration.replace("%", "").replace(",", "."));
  if (Number.isNaN(percent)) return null;
  const mgPerMl = percent * 10;
  return mgPerMl * 1.8; // standard 1.8ml carpule/tubete
}

export function AnestheticCalculator() {
  const { theme } = useTheme();
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [drugId, setDrugId] = useState("");
  const [weight, setWeight] = useState("");
  const [isPediatric, setIsPediatric] = useState(false);
  const [comorbidities, setComorbidities] = useState("");
  const [teacherMode, setTeacherMode] = useState(true);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientId, setPatientId] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    listDrugs("anestesico").then(({ drugs }) => setDrugs(drugs));
    getSetting("teacher_mode_enabled")
      .then(({ setting }) => setTeacherMode(setting.value !== false))
      .catch(() => setTeacherMode(true));
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (patientSearch.trim()) listPatients(patientSearch.trim()).then(({ patients }) => setPatients(patients));
      else setPatients([]);
    }, 250);
    return () => clearTimeout(handle);
  }, [patientSearch]);

  const drug = drugs.find((d) => d.id === drugId);
  const weightNum = Number(weight);
  const maxByWeight = drug?.max_dose_mg_kg && weightNum ? Number(drug.max_dose_mg_kg) * weightNum : null;
  const maxAbsolute = drug?.max_absolute_mg ? Number(drug.max_absolute_mg) : null;
  const limitedByAbsolute = maxByWeight !== null && maxAbsolute !== null && maxByWeight > maxAbsolute;
  const maxDoseMg = maxByWeight !== null && maxAbsolute !== null ? Math.min(maxByWeight, maxAbsolute) : maxByWeight ?? maxAbsolute;
  const mgPerTubete = drug ? tubeteMg(drug.default_concentration) : null;
  const maxTubetes = maxDoseMg !== null && mgPerTubete ? maxDoseMg / mgPerTubete : null;

  async function handleSave() {
    if (!patientId || !drugId || !maxDoseMg) return;
    await createDoseCalculation(patientId, {
      drugId,
      weightKg: weightNum,
      isPediatric,
      comorbidities: comorbidities.trim() || undefined,
      maxDoseMg,
      maxUnits: maxTubetes ?? undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, display: "flex", flexDirection: "column", gap: theme.spacing.md, maxWidth: 520 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
          Calculadora de anestésico
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={teacherMode}
            onChange={(e) => {
              setTeacherMode(e.target.checked);
              putSetting("teacher_mode_enabled", e.target.checked);
            }}
            style={{ accentColor: theme.colors.primary }}
          />
          Modo professora
        </label>
      </div>

      <SelectField
        label="Anestésico"
        value={drugId}
        onChange={setDrugId}
        options={[{ value: "", label: "Selecione..." }, ...drugs.map((d) => ({ value: d.id, label: d.name }))]}
      />
      <TextField label="Peso do paciente (kg)" type="number" value={weight} onChange={setWeight} />

      <div style={{ display: "flex", gap: theme.spacing.md }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, cursor: "pointer" }}>
          <input type="checkbox" checked={isPediatric} onChange={(e) => setIsPediatric(e.target.checked)} style={{ accentColor: theme.colors.primary }} />
          Paciente infantil
        </label>
      </div>

      <TextField
        label="Comorbidades (opcional)"
        value={comorbidities}
        onChange={setComorbidities}
        placeholder="Ex: cardiopatia, hepatopatia, gestante..."
        voice
      />
      {comorbidities.trim() && (
        <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.warning }}>
          Comorbidades podem exigir redução de dose ou troca de fármaco — este cálculo não ajusta isso
          automaticamente. Avalie clinicamente antes de aplicar.
        </div>
      )}
      {isPediatric && (
        <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.warning }}>
          Em crianças, considere também a colaboração e o volume de tecido — a dose máxima por peso é só um teto
          de segurança, não uma recomendação de quanto usar.
        </div>
      )}

      {drug && (
        <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>{drug.dose_description}</div>
      )}

      {teacherMode && drug && weightNum > 0 && (
        <div
          style={{
            ...glassSurface(theme, { radius: theme.radius.md }),
            padding: theme.spacing.md,
            fontSize: theme.typography.sizes.xs,
            color: theme.colors.textPrimary,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontFamily: "monospace",
          }}
        >
          <div>1. Dose máxima por peso = {drug.max_dose_mg_kg} mg/kg × {weightNum} kg = {maxByWeight?.toFixed(1)} mg</div>
          {maxAbsolute !== null && <div>2. Teto absoluto do fármaco = {maxAbsolute} mg</div>}
          <div>
            3. Dose máxima a usar = menor valor entre os dois = <strong>{maxDoseMg?.toFixed(1)} mg</strong>
            {limitedByAbsolute ? " (limitado pelo teto absoluto)" : " (limitado pelo peso)"}
          </div>
          {mgPerTubete && (
            <div>
              4. Cada tubete de {drug.default_concentration} tem {mgPerTubete.toFixed(1)} mg → {maxDoseMg?.toFixed(1)} ÷{" "}
              {mgPerTubete.toFixed(1)} = <strong>{maxTubetes?.toFixed(1)} tubetes</strong>
            </div>
          )}
        </div>
      )}

      {maxDoseMg !== null && (
        <div
          style={{
            ...glassSurface(theme, { strong: true, radius: theme.radius.md }),
            padding: theme.spacing.md,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontSize: theme.typography.sizes.lg, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary }}>
            Dose máxima: {maxDoseMg.toFixed(0)} mg
          </div>
          {maxTubetes !== null && (
            <div style={{ fontSize: theme.typography.sizes.md, color: theme.colors.textPrimary }}>
              ≈ {maxTubetes.toFixed(1)} tubetes de 1,8 ml ({drug?.default_concentration})
            </div>
          )}
          {limitedByAbsolute && (
            <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.warning }}>
              Limitado pelo teto absoluto ({maxAbsolute} mg), não pelo peso.
            </div>
          )}
        </div>
      )}

      {drug && (
        <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, borderTop: `1px solid ${theme.glass.borderSoft}`, paddingTop: theme.spacing.sm }}>
          Fonte: {drug.source} ({new Date(drug.source_date).toLocaleDateString("pt-BR")}). Apoio à decisão clínica —
          confirme sempre com seu próprio julgamento profissional antes de aplicar. Não substitui avaliação do
          paciente (saúde sistêmica, idade, medicações em uso).
        </div>
      )}

      {maxDoseMg !== null && drug && (
        <div style={{ borderTop: `1px solid ${theme.glass.borderSoft}`, paddingTop: theme.spacing.sm, display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
          <TextField label="Salvar no prontuário de" value={patientSearch} onChange={setPatientSearch} placeholder="Buscar paciente..." />
          {patients.length > 0 && (
            <SelectField
              label="Paciente"
              value={patientId}
              onChange={setPatientId}
              options={[{ value: "", label: "Selecione..." }, ...patients.map((p) => ({ value: p.id, label: p.name }))]}
            />
          )}
          <button
            onClick={handleSave}
            disabled={!patientId}
            style={{
              padding: "8px 16px",
              borderRadius: theme.radius.md,
              border: "none",
              background: patientId ? theme.colors.primary : theme.glass.borderSoft,
              color: "#fff",
              cursor: patientId ? "pointer" : "not-allowed",
              fontSize: theme.typography.sizes.sm,
            }}
          >
            {saved ? "Salvo ✓" : "Salvar cálculo no prontuário"}
          </button>
        </div>
      )}
    </div>
  );
}
