import { useEffect, useMemo, useState } from "react";
import type { FormResponse, FormResponseValue, FormTemplate, FormTemplateField } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { GlassModal } from "../GlassModal";
import { PrimaryButton } from "../FormField";
import {
  createFormResponse,
  deleteFormResponse,
  getFormResponse,
  getFormTemplate,
  listFormResponses,
  listFormTemplates,
} from "../api";
import { DynamicField, type FieldValue } from "./DynamicField";

export function FormsTab({ patientId }: { patientId: string }) {
  const { theme } = useTheme();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<{ template: FormTemplate; fields: FormTemplateField[] } | null>(null);
  const [viewingResponse, setViewingResponse] = useState<{ response: FormResponse; values: FormResponseValue[] } | null>(null);

  async function refreshResponses() {
    const { responses } = await listFormResponses(patientId);
    setResponses(responses);
  }

  useEffect(() => {
    listFormTemplates().then(({ templates }) => setTemplates(templates));
    refreshResponses();
  }, [patientId]);

  async function openTemplate(templateId: string) {
    const data = await getFormTemplate(templateId);
    setActiveTemplate(data);
  }

  async function openResponse(responseId: string) {
    const data = await getFormResponse(responseId);
    setViewingResponse(data);
  }

  async function handleDelete(e: { stopPropagation: () => void }, responseId: string) {
    e.stopPropagation();
    if (!confirm("Excluir este formulário? A exclusão fica registrada no histórico do paciente.")) return;
    await deleteFormResponse(responseId);
    refreshResponses();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: theme.spacing.sm, flexWrap: "wrap", marginBottom: theme.spacing.lg }}>
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => openTemplate(t.id)}
            style={{
              ...glassSurface(theme, { radius: theme.radius.md }),
              padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
              fontSize: theme.typography.sizes.sm,
              color: theme.colors.textPrimary,
              cursor: "pointer",
              border: "none",
            }}
          >
            + {t.name}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {responses.length === 0 && (
          <div style={{ color: theme.colors.textSecondary, textAlign: "center" }}>Nenhum formulário preenchido ainda.</div>
        )}
        {responses.map((r) => (
          <div
            key={r.id}
            onClick={() => openResponse(r.id)}
            style={{
              ...glassSurface(theme),
              padding: theme.spacing.md,
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
              {r.template_name}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.sm }}>
              <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
                {new Date(r.created_at).toLocaleString("pt-BR")}
              </span>
              <button
                onClick={(e) => handleDelete(e, r.id)}
                title="Excluir"
                style={{ background: "none", border: "none", color: theme.colors.danger, cursor: "pointer", fontSize: theme.typography.sizes.sm }}
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>

      {activeTemplate && (
        <FillFormModal
          template={activeTemplate.template}
          fields={activeTemplate.fields}
          onClose={() => setActiveTemplate(null)}
          onSaved={() => {
            setActiveTemplate(null);
            refreshResponses();
          }}
          patientId={patientId}
        />
      )}

      {viewingResponse && (
        <GlassModal title={viewingResponse.response.template_name ?? "Formulário"} onClose={() => setViewingResponse(null)}>
          {groupBySection(viewingResponse.values).map(([section, values]) => (
            <div key={section ?? "_"} style={{ marginBottom: theme.spacing.sm }}>
              {section && (
                <div style={{ fontSize: theme.typography.sizes.xs, fontWeight: theme.typography.weights.semibold, color: theme.colors.textSecondary, marginBottom: 4 }}>
                  {section}
                </div>
              )}
              {values.map((v) => (
                <div key={v.id} style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, marginBottom: 4 }}>
                  <span style={{ color: theme.colors.textSecondary }}>{v.label}: </span>
                  {formatValue(v.value)}
                </div>
              ))}
            </div>
          ))}
        </GlassModal>
      )}
    </div>
  );
}

function FillFormModal({
  template,
  fields,
  patientId,
  onClose,
  onSaved,
}: {
  template: FormTemplate;
  fields: FormTemplateField[];
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { theme } = useTheme();
  const [values, setValues] = useState<Record<string, FieldValue>>({});

  const sections = useMemo(() => groupFieldsBySection(fields), [fields]);

  async function handleSubmit() {
    const payload = fields
      .filter((f) => values[f.id] !== undefined)
      .map((f) => ({ fieldId: f.id, value: values[f.id] }));
    await createFormResponse(patientId, template.id, payload);
    onSaved();
  }

  return (
    <GlassModal title={template.name} onClose={onClose}>
      {sections.map(([section, sectionFields]) => (
        <div key={section ?? "_"} style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
          {section && (
            <div style={{ fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginTop: theme.spacing.sm }}>
              {section}
            </div>
          )}
          {sectionFields.map((field) => (
            <DynamicField
              key={field.id}
              field={field}
              value={values[field.id]}
              onChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v }))}
            />
          ))}
        </div>
      ))}
      <PrimaryButton onClick={handleSubmit}>Salvar formulário</PrimaryButton>
    </GlassModal>
  );
}

function groupFieldsBySection(fields: FormTemplateField[]): [string | null, FormTemplateField[]][] {
  const map = new Map<string | null, FormTemplateField[]>();
  for (const f of fields) {
    const key = f.section ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  return Array.from(map.entries());
}

function groupBySection(values: FormResponseValue[]): [string | null, FormResponseValue[]][] {
  const map = new Map<string | null, FormResponseValue[]>();
  for (const v of values) {
    const key = v.section ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(v);
  }
  return Array.from(map.entries());
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "object") {
      return value.map((row) => Object.values(row as object).join(" / ")).join("; ");
    }
    return value.join(", ");
  }
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
