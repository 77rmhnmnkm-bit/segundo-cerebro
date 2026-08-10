import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Patient } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { SegmentedControl } from "../SegmentedControl";
import { getPatient } from "../api";
import { OverviewTab } from "./OverviewTab";
import { OdontogramTab } from "./OdontogramTab";
import { FilesTab } from "./FilesTab";
import { RecordsTab } from "./RecordsTab";
import { FormsTab } from "./FormsTab";
import { TreatmentTab } from "./TreatmentTab";
import { DocumentsTab } from "./DocumentsTab";
import { HistoryTab } from "./HistoryTab";
import { MedicalAlertBanner } from "./MedicalAlertBanner";
import { HealthEditor } from "./HealthEditor";
import { FullRecordPrint } from "./FullRecordPrint";

type Tab = "overview" | "odontogram" | "files" | "records" | "forms" | "treatment" | "documents" | "history";

export function PatientDetailScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [printingFull, setPrintingFull] = useState(false);
  const [healthVersion, setHealthVersion] = useState(0);

  useEffect(() => {
    if (id) getPatient(id).then(({ patient }) => setPatient(patient));
  }, [id]);

  if (!id || !patient) {
    return <div style={{ position: "relative", zIndex: 1, padding: theme.spacing.xl, color: theme.colors.textSecondary }}>Carregando...</div>;
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
        <button
          onClick={() => navigate("/pacientes")}
          aria-label="Voltar"
          style={{ border: "none", background: "transparent", color: theme.colors.textSecondary, fontSize: theme.typography.sizes.lg, cursor: "pointer" }}
        >
          ←
        </button>
        <div
          style={{
            fontSize: theme.typography.sizes.xl,
            fontWeight: theme.typography.weights.bold,
            letterSpacing: theme.typography.tracking.tight,
            color: theme.colors.textPrimary,
            flex: 1,
          }}
        >
          {patient.name}
        </div>
        <button
          onClick={() => setPrintingFull(true)}
          style={{
            background: "none",
            border: `1px solid ${theme.glass.borderSoft}`,
            borderRadius: theme.radius.sm,
            color: theme.colors.textPrimary,
            padding: `${theme.spacing.xs}px ${theme.spacing.md}px`,
            fontSize: theme.typography.sizes.sm,
            cursor: "pointer",
          }}
        >
          🖨 Imprimir prontuário completo
        </button>
      </header>

      <MedicalAlertBanner patientId={id} refreshKey={healthVersion} />

      <div style={{ marginBottom: theme.spacing.lg }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "overview", label: "Visão geral" },
            { value: "odontogram", label: "Odontograma" },
            { value: "files", label: "Arquivos" },
            { value: "records", label: "Evolução" },
            { value: "forms", label: "Formulários" },
            { value: "treatment", label: "Tratamento" },
            { value: "documents", label: "Documentos" },
            { value: "history", label: "Histórico" },
          ]}
        />
      </div>

      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.lg }}>
          <OverviewTab patient={patient} onUpdated={setPatient} />
          <HealthEditor patientId={id} onSaved={() => setHealthVersion((v) => v + 1)} />
        </div>
      )}
      {tab === "odontogram" && <OdontogramTab patient={patient} />}
      {tab === "files" && <FilesTab patientId={id} />}
      {tab === "records" && <RecordsTab patientId={id} />}
      {tab === "forms" && <FormsTab patientId={id} />}
      {tab === "treatment" && <TreatmentTab patientId={id} />}
      {tab === "documents" && <DocumentsTab patient={patient} />}
      {tab === "history" && <HistoryTab patient={patient} />}

      {printingFull && <FullRecordPrint patient={patient} onClose={() => setPrintingFull(false)} />}
    </div>
  );
}
