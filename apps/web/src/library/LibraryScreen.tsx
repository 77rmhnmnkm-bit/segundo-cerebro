import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { ClinicalProcedure, ClinicalSpecialty, Drug, SpecialtyDocument } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { SegmentedControl } from "../SegmentedControl";
import { GlassModal } from "../GlassModal";
import { TextField, PrimaryButton } from "../FormField";
import {
  createProcedure,
  createSpecialty,
  deleteSpecialtyDocument,
  getSpecialtyDocument,
  listDrugs,
  listInstructionTemplates,
  listProcedures,
  listSpecialties,
  listSpecialtyDocuments,
  uploadSpecialtyDocument,
} from "../api";
import { AnestheticCalculator } from "./AnestheticCalculator";

type Section = "biblioteca" | "calculadoras" | "orientacoes";

export function LibraryScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("biblioteca");

  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", padding: theme.spacing.xl }}>
      <header
        style={{
          ...glassSurface(theme, { radius: theme.radius.lg }),
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: theme.spacing.md,
          padding: `${theme.spacing.md}px ${theme.spacing.lg}px`,
          marginBottom: theme.spacing.xl,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.md }}>
          <button
            onClick={() => navigate("/")}
            aria-label="Voltar"
            style={{ border: "none", background: "transparent", color: theme.colors.textSecondary, fontSize: theme.typography.sizes.lg, cursor: "pointer" }}
          >
            ←
          </button>
          <div>
            <div
              style={{
                fontSize: theme.typography.sizes.xl,
                fontWeight: theme.typography.weights.bold,
                letterSpacing: theme.typography.tracking.tight,
                color: theme.colors.textPrimary,
              }}
            >
              Biblioteca Clínica
            </div>
            <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>
              Procedimentos, calculadoras e orientações.
            </div>
          </div>
        </div>

        <SegmentedControl
          value={section}
          onChange={setSection}
          options={[
            { value: "biblioteca", label: "Especialidades" },
            { value: "calculadoras", label: "Calculadoras" },
            { value: "orientacoes", label: "Orientações" },
          ]}
        />
      </header>

      {section === "biblioteca" && <SpecialtiesSection />}
      {section === "calculadoras" && <CalculatorsSection />}
      {section === "orientacoes" && <InstructionsSection />}
    </div>
  );
}

