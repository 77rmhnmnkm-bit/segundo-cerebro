import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Drug, DrugCategory, DoseCalculation, InstructionTemplate, Patient, Prescription, SafetyWarning } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { SelectField, TextField, PrimaryButton } from "../FormField";
import {
  checkPrescriptionSafety,
  createPrescription,
  deleteDoseCalculation,
  deletePrescription,
  getSetting,
  listDoseCalculations,
  listDrugs,
  listInstructionTemplates,
  listPrescriptions,
  logAuditAction,
} from "../api";

const CATEGORY_LABELS: Record<DrugCategory, string> = {
  anestesico: "Anestésico",
  antibiotico: "Antibiótico",
  analgesico: "Analgésico",
  anti_inflamatorio: "Anti-inflamatório",
  ansiolitico: "Ansiolítico",
  corticoide: "Corticoide",
  outro: "Outro",
};

function quantityInWords(quantity: string): string | null {
  const n = Number(quantity.trim());
  if (!Number.isInteger(n) || n <= 0 || n > 999) return null;
  const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cem", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  if (n < 10) return units[n];
  if (n < 20) return teens[n - 10];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    return u ? `${tens[t]} e ${units[u]}` : tens[t];
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (rest === 0) return n === 100 ? "cem" : hundreds[h];
  return `${hundreds[h]} e ${quantityInWords(String(rest))}`;
}

export function DocumentsTab({ patient }: { patient: Patient }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.xl }}>
      <PrescriptionSection patient={patient} />
      <DoseCalculationsSection patient={patient} />
      <InstructionSection patient={patient} />
    </div>
  );
}

