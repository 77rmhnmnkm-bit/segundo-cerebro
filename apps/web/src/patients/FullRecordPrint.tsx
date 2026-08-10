import { useEffect, useState } from "react";
import type { MedicalRecord, OdontogramEntry, Patient, Prescription, TreatmentPlan, TreatmentPlanStep, ToothFace } from "@app/core";
import {
  listMedicalRecords,
  listOdontogram,
  listPrescriptions,
  listTreatmentPlans,
  listTreatmentSteps,
} from "../api";
import { PatientPrintModal, PrintSection } from "./PatientPrint";
import { faceLabel } from "./Tooth";

export function FullRecordPrint({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [odontogram, setOdontogram] = useState<OdontogramEntry[]>([]);
  const [steps, setSteps] = useState<TreatmentPlanStep[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);

  useEffect(() => {
    async function load() {
      const [recordsRes, odontoRes, plansRes, prescriptionsRes] = await Promise.all([
        listMedicalRecords(patient.id),
        listOdontogram(patient.id),
        listTreatmentPlans(patient.id),
        listPrescriptions(patient.id),
      ]);
      setRecords(recordsRes.records);
      setOdontogram(odontoRes.entries);
      setPrescriptions(prescriptionsRes.prescriptions);

      const allSteps = await Promise.all(
        (plansRes.plans as TreatmentPlan[]).map((p) => listTreatmentSteps(p.id).then((r) => r.steps)),
      );
      setSteps(allSteps.flat());
      setLoading(false);
    }
    load();
  }, [patient.id]);

  return (
    <PatientPrintModal patient={patient} title="Prontuário completo" onClose={onClose}>
      {loading ? (
        <div>Carregando...</div>
      ) : (
        <>
          <PrintSection title="Dados do paciente">
            <div>Nome: {patient.name}</div>
            {patient.birth_date && <div>Nascimento: {new Date(patient.birth_date).toLocaleDateString("pt-BR")}</div>}
            {patient.phone && <div>Telefone: {patient.phone}</div>}
            {patient.email && <div>E-mail: {patient.email}</div>}
          </PrintSection>

          <PrintSection title="Odontograma">
            {odontogram.length === 0 ? (
              <div>Nenhum registro.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {odontogram.map((e) => (
                    <tr key={e.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "4px 8px" }}>Dente {e.tooth_number}</td>
                      <td style={{ padding: "4px 8px" }}>{e.face ? faceLabel(e.tooth_number, e.face as ToothFace) : "Dente todo"}</td>
                      <td style={{ padding: "4px 8px" }}>{e.procedure_name}</td>
                      <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{new Date(e.recorded_at).toLocaleDateString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PrintSection>

          <PrintSection title="Evolução">
            {records.length === 0 ? (
              <div>Nenhuma anotação.</div>
            ) : (
              records.map((r) => (
                <div key={r.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "#666" }}>{new Date(r.created_at).toLocaleDateString("pt-BR")}</div>
                  <div>{r.content}</div>
                </div>
              ))
            )}
          </PrintSection>

          <PrintSection title="Plano de tratamento">
            {steps.length === 0 ? (
              <div>Nenhuma etapa.</div>
            ) : (
              steps.map((s) => (
                <div key={s.id} style={{ marginBottom: 4 }}>
                  • {s.description} — {s.status}
                </div>
              ))
            )}
          </PrintSection>

          <PrintSection title="Receituários">
            {prescriptions.length === 0 ? (
              <div>Nenhum receituário.</div>
            ) : (
              prescriptions.map((p) => (
                <div key={p.id} style={{ marginBottom: 4 }}>
                  {new Date(p.created_at).toLocaleDateString("pt-BR")} — {p.drug_name}: {p.dosage_text}
                </div>
              ))
            )}
          </PrintSection>
        </>
      )}
    </PatientPrintModal>
  );
}