function SpecialtiesSection() {
  const { theme } = useTheme();
  const [specialties, setSpecialties] = useState<ClinicalSpecialty[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [procedures, setProcedures] = useState<ClinicalProcedure[]>([]);
  const [documents, setDocuments] = useState<SpecialtyDocument[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [printingDoc, setPrintingDoc] = useState<SpecialtyDocument | null>(null);
  const [showNewSpecialty, setShowNewSpecialty] = useState(false);
  const [showNewProcedure, setShowNewProcedure] = useState(false);
  const [name, setName] = useState("");
  const [procName, setProcName] = useState("");
  const [materials, setMaterials] = useState("");
  const [technique, setTechnique] = useState("");

  async function refresh() {
    const { specialties } = await listSpecialties();
    setSpecialties(specialties);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function toggle(specialtyId: string) {
    if (expanded === specialtyId) {
      setExpanded(null);
      return;
    }
    setExpanded(specialtyId);
    const { procedures } = await listProcedures(specialtyId);
    setProcedures(procedures);
    const { documents } = await listSpecialtyDocuments(specialtyId);
    setDocuments(documents);
  }

  async function handleUploadDoc(file: File) {
    if (!expanded) return;
    setDocUploading(true);
    setDocError(null);
    try {
      await uploadSpecialtyDocument(expanded, file);
      const { documents } = await listSpecialtyDocuments(expanded);
      setDocuments(documents);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Erro ao processar o PDF.");
    } finally {
      setDocUploading(false);
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!expanded) return;
    await deleteSpecialtyDocument(docId);
    const { documents } = await listSpecialtyDocuments(expanded);
    setDocuments(documents);
  }

  async function handlePrintDoc(docId: string) {
    const { document } = await getSpecialtyDocument(docId);
    setPrintingDoc(document);
  }

  async function handleCreateSpecialty() {
    if (!name.trim()) return;
    await createSpecialty(name.trim());
    setName("");
    setShowNewSpecialty(false);
    refresh();
  }

  async function handleCreateProcedure() {
    if (!expanded || !procName.trim()) return;
    await createProcedure(expanded, { name: procName.trim(), materials: materials || undefined, techniqueScript: technique || undefined });
    setProcName("");
    setMaterials("");
    setTechnique("");
    setShowNewProcedure(false);
    const { procedures } = await listProcedures(expanded);
    setProcedures(procedures);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: theme.spacing.md }}>
        <PrimaryButton onClick={() => setShowNewSpecialty(true)}>+ Nova especialidade</PrimaryButton>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {specialties.map((s) => (
          <div key={s.id} style={{ ...glassSurface(theme), padding: theme.spacing.md }}>
            <div onClick={() => toggle(s.id)} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
              {s.name}
              <span style={{ color: theme.colors.textSecondary }}>{expanded === s.id ? "▲" : "▼"}</span>
            </div>

            {expanded === s.id && (
              <div style={{ marginTop: theme.spacing.sm, display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
                {procedures.length === 0 && (
                  <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>Nenhum procedimento cadastrado.</div>
                )}
                {procedures.map((p) => (
                  <div key={p.id} style={{ borderTop: `1px solid ${theme.glass.borderSoft}`, paddingTop: theme.spacing.sm }}>
                    <div style={{ fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.medium, color: theme.colors.textPrimary }}>{p.name}</div>
                    {p.materials && <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>Materiais: {p.materials}</div>}
                    {p.technique_script && <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, whiteSpace: "pre-wrap" }}>{p.technique_script}</div>}
                  </div>
                ))}
                <button onClick={() => setShowNewProcedure(true)} style={{ alignSelf: "flex-start", background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.xs, cursor: "pointer" }}>
                  + Adicionar procedimento
                </button>

                <div style={{ borderTop: `1px solid ${theme.glass.borderSoft}`, paddingTop: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                  <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, fontWeight: theme.typography.weights.semibold, marginBottom: 4 }}>
                    Documentos de referência (PDF)
                  </div>
                  {documents.map((doc) => (
                    <div key={doc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: theme.typography.sizes.xs, paddingBottom: 4 }}>
                      <span style={{ color: theme.colors.textPrimary }}>{doc.title}</span>
                      <div style={{ display: "flex", gap: theme.spacing.sm }}>
                        <button onClick={() => handlePrintDoc(doc.id)} style={{ background: "none", border: "none", color: theme.colors.primary, cursor: "pointer", fontSize: theme.typography.sizes.xs }}>
                          Imprimir
                        </button>
                        <button onClick={() => handleDeleteDoc(doc.id)} style={{ background: "none", border: "none", color: theme.colors.danger, cursor: "pointer", fontSize: theme.typography.sizes.xs }}>
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                  <label
                    style={{
                      display: "inline-block",
                      marginTop: 4,
                      fontSize: theme.typography.sizes.xs,
                      color: docUploading ? theme.colors.textSecondary : theme.colors.primary,
                      cursor: docUploading ? "default" : "pointer",
                    }}
                  >
                    {docUploading ? "Processando..." : "📎 Enviar PDF de especialidade"}
                    <input
                      type="file"
                      accept="application/pdf"
                      disabled={docUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadDoc(file);
                        e.target.value = "";
                      }}
                      style={{ display: "none" }}
                    />
                  </label>
                  {docError && <div style={{ color: theme.colors.danger, fontSize: theme.typography.sizes.xs }}>{docError}</div>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {printingDoc && <SpecialtyDocumentPrint document={printingDoc} onClose={() => setPrintingDoc(null)} />}

      {showNewSpecialty && (
        <GlassModal title="Nova especialidade" onClose={() => setShowNewSpecialty(false)}>
          <TextField label="Nome" value={name} onChange={setName} required />
          <PrimaryButton onClick={handleCreateSpecialty} disabled={!name.trim()}>
            Criar
          </PrimaryButton>
        </GlassModal>
      )}

      {showNewProcedure && (
        <GlassModal title="Novo procedimento" onClose={() => setShowNewProcedure(false)}>
          <TextField label="Nome" value={procName} onChange={setProcName} required />
          <TextField label="Materiais" value={materials} onChange={setMaterials} placeholder="separados por vírgula" />
          <TextField label="Roteiro de técnica" value={technique} onChange={setTechnique} placeholder="passo a passo" />
          <PrimaryButton onClick={handleCreateProcedure} disabled={!procName.trim()}>
            Adicionar
          </PrimaryButton>
        </GlassModal>
      )}
    </div>
  );
}

function SpecialtyDocumentPrint({ document: doc, onClose }: { document: SpecialtyDocument; onClose: () => void }) {
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
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <div style={{ textAlign: "center", borderBottom: "2px solid #1a1a1a", paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{doc.title}</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Material de referência — Biblioteca Clínica</div>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{doc.extracted_text}</div>
        <div className="sc-no-print" style={{ display: "flex", gap: 8, marginTop: 32, justifyContent: "center" }}>
          <button onClick={() => window.print()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0E7C7B", color: "#fff", cursor: "pointer" }}>
            Imprimir
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

function CalculatorsSection() {
  const { theme } = useTheme();
  const [medications, setMedications] = useState<Drug[]>([]);

  useEffect(() => {
    Promise.all([
      listDrugs("antibiotico"),
      listDrugs("analgesico"),
      listDrugs("anti_inflamatorio"),
      listDrugs("ansiolitico"),
      listDrugs("corticoide"),
    ]).then(([a, b, c, d, e]) => setMedications([...a.drugs, ...b.drugs, ...c.drugs, ...d.drugs, ...e.drugs]));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.lg }}>
      <AnestheticCalculator />

      <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, maxWidth: 480 }}>
        <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }}>
          Referência de medicamentos
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
          {medications.map((d) => (
            <div key={d.id} style={{ borderTop: `1px solid ${theme.glass.borderSoft}`, paddingTop: theme.spacing.sm }}>
              <div style={{ fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.medium, color: theme.colors.textPrimary }}>{d.name}</div>
              <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>{d.dose_description}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginTop: theme.spacing.sm }}>
          Para gerar uma prescrição, use a aba "Documentos" dentro do prontuário do paciente.
        </div>
      </div>
    </div>
  );
}

function InstructionsSection() {
  const { theme } = useTheme();
  const [templates, setTemplates] = useState<{ id: string; type: string; title: string; body: string }[]>([]);

  useEffect(() => {
    listInstructionTemplates().then(({ templates }) => setTemplates(templates));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
      {templates.map((t) => (
        <div key={t.id} style={{ ...glassSurface(theme), padding: theme.spacing.md }}>
          <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
            {t.type === "pre_operatorio" ? "Pré-operatório" : "Pós-operatório"}
          </div>
          <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: 4 }}>{t.title}</div>
          <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, whiteSpace: "pre-wrap" }}>{t.body}</div>
        </div>
      ))}
      <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
        Para imprimir para um paciente específico, use a aba "Documentos" dentro do prontuário do paciente.
      </div>
    </div>
  );
}