function PrescriptionSection({ patient }: { patient: Patient }) {
  const { theme } = useTheme();
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [drugId, setDrugId] = useState("");
  const [dosageText, setDosageText] = useState("");
  const [quantity, setQuantity] = useState("");
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [printing, setPrinting] = useState<Prescription | null>(null);
  const [warnings, setWarnings] = useState<SafetyWarning[]>([]);

  async function refresh() {
    const { prescriptions } = await listPrescriptions(patient.id);
    setPrescriptions(prescriptions);
  }

  useEffect(() => {
    listDrugs().then(({ drugs }) => setDrugs(drugs));
    refresh();
  }, [patient.id]);

  const filteredDrugs = useMemo(() => {
    return drugs.filter((d) => {
      if (categoryFilter && d.category !== categoryFilter) return false;
      if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [drugs, search, categoryFilter]);

  function handleDrugSelect(id: string) {
    setDrugId(id);
    const drug = drugs.find((d) => d.id === id);
    setDosageText(drug?.dose_description ?? "");
    setWarnings([]);
    if (id) checkPrescriptionSafety(patient.id, id).then(({ warnings }) => setWarnings(warnings)).catch(() => setWarnings([]));
  }

  async function handleSave() {
    if (!drugId || !dosageText.trim()) return;
    const { prescription } = await createPrescription(patient.id, { drugId, dosageText: dosageText.trim(), quantity: quantity || undefined });
    setDrugId("");
    setDosageText("");
    setQuantity("");
    await refresh();
    const drug = drugs.find((d) => d.id === drugId);
    setPrinting({ ...prescription, drug_name: drug?.name, standard_presentation: drug?.standard_presentation });
  }

  async function handleDelete(e: { stopPropagation: () => void }, prescriptionId: string) {
    e.stopPropagation();
    if (!confirm("Excluir este receituário? A exclusão fica registrada no histórico do paciente.")) return;
    await deletePrescription(prescriptionId);
    refresh();
  }

  const selectedDrug = drugs.find((d) => d.id === drugId);

  return (
    <div>
      <div style={{ fontSize: theme.typography.sizes.lg, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }}>
        Receituário
      </div>
      <div style={{ ...glassSurface(theme), padding: theme.spacing.md, display: "flex", flexDirection: "column", gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
        <div style={{ display: "flex", gap: theme.spacing.sm }}>
          <div style={{ flex: 1 }}>
            <TextField label="Buscar medicamento" value={search} onChange={setSearch} placeholder="Qualquer classe: anestésico, ansiolítico, antibiótico..." />
          </div>
          <div style={{ width: 180 }}>
            <SelectField
              label="Classe"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[{ value: "", label: "Todas" }, ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))]}
            />
          </div>
        </div>
        <SelectField
          label="Medicamento"
          value={drugId}
          onChange={handleDrugSelect}
          options={[{ value: "", label: "Selecione..." }, ...filteredDrugs.map((d) => ({ value: d.id, label: `${d.name} (${CATEGORY_LABELS[d.category]})` }))]}
        />
        {selectedDrug && (
          <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
            Fonte: {selectedDrug.source} ({new Date(selectedDrug.source_date).toLocaleDateString("pt-BR")}) ·{" "}
            <a
              href={`https://consultas.anvisa.gov.br/#/bulario/?nomeProduto=${encodeURIComponent(selectedDrug.active_ingredient)}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: theme.colors.primary }}
            >
              verificar bula oficial na ANVISA
            </a>
          </div>
        )}
        {warnings.length > 0 && (
          <div style={{ border: `1px solid ${theme.colors.danger}`, background: `${theme.colors.danger}12`, borderRadius: theme.radius.sm, padding: theme.spacing.sm }}>
            <div style={{ fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.bold, color: theme.colors.danger, marginBottom: 4 }}>
              ⚠ Atenção — alerta(s) de segurança para este paciente:
            </div>
            {warnings.map((w, i) => (
              <div key={i} style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textPrimary, marginBottom: 2 }}>
                • {w.text}{w.source && w.source !== "—" ? <span style={{ color: theme.colors.textSecondary }}> (Fonte: {w.source})</span> : null}
              </div>
            ))}
            <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginTop: 4 }}>
              Apoio à decisão — revise e decida clinicamente antes de prescrever.
            </div>
          </div>
        )}
        <TextField label="Posologia" value={dosageText} onChange={setDosageText} voice />
        <TextField label="Quantidade" value={quantity} onChange={setQuantity} placeholder="Ex: 10 (comprimidos), 1 (caixa)" />
        <PrimaryButton onClick={handleSave} disabled={!drugId || !dosageText.trim()}>
          Gerar receituário
        </PrimaryButton>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {prescriptions.map((p) => (
          <div key={p.id} onClick={() => setPrinting(p)} style={{ ...glassSurface(theme), padding: theme.spacing.sm, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary }}>{p.drug_name}</span>
            <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.sm }}>
              <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>{new Date(p.created_at).toLocaleDateString("pt-BR")}</span>
              <button
                onClick={(e) => handleDelete(e, p.id)}
                title="Excluir"
                style={{ background: "none", border: "none", color: theme.colors.danger, cursor: "pointer", fontSize: theme.typography.sizes.sm }}
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>

      {printing && <PrescriptionPrint onClose={() => setPrinting(null)} patient={patient} prescription={printing} />}
    </div>
  );
}

function PrescriptionPrint({ patient, prescription, onClose }: { patient: Patient; prescription: Prescription; onClose: () => void }) {
  const [professionalName, setProfessionalName] = useState("");
  const [professionalCro, setProfessionalCro] = useState("");

  useEffect(() => {
    Promise.all([getSetting("professional_name").catch(() => null), getSetting("professional_cro").catch(() => null)]).then(
      ([name, cro]) => {
        if (name) setProfessionalName(String(name.setting.value ?? ""));
        if (cro) setProfessionalCro(String(cro.setting.value ?? ""));
      },
    );
  }, []);

  const words = prescription.quantity ? quantityInWords(prescription.quantity) : null;

  async function handlePrint(purpose: "entrega" | "interno") {
    await logAuditAction(patient.id, {
      action: "impresso",
      entityType: "receituario",
      description: `Receituário impresso (${purpose === "entrega" ? "entregue ao paciente" : "armazenamento interno"}): ${prescription.drug_name}`,
    });
    window.print();
  }

  return createPortal(
    <div className="sc-print-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 2cm; }
          body * { visibility: hidden; }
          .sc-print-doc, .sc-print-doc * { visibility: visible; }
          .sc-print-doc { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none !important; }
          .sc-no-print { display: none !important; }
        }
      `}</style>
      <div
        className="sc-print-doc"
        style={{
          background: "#fff",
          color: "#1a1a1a",
          width: "21cm",
          minHeight: "29.7cm",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          padding: "2cm",
          fontFamily: "'Times New Roman', Georgia, serif",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ textAlign: "center", borderBottom: "2px solid #1a1a1a", paddingBottom: 16, marginBottom: 32 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>{professionalName || "Cirurgião(ã)-Dentista"}</div>
          <div style={{ fontSize: 14, color: "#444", marginTop: 4 }}>Cirurgião(ã)-Dentista{professionalCro ? ` — ${professionalCro}` : ""}</div>
        </div>

        <div style={{ fontSize: 14, marginBottom: 8 }}>
          <strong>Paciente:</strong> {patient.name}
        </div>
        <div style={{ fontSize: 14, marginBottom: 32 }}>
          <strong>Data:</strong> {new Date(prescription.created_at).toLocaleDateString("pt-BR")}
        </div>

        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Uso oral</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 16 }}>{prescription.drug_name}</div>
          {prescription.standard_presentation && <div style={{ fontSize: 14, color: "#444" }}>{prescription.standard_presentation}</div>}
          {prescription.quantity && (
            <div style={{ fontSize: 15, marginTop: 8 }}>
              Quantidade: {prescription.quantity}
              {words ? ` (${words})` : ""}
            </div>
          )}
          <div style={{ fontSize: 15, marginTop: 8, lineHeight: 1.6 }}>{prescription.dosage_text}</div>
        </div>

        <div style={{ marginTop: 64, textAlign: "center" }}>
          <div style={{ borderTop: "1px solid #1a1a1a", width: 320, margin: "0 auto" }} />
          <div style={{ fontSize: 13, marginTop: 6 }}>{professionalName || "Assinatura"}</div>
          {professionalCro && <div style={{ fontSize: 12, color: "#555" }}>{professionalCro}</div>}
        </div>

        <div className="sc-no-print" style={{ display: "flex", gap: 8, marginTop: 32, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => handlePrint("entrega")} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0E7C7B", color: "#fff", cursor: "pointer" }}>
            Imprimir para entregar ao paciente
          </button>
          <button onClick={() => handlePrint("interno")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #0E7C7B", background: "transparent", color: "#0E7C7B", cursor: "pointer" }}>
            Imprimir para arquivo interno
          </button>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", background: "transparent", cursor: "pointer" }}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DoseCalculationsSection({ patient }: { patient: Patient }) {
  const { theme } = useTheme();
  const [calculations, setCalculations] = useState<DoseCalculation[]>([]);

  async function refresh() {
    const { calculations } = await listDoseCalculations(patient.id);
    setCalculations(calculations);
  }

  useEffect(() => {
    refresh();
  }, [patient.id]);

  async function handleDelete(id: string) {
    if (!confirm("Excluir este cálculo? A exclusão fica registrada no histórico do paciente.")) return;
    await deleteDoseCalculation(id);
    refresh();
  }

  if (calculations.length === 0) return null;

  return (
    <div>
      <div style={{ fontSize: theme.typography.sizes.lg, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }}>
        Cálculos de dose salvos
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {calculations.map((c) => (
          <div key={c.id} style={{ ...glassSurface(theme), padding: theme.spacing.sm, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary }}>
              {c.drug_name} — {c.weight_kg} kg{c.is_pediatric ? " (infantil)" : ""} — máx. {Number(c.max_dose_mg).toFixed(0)} mg
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.sm }}>
              <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
              <button
                onClick={() => handleDelete(c.id)}
                title="Excluir"
                style={{ background: "none", border: "none", color: theme.colors.danger, cursor: "pointer", fontSize: theme.typography.sizes.sm }}
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InstructionSection({ patient }: { patient: Patient }) {
  const { theme } = useTheme();
  const [templates, setTemplates] = useState<InstructionTemplate[]>([]);
  const [selected, setSelected] = useState<InstructionTemplate | null>(null);
  const [body, setBody] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    listInstructionTemplates().then(({ templates }) => setTemplates(templates));
  }, []);

  function select(template: InstructionTemplate) {
    setSelected(template);
    setBody(template.body);
  }

  return (
    <div>
      <div style={{ fontSize: theme.typography.sizes.lg, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }}>
        Orientações pré/pós-operatórias
      </div>
      <div style={{ display: "flex", gap: theme.spacing.sm, marginBottom: theme.spacing.md, flexWrap: "wrap" }}>
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => select(t)}
            style={{
              ...glassSurface(theme, { radius: theme.radius.md }),
              padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
              fontSize: theme.typography.sizes.sm,
              color: theme.colors.textPrimary,
              border: selected?.id === t.id ? `1px solid ${theme.colors.primary}` : "none",
              cursor: "pointer",
            }}
          >
            {t.title}
          </button>
        ))}
      </div>

      {selected && (
        <div style={{ ...glassSurface(theme), padding: theme.spacing.md, display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
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
          <PrimaryButton onClick={() => setPrinting(true)}>Visualizar para impressão</PrimaryButton>
        </div>
      )}

      {printing && selected && (
        <PrintableDocument onClose={() => setPrinting(false)} patient={patient} title={selected.title}>
          <div style={{ whiteSpace: "pre-wrap" }}>{body}</div>
        </PrintableDocument>
      )}
    </div>
  );
}

function PrintableDocument({
  patient,
  title,
  children,
  onClose,
}: {
  patient: Patient;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  async function handlePrint(purpose: "entrega" | "interno") {
    await logAuditAction(patient.id, {
      action: "impresso",
      entityType: "documento",
      description: `"${title}" impresso (${purpose === "entrega" ? "entregue ao paciente" : "armazenamento interno"})`,
    });
    window.print();
  }

  // Portal straight onto <body>, same fix as GlassModal: a backdrop-filter
  // ancestor would otherwise break this fixed overlay's positioning.
  return createPortal(
    <div className="sc-print-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .sc-print-doc, .sc-print-doc * { visibility: visible; }
          .sc-print-doc { position: absolute; top: 0; left: 0; width: 100%; }
          .sc-no-print { display: none !important; }
        }
      `}</style>
      <div className="sc-print-doc" style={{ background: "#fff", color: "#111", width: 600, maxHeight: "85vh", overflowY: "auto", borderRadius: 12, padding: 32 }}>
        <div style={{ borderBottom: "1px solid #ccc", paddingBottom: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{title}</div>
          <div style={{ fontSize: 13, color: "#555" }}>
            Paciente: {patient.name} — Data: {new Date().toLocaleDateString("pt-BR")}
          </div>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>{children}</div>
        <div className="sc-no-print" style={{ display: "flex", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
          <button onClick={() => handlePrint("entrega")} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0E7C7B", color: "#fff", cursor: "pointer" }}>
            Imprimir para entregar ao paciente
          </button>
          <button onClick={() => handlePrint("interno")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #0E7C7B", background: "transparent", color: "#0E7C7B", cursor: "pointer" }}>
            Imprimir para arquivo interno
          </button>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", background: "transparent", cursor: "pointer" }}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
