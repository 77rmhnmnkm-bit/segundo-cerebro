import { useEffect, useState } from "react";
import type { Payment, TreatmentPlan, TreatmentPlanStep } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { formatBRL } from "../format";
import { GlassModal } from "../GlassModal";
import { TextField, SelectField, PrimaryButton } from "../FormField";
import {
  createPayment,
  createTreatmentPlan,
  createTreatmentStep,
  deletePayment,
  deleteTreatmentPlan,
  deleteTreatmentStep,
  listPayments,
  listTreatmentPlans,
  listTreatmentSteps,
  updateTreatmentPlanStatus,
  updateTreatmentStep,
  updateTreatmentStepStatus,
} from "../api";
import { RecallSection } from "./RecallSection";
import { ClinicalCasesSection } from "./ClinicalCasesSection";

export function TreatmentTab({ patientId }: { patientId: string }) {
  const { theme } = useTheme();
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [title, setTitle] = useState("");

  async function refresh() {
    const { plans } = await listTreatmentPlans(patientId);
    setPlans(plans);
  }

  useEffect(() => {
    refresh();
  }, [patientId]);

  async function handleCreatePlan() {
    if (!title.trim()) return;
    await createTreatmentPlan(patientId, title.trim());
    setTitle("");
    setShowNewPlan(false);
    refresh();
  }

  async function handleDeletePlan(id: string) {
    await deleteTreatmentPlan(id);
    if (expanded === id) setExpanded(null);
    refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.lg }}>
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: theme.spacing.md }}>
          <PrimaryButton onClick={() => setShowNewPlan(true)}>+ Novo plano de tratamento</PrimaryButton>
        </div>

        {plans.length === 0 && (
          <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, color: theme.colors.textSecondary, textAlign: "center" }}>
            Nenhum plano de tratamento ainda.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              expanded={expanded === plan.id}
              onToggle={() => setExpanded(expanded === plan.id ? null : plan.id)}
              onDelete={() => handleDeletePlan(plan.id)}
              onStatusChange={refresh}
            />
          ))}
        </div>
      </div>

      <RecallSection patientId={patientId} />

      <ClinicalCasesSection patientId={patientId} />

      {showNewPlan && (
        <GlassModal title="Novo plano de tratamento" onClose={() => setShowNewPlan(false)}>
          <TextField label="Título" value={title} onChange={setTitle} placeholder="Ex: Tratamento ortodôntico" required />
          <PrimaryButton onClick={handleCreatePlan} disabled={!title.trim()}>
            Criar plano
          </PrimaryButton>
        </GlassModal>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  expanded,
  onToggle,
  onDelete,
  onStatusChange,
}: {
  plan: TreatmentPlan;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onStatusChange: () => void;
}) {
  const { theme } = useTheme();
  const [steps, setSteps] = useState<TreatmentPlanStep[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showStepForm, setShowStepForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [description, setDescription] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [value, setValue] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  async function refreshDetails() {
    const [stepsRes, paymentsRes] = await Promise.all([listTreatmentSteps(plan.id), listPayments(plan.id)]);
    setSteps(stepsRes.steps);
    setPayments(paymentsRes.payments);
  }

  useEffect(() => {
    if (expanded) refreshDetails();
  }, [expanded]);

  const totalValue = steps.reduce((sum, s) => sum + Number(s.value ?? 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  async function handleAddStep() {
    if (!description.trim()) return;
    await createTreatmentStep(plan.id, {
      description: description.trim(),
      procedureName: procedureName || undefined,
      value: value ? Number(value) : undefined,
    });
    setDescription("");
    setProcedureName("");
    setValue("");
    setShowStepForm(false);
    refreshDetails();
  }

  async function handleStepStatus(stepId: string, status: string) {
    await updateTreatmentStepStatus(stepId, status);
    refreshDetails();
  }

  async function handleDeleteStep(stepId: string) {
    await deleteTreatmentStep(stepId);
    refreshDetails();
  }

  async function handleAddPayment() {
    if (!paymentAmount) return;
    await createPayment(plan.id, { amount: Number(paymentAmount), method: paymentMethod || undefined });
    setPaymentAmount("");
    setPaymentMethod("");
    setShowPaymentForm(false);
    refreshDetails();
  }

  async function handleDeletePayment(paymentId: string) {
    await deletePayment(paymentId);
    refreshDetails();
  }

  return (
    <div style={{ ...glassSurface(theme), padding: theme.spacing.md }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={onToggle}>
        <div>
          <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>{plan.title}</div>
          <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
            {plan.status === "ativo" ? "Ativo" : plan.status === "concluido" ? "Concluído" : "Cancelado"}
          </div>
        </div>
        <span style={{ color: theme.colors.textSecondary }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: theme.spacing.md, display: "flex", flexDirection: "column", gap: theme.spacing.md }}>
          <div style={{ display: "flex", gap: theme.spacing.sm }}>
            <SelectField
              label="Status do plano"
              value={plan.status}
              onChange={(v) => updateTreatmentPlanStatus(plan.id, v).then(onStatusChange)}
              options={[
                { value: "ativo", label: "Ativo" },
                { value: "concluido", label: "Concluído" },
                { value: "cancelado", label: "Cancelado" },
              ]}
            />
            <button
              onClick={onDelete}
              style={{ alignSelf: "flex-end", background: "none", border: `1px solid ${theme.colors.danger}55`, color: theme.colors.danger, borderRadius: theme.radius.sm, padding: `4px ${theme.spacing.sm}px`, fontSize: theme.typography.sizes.xs, cursor: "pointer", height: 34 }}
            >
              Remover plano
            </button>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
                Etapas
              </span>
              <button onClick={() => setShowStepForm(true)} style={{ background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.xs, cursor: "pointer" }}>
                + Adicionar etapa
              </button>
            </div>
            {steps.map((step) => (
              <StepRow key={step.id} step={step} onStatusChange={handleStepStatus} onDelete={handleDeleteStep} onSaved={refreshDetails} />
            ))}
            <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginTop: 6 }}>
              Total previsto: {formatBRL(totalValue)}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ fontSize: theme.typography.sizes.sm, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
                Pagamentos
              </span>
              <button onClick={() => setShowPaymentForm(true)} style={{ background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.xs, cursor: "pointer" }}>
                + Registrar pagamento
              </button>
            </div>
            {payments.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary }}>
                <span>
                  {formatBRL(Number(p.amount))} {p.method ? `· ${p.method}` : ""} — {new Date(p.paid_at).toLocaleDateString("pt-BR")}
                </span>
                <button onClick={() => handleDeletePayment(p.id)} style={{ background: "none", border: "none", color: theme.colors.textSecondary, cursor: "pointer" }}>
                  ✕
                </button>
              </div>
            ))}
            <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginTop: 6 }}>
              Total pago: {formatBRL(totalPaid)} {totalValue > 0 && `(${((totalPaid / totalValue) * 100).toFixed(0)}%)`}
            </div>
          </div>
        </div>
      )}

      {showStepForm && (
        <GlassModal title="Nova etapa" onClose={() => setShowStepForm(false)}>
          <TextField label="Descrição" value={description} onChange={setDescription} required />
          <TextField label="Procedimento" value={procedureName} onChange={setProcedureName} />
          <TextField label="Valor (R$)" type="number" value={value} onChange={setValue} />
          <PrimaryButton onClick={handleAddStep} disabled={!description.trim()}>
            Adicionar
          </PrimaryButton>
        </GlassModal>
      )}

      {showPaymentForm && (
        <GlassModal title="Novo pagamento" onClose={() => setShowPaymentForm(false)}>
          <TextField label="Valor (R$)" type="number" value={paymentAmount} onChange={setPaymentAmount} required />
          <TextField label="Método (opcional)" value={paymentMethod} onChange={setPaymentMethod} placeholder="pix, cartão, dinheiro..." />
          <PrimaryButton onClick={handleAddPayment} disabled={!paymentAmount}>
            Registrar
          </PrimaryButton>
        </GlassModal>
      )}
    </div>
  );
}

