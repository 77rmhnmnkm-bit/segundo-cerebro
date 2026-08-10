import { useEffect, useState } from "react";
import type { OdontogramEntry, Patient, ToothFace, ToothStatus } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { GlassModal } from "../GlassModal";
import { TextField, SelectField, PrimaryButton } from "../FormField";
import { createOdontogramEntry, deleteOdontogramEntry, listOdontogram } from "../api";
import { Tooth, faceLabel } from "./Tooth";
import { PatientPrintModal } from "./PatientPrint";

const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const TOOTH_SEQUENCE = [...UPPER_TEETH, ...LOWER_TEETH];
const ALL_FACES: ToothFace[] = ["vestibular", "lingual", "mesial", "distal", "oclusal"];

const STATUS_LABEL: Record<ToothStatus, string> = {
  saudavel: "Saudável",
  carie: "Cárie",
  restaurado: "Restaurado",
  ausente: "Ausente",
  implante: "Implante",
  endodontia: "Endodontia",
};

export function OdontogramTab({ patient }: { patient: Patient }) {
  const { theme } = useTheme();
  const patientId = patient.id;
  const [entries, setEntries] = useState<OdontogramEntry[]>([]);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [face, setFace] = useState<ToothFace | "">("");
  const [status, setStatus] = useState<ToothStatus>("saudavel");
  const [procedureName, setProcedureName] = useState("");
  const [material, setMaterial] = useState("");
  const [printing, setPrinting] = useState(false);

  async function refresh() {
    const { entries } = await listOdontogram(patientId);
    setEntries(entries);
  }

  useEffect(() => {
    refresh();
  }, [patientId]);

  function entriesForTooth(tooth: number) {
    return entries.filter((e) => e.tooth_number === tooth);
  }

  function handleSelect(tooth: number, clickedFace?: ToothFace) {
    setSelectedTooth(tooth);
    setFace(clickedFace ?? "");
  }

  async function handleAdd() {
    if (!selectedTooth || !procedureName.trim()) return;
    await createOdontogramEntry(patientId, {
      toothNumber: selectedTooth,
      face: face || undefined,
      procedureName: procedureName.trim(),
      material: material || undefined,
      status,
    });
    await refresh();

    // Charting flow: confirming a tooth jumps straight to the next one in
    // sequence instead of closing, so a full-mouth pass doesn't need
    // reopening each tooth by hand.
    const currentIndex = TOOTH_SEQUENCE.indexOf(selectedTooth);
    const nextTooth = TOOTH_SEQUENCE[currentIndex + 1];

    setFace("");
    setStatus("saudavel");
    setProcedureName("");
    setMaterial("");
    setSelectedTooth(nextTooth ?? null);
  }

  async function handleDelete(id: string) {
    await deleteOdontogramEntry(id);
    refresh();
  }

  const sortedEntries = [...entries].sort((a, b) => a.tooth_number - b.tooth_number || new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());

  return (
    <div>
      <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, marginBottom: theme.spacing.lg }}>
        <div style={{ display: "flex", gap: theme.spacing.md, marginBottom: theme.spacing.lg, flexWrap: "wrap" }}>
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <Legend key={key} status={key as ToothStatus} label={label} />
          ))}
        </div>

        <ToothRow teeth={UPPER_TEETH} entriesForTooth={entriesForTooth} onSelect={handleSelect} />
        <div style={{ height: theme.spacing.lg }} />
        <ToothRow teeth={LOWER_TEETH} entriesForTooth={entriesForTooth} onSelect={handleSelect} />
      </div>

      <div style={{ ...glassSurface(theme), padding: theme.spacing.lg }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: theme.spacing.sm }}>
          <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
            Laudo — tudo registrado no odontograma
          </div>
          {sortedEntries.length > 0 && (
            <button
              onClick={() => setPrinting(true)}
              style={{ background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.xs, cursor: "pointer" }}
            >
              Imprimir odontograma
            </button>
          )}
        </div>
        {sortedEntries.length === 0 ? (
          <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Nenhum registro ainda.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sortedEntries.map((e) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: theme.typography.sizes.sm,
                  borderBottom: `1px solid ${theme.glass.borderSoft}`,
                  paddingBottom: 4,
                }}
              >
                <span style={{ color: theme.colors.textPrimary }}>
                  <strong>Dente {e.tooth_number}</strong> · {e.face ? faceLabel(e.tooth_number, e.face as ToothFace) : "dente todo"} —{" "}
                  {STATUS_LABEL[e.status]} — {e.procedure_name} {e.material ? `(${e.material})` : ""}
                </span>
                <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
                  {new Date(e.recorded_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginTop: theme.spacing.sm }}>
          Cada registro também aparece como etapa na aba Tratamento — edite ou remova livremente por lá.
        </div>
      </div>

      {selectedTooth && (
        <GlassModal
          title={`Dente ${selectedTooth}${face ? ` · ${faceLabel(selectedTooth, face)}` : ""}`}
          onClose={() => {
            setSelectedTooth(null);
            setFace("");
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: theme.spacing.sm }}>
            {entriesForTooth(selectedTooth).length === 0 && (
              <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>
                Nenhum procedimento registrado.
              </div>
            )}
            {entriesForTooth(selectedTooth).map((e) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: theme.typography.sizes.sm,
                  color: theme.colors.textPrimary,
                  borderBottom: `1px solid ${theme.glass.borderSoft}`,
                  paddingBottom: 4,
                }}
              >
                <span>
                  {STATUS_LABEL[e.status]} {e.face ? `· ${faceLabel(selectedTooth, e.face as ToothFace)}` : "· dente todo"} —{" "}
                  {e.procedure_name} {e.material ? `(${e.material})` : ""} —{" "}
                  {new Date(e.recorded_at).toLocaleDateString("pt-BR")}
                </span>
                <button
                  onClick={() => handleDelete(e.id)}
                  style={{ background: "none", border: "none", color: theme.colors.textSecondary, cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <SelectField
            label="Status"
            value={status}
            onChange={setStatus}
            options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value: value as ToothStatus, label }))}
          />
          <SelectField
            label="Face (em branco = dente todo)"
            value={face}
            onChange={setFace}
            options={[
              { value: "", label: "Dente todo" },
              ...ALL_FACES.map((f) => ({ value: f, label: faceLabel(selectedTooth, f) })),
            ]}
          />
          <TextField label="Procedimento" value={procedureName} onChange={setProcedureName} required />
          <TextField label="Material (opcional)" value={material} onChange={setMaterial} placeholder="resina, amálgama..." />
          <PrimaryButton onClick={handleAdd} disabled={!procedureName.trim()}>
            Adicionar
          </PrimaryButton>
        </GlassModal>
      )}

      {printing && (
        <PatientPrintModal patient={patient} title="Odontograma" onClose={() => setPrinting(false)}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #999" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Dente</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Face</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Status</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Procedimento</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Data</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "6px 8px" }}>{e.tooth_number}</td>
                  <td style={{ padding: "6px 8px" }}>{e.face ? faceLabel(e.tooth_number, e.face as ToothFace) : "Dente todo"}</td>
                  <td style={{ padding: "6px 8px" }}>{STATUS_LABEL[e.status]}</td>
                  <td style={{ padding: "6px 8px" }}>
                    {e.procedure_name} {e.material ? `(${e.material})` : ""}
                  </td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{new Date(e.recorded_at).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PatientPrintModal>
      )}
    </div>
  );
}

function Legend({ status, label }: { status: ToothStatus; label: string }) {
  const { theme } = useTheme();
  const color: Record<ToothStatus, string> = {
    saudavel: theme.glass.borderSoft,
    carie: "#6B3B2A",
    restaurado: "#3D7BD9",
    ausente: "#9C9A95",
    implante: "#5C6470",
    endodontia: "#7B5EA7",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color[status], border: `1px solid ${theme.glass.borderSoft}` }} />
      {label}
    </div>
  );
}

function ToothRow({
  teeth,
  entriesForTooth,
  onSelect,
}: {
  teeth: number[];
  entriesForTooth: (tooth: number) => OdontogramEntry[];
  onSelect: (tooth: number, face?: ToothFace) => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
      {teeth.map((tooth) => (
        <Tooth key={tooth} number={tooth} entries={entriesForTooth(tooth)} onSelect={onSelect} />
      ))}
    </div>
  );
}