function StepRow({
  step,
  onStatusChange,
  onDelete,
  onSaved,
}: {
  step: TreatmentPlanStep;
  onStatusChange: (stepId: string, status: string) => void;
  onDelete: (stepId: string) => void;
  onSaved: () => void;
}) {
  const { theme } = useTheme();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(step.description);
  const [procedureName, setProcedureName] = useState(step.procedure_name ?? "");
  const [value, setValue] = useState(step.value ?? "");

  async function save() {
    await updateTreatmentStep(step.id, {
      description: description.trim(),
      procedureName: procedureName || undefined,
      value: value === "" ? null : Number(value),
    });
    setEditing(false);
    onSaved();
  }

  if (editing) {
    return (
      <div style={{ padding: "8px 0", borderBottom: `1px solid ${theme.glass.borderSoft}`, display: "flex", flexDirection: "column", gap: 6 }}>
        <TextField label="Descrição" value={description} onChange={setDescription} />
        <TextField label="Procedimento" value={procedureName} onChange={setProcedureName} />
        <TextField label="Valor (R$)" type="number" value={String(value)} onChange={setValue} />
        <div style={{ display: "flex", gap: 6 }}>
          <PrimaryButton onClick={save}>Salvar</PrimaryButton>
          <button onClick={() => setEditing(false)} style={{ background: "none", border: `1px solid ${theme.glass.borderSoft}`, color: theme.colors.textSecondary, borderRadius: theme.radius.sm, padding: `4px ${theme.spacing.sm}px`, cursor: "pointer" }}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${theme.glass.borderSoft}` }}>
      <div onClick={() => setEditing(true)} style={{ cursor: "pointer" }}>
        <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary }}>{step.description}</div>
        <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
          {step.procedure_name ?? ""} {step.value ? `· ${formatBRL(Number(step.value))}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <select
          value={step.status}
          onChange={(e) => onStatusChange(step.id, e.target.value)}
          style={{ fontSize: theme.typography.sizes.xs, background: "transparent", color: theme.colors.textPrimary, border: `1px solid ${theme.glass.borderSoft}`, borderRadius: theme.radius.sm }}
        >
          <option value="pendente">Pendente</option>
          <option value="aprovado">Aprovado</option>
          <option value="concluido">Concluído</option>
        </select>
        <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: theme.colors.textSecondary, cursor: "pointer" }}>
          ✎
        </button>
        <button onClick={() => onDelete(step.id)} style={{ background: "none", border: "none", color: theme.colors.textSecondary, cursor: "pointer" }}>
          ✕
        </button>
      </div>
    </div>
  );
}
