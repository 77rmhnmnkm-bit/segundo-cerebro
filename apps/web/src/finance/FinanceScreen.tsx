import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { BudgetSummary, CashflowMonth, Expense, FinanceDomain, FinanceSummary, Payment, PersonalFinancePrinciple, SavingsGoal } from "@app/core";
import { glassSurface } from "@app/ui";
import { useTheme } from "../ThemeProvider";
import { formatBRL } from "../format";
import { SegmentedControl } from "../SegmentedControl";
import { GlassModal } from "../GlassModal";
import { TextField, PrimaryButton } from "../FormField";
import {
  createExpense,
  createSavingsGoal,
  deleteExpense,
  deleteSavingsGoal,
  getBudgetSummary,
  getCashflow,
  getFinanceSummary,
  getSetting,
  listAllPayments,
  listExpenses,
  listFinancePrinciples,
  listSavingsGoals,
  logAuditAction,
  putSetting,
  updateSavingsGoal,
} from "../api";

export function FinanceScreen() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [domain, setDomain] = useState<FinanceDomain>("trabalho");

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
            <div style={{ fontSize: theme.typography.sizes.xl, fontWeight: theme.typography.weights.bold, color: theme.colors.textPrimary }}>
              Financeiro
            </div>
            <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>
              Clínica e vida pessoal, separados.
            </div>
          </div>
        </div>

        <SegmentedControl
          value={domain}
          onChange={setDomain}
          options={[
            { value: "trabalho", label: "Trabalho/Clínica" },
            { value: "pessoal", label: "Pessoal" },
          ]}
        />
      </header>

      {domain === "trabalho" ? <WorkFinance /> : <PersonalFinance />}
    </div>
  );
}

function MetricCard({ theme, label, value, sub, color }: { theme: ReturnType<typeof useTheme>["theme"]; label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ ...glassSurface(theme, { strong: true }), padding: theme.spacing.lg }}>
      <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: theme.typography.sizes.xl, fontWeight: theme.typography.weights.bold, color }}>{value}</div>
      <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function CashflowChart({ months }: { months: CashflowMonth[] }) {
  const { theme } = useTheme();
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expenses]));
  return (
    <div style={{ ...glassSurface(theme), padding: theme.spacing.lg }}>
      <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
        Fluxo de caixa (6 meses)
      </div>
      {months.length === 0 ? (
        <div style={{ color: theme.colors.textSecondary, fontSize: theme.typography.sizes.sm }}>Sem movimentações ainda.</div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: theme.spacing.md, height: 140 }}>
          {months.map((m) => (
            <div key={m.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
              <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 110 }}>
                <div style={{ width: 10, height: `${(m.income / max) * 100}%`, background: theme.colors.primary, borderRadius: 3 }} title={`Entradas: ${formatBRL(m.income)}`} />
                <div style={{ width: 10, height: `${(m.expenses / max) * 100}%`, background: theme.colors.categoryAcademico, borderRadius: 3 }} title={`Saídas: ${formatBRL(m.expenses)}`} />
              </div>
              <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>{m.month.slice(5)}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <Legend color={theme.colors.primary} label="Entradas" />
        <Legend color={theme.colors.categoryAcademico} label="Saídas" />
      </div>
    </div>
  );
}

const BUCKET_LABEL: Record<"necessidade" | "desejo" | "poupanca", string> = {
  necessidade: "Necessidade",
  desejo: "Desejo",
  poupanca: "Poupança",
};

function Legend({ color, label }: { color: string; label: string }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      {label}
    </div>
  );
}

function ExpensesSection({ domain }: { domain: FinanceDomain }) {
  const { theme } = useTheme();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [bucket, setBucket] = useState<"" | "necessidade" | "desejo" | "poupanca">("");

  async function refresh() {
    const { expenses } = await listExpenses(domain);
    setExpenses(expenses);
  }

  useEffect(() => {
    refresh();
  }, [domain]);

  async function handleCreate() {
    if (!category.trim() || !amount) return;
    await createExpense({
      domain,
      category: category.trim(),
      description: description || undefined,
      amount: Number(amount),
      recurring,
      bucket: bucket || undefined,
    });
    setCategory("");
    setDescription("");
    setAmount("");
    setRecurring(false);
    setBucket("");
    setShowForm(false);
    refresh();
  }

  async function handleDelete(id: string) {
    await deleteExpense(id);
    refresh();
  }

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: theme.spacing.sm }}>
        <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
          Despesas {domain === "trabalho" ? "(contas a pagar)" : "pessoais"} — total {formatBRL(total)}
        </div>
        <button onClick={() => setShowForm(true)} style={{ background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.xs, cursor: "pointer" }}>
          + Nova despesa
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {expenses.length === 0 && (
          <div style={{ ...glassSurface(theme), padding: theme.spacing.md, color: theme.colors.textSecondary, textAlign: "center", fontSize: theme.typography.sizes.sm }}>
            Nenhuma despesa registrada ainda.
          </div>
        )}
        {expenses.map((e) => (
          <div key={e.id} style={{ ...glassSurface(theme), padding: theme.spacing.sm, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, fontWeight: theme.typography.weights.medium }}>{e.category}</span>
              {e.description && <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}> — {e.description}</span>}
              {e.recurring && <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.warning }}> · recorrente</span>}
              {e.bucket && <span style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}> · {BUCKET_LABEL[e.bucket]}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.sm }}>
              <span style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary }}>{formatBRL(Number(e.amount))}</span>
              <button onClick={() => handleDelete(e.id)} style={{ background: "none", border: "none", color: theme.colors.danger, cursor: "pointer" }}>🗑</button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <GlassModal title="Nova despesa" onClose={() => setShowForm(false)}>
          <TextField label="Categoria" value={category} onChange={setCategory} placeholder={domain === "trabalho" ? "aluguel, materiais, laboratório..." : "moradia, lazer, mercado..."} required />
          <TextField label="Descrição (opcional)" value={description} onChange={setDescription} />
          <TextField label="Valor (R$)" type="number" value={amount} onChange={setAmount} required />
          {domain === "pessoal" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>Tipo (para o planejador 50/30/20)</span>
              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value as typeof bucket)}
                style={{
                  background: theme.mode === "light" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${theme.glass.borderSoft}`,
                  borderRadius: theme.radius.sm,
                  padding: `${theme.spacing.sm}px ${theme.spacing.sm + 4}px`,
                  fontSize: theme.typography.sizes.md,
                  color: theme.colors.textPrimary,
                }}
              >
                <option value="">Não classificar</option>
                <option value="necessidade">Necessidade (moradia, contas, mercado)</option>
                <option value="desejo">Desejo (lazer, assinaturas, compras)</option>
                <option value="poupanca">Poupança/dívidas</option>
              </select>
            </label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, cursor: "pointer" }}>
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} style={{ accentColor: theme.colors.primary }} />
            Despesa recorrente (mensal)
          </label>
          <PrimaryButton onClick={handleCreate} disabled={!category.trim() || !amount}>
            Salvar
          </PrimaryButton>
        </GlassModal>
      )}
    </div>
  );
}

function WorkFinance() {
  const { theme } = useTheme();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cashflow, setCashflow] = useState<CashflowMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [printingPayment, setPrintingPayment] = useState<Payment | null>(null);

  useEffect(() => {
    Promise.all([getFinanceSummary(), listAllPayments(50), getCashflow("trabalho")]).then(([summary, { payments }, { months }]) => {
      setSummary(summary);
      setPayments(payments);
      setCashflow(months);
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ color: theme.colors.textSecondary }}>Carregando...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.xl }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: theme.spacing.lg }}>
        <MetricCard theme={theme} label="Total recebido" value={formatBRL(Number(summary?.totalReceived ?? 0))} sub={`${summary?.paymentsCount ?? 0} pagamentos`} color={theme.colors.primary} />
        <MetricCard
          theme={theme}
          label="A receber (pendente)"
          value={formatBRL(Number(summary?.totalPending ?? 0))}
          sub={`${summary?.pendingCount ?? 0} etapas sem pagamento`}
          color={theme.colors.warning}
        />
      </div>

      <CashflowChart months={cashflow} />

      <div>
        <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }}>
          Pagamentos recentes (a receber)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
          {payments.length === 0 && (
            <div style={{ ...glassSurface(theme), padding: theme.spacing.lg, color: theme.colors.textSecondary, textAlign: "center" }}>
              Nenhum pagamento registrado ainda.
            </div>
          )}
          {payments.map((p) => (
            <div key={p.id} style={{ ...glassSurface(theme), padding: theme.spacing.md, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: theme.typography.weights.medium, color: theme.colors.textPrimary }}>
                  {p.patient_name} — {formatBRL(Number(p.amount))}
                </div>
                <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary }}>
                  {p.plan_title} · {new Date(p.paid_at).toLocaleDateString("pt-BR")}
                  {p.method ? ` · ${p.method}` : ""}
                </div>
              </div>
              <button onClick={() => setPrintingPayment(p)} style={{ background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.sm, cursor: "pointer" }}>
                Recibo
              </button>
            </div>
          ))}
        </div>
      </div>

      <ExpensesSection domain="trabalho" />

      {printingPayment && <ReceiptPrint payment={printingPayment} onClose={() => setPrintingPayment(null)} />}
    </div>
  );
}

function BudgetPlanner({
  budget,
  goals,
  onIncomeSaved,
}: {
  budget: BudgetSummary;
  goals: SavingsGoal[];
  onIncomeSaved: () => void;
}) {
  const { theme } = useTheme();
  const [income, setIncome] = useState(String(budget.monthlyIncome || ""));
  const [saving, setSaving] = useState(false);
  const [emergencyMonths, setEmergencyMonths] = useState(6);
  const [emergencySaved, setEmergencySaved] = useState("0");

  useEffect(() => {
    getSetting("emergency_fund_current")
      .then(({ setting }) => setEmergencySaved(String(setting.value ?? 0)))
      .catch(() => {});
  }, []);

  async function handleSaveIncome() {
    if (!income) return;
    setSaving(true);
    await putSetting("personal_monthly_income", Number(income));
    setSaving(false);
    onIncomeSaved();
  }

  async function handleSaveEmergency(value: string) {
    setEmergencySaved(value);
    await putSetting("emergency_fund_current", Number(value) || 0);
  }

  const necessidadeEssencial = budget.spent.necessidade || budget.target.necessidade;
  const emergencyTarget = necessidadeEssencial * emergencyMonths;
  const emergencyGap = Math.max(0, emergencyTarget - Number(emergencySaved));

  if (!budget.monthlyIncome) {
    return (
      <div style={{ ...glassSurface(theme, { strong: true }), padding: theme.spacing.lg }}>
        <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }}>
          Vamos montar seu orçamento
        </div>
        <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }}>
          Informe sua renda mensal líquida — a partir disso eu calculo tudo (quanto deveria ir pra cada coisa, fundo de emergência, quanto guardar por mês para cada meta).
        </div>
        <div style={{ display: "flex", gap: theme.spacing.sm, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <TextField label="Renda mensal líquida (R$)" type="number" value={income} onChange={setIncome} required />
          </div>
          <PrimaryButton onClick={handleSaveIncome} disabled={!income || saving}>
            {saving ? "Salvando..." : "Calcular"}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.lg }}>
      <div style={{ ...glassSurface(theme, { strong: true }), padding: theme.spacing.lg }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: theme.spacing.md }}>
          <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>
            Seu 50/30/20 — renda de {formatBRL(budget.monthlyIncome)}/mês
          </div>
          <div style={{ display: "flex", gap: theme.spacing.sm, alignItems: "center" }}>
            <input
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              type="number"
              style={{
                width: 110,
                background: theme.mode === "light" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${theme.glass.borderSoft}`,
                borderRadius: theme.radius.sm,
                padding: "4px 8px",
                fontSize: theme.typography.sizes.xs,
                color: theme.colors.textPrimary,
              }}
            />
            <button onClick={handleSaveIncome} style={{ background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.xs, cursor: "pointer" }}>
              Atualizar renda
            </button>
          </div>
        </div>

        <div style={{ fontFamily: "monospace", fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginBottom: theme.spacing.md }}>
          Necessidades: {formatBRL(budget.monthlyIncome)} × 50% = {formatBRL(budget.target.necessidade)} · Desejos: × 30% = {formatBRL(budget.target.desejo)} ·
          Poupança: × 20% = {formatBRL(budget.target.poupanca)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: theme.spacing.md }}>
          <BudgetBar theme={theme} label="Necessidades" target={budget.target.necessidade} spent={budget.spent.necessidade} color={theme.colors.primary} />
          <BudgetBar theme={theme} label="Desejos" target={budget.target.desejo} spent={budget.spent.desejo} color={theme.colors.categoryAcademico} />
          <BudgetBar theme={theme} label="Poupança" target={budget.target.poupanca} spent={budget.spent.poupanca} color={theme.colors.categoryPessoal} />
        </div>
        {budget.spent.sem_categoria > 0 && (
          <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginTop: theme.spacing.sm }}>
            {formatBRL(budget.spent.sem_categoria)} em despesas deste mês ainda sem classificação — edite-as para entrarem na conta.
          </div>
        )}
      </div>

      <div style={{ ...glassSurface(theme, { strong: true }), padding: theme.spacing.lg }}>
        <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }}>
          Fundo de emergência
        </div>
        <div style={{ display: "flex", gap: theme.spacing.md, alignItems: "center", marginBottom: theme.spacing.sm, flexWrap: "wrap" }}>
          <label style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary }}>
            Meses de reserva:{" "}
            <select
              value={emergencyMonths}
              onChange={(e) => setEmergencyMonths(Number(e.target.value))}
              style={{ background: "transparent", border: `1px solid ${theme.glass.borderSoft}`, borderRadius: theme.radius.sm, color: theme.colors.textPrimary, padding: "2px 6px" }}
            >
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
            </select>
          </label>
          <label style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textSecondary, display: "flex", alignItems: "center", gap: 6 }}>
            Já guardado (R$):
            <input
              value={emergencySaved}
              onChange={(e) => handleSaveEmergency(e.target.value)}
              type="number"
              style={{
                width: 100,
                background: theme.mode === "light" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${theme.glass.borderSoft}`,
                borderRadius: theme.radius.sm,
                padding: "4px 8px",
                fontSize: theme.typography.sizes.sm,
                color: theme.colors.textPrimary,
              }}
            />
          </label>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginBottom: 8 }}>
          Despesas essenciais ({formatBRL(necessidadeEssencial)}) × {emergencyMonths} meses = {formatBRL(emergencyTarget)} de meta
        </div>
        <div style={{ height: 10, borderRadius: 5, background: theme.glass.borderSoft, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ height: "100%", width: `${Math.min(100, (Number(emergencySaved) / emergencyTarget) * 100)}%`, background: theme.colors.primary }} />
        </div>
        <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary }}>
          {emergencyGap > 0
            ? `Faltam ${formatBRL(emergencyGap)} para completar a reserva.`
            : "Reserva de emergência completa! 🎉"}
        </div>
      </div>

      {goals.length > 0 && (
        <div style={{ ...glassSurface(theme, { strong: true }), padding: theme.spacing.lg }}>
          <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }}>
            Quanto guardar por mês para cada meta
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
            {goals.map((g) => {
              const remaining = Math.max(0, Number(g.target_amount) - Number(g.current_amount));
              const monthsLeft = g.target_date
                ? Math.max(1, Math.ceil((new Date(g.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
                : null;
              const monthly = monthsLeft ? remaining / monthsLeft : null;
              return (
                <div key={g.id} style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary }}>
                  <strong>{g.name}:</strong> faltam {formatBRL(remaining)}
                  {monthly !== null ? (
                    <span style={{ fontFamily: "monospace", color: theme.colors.textSecondary }}>
                      {" "}
                      — {formatBRL(remaining)} ÷ {monthsLeft} meses = guardar <strong>{formatBRL(monthly)}/mês</strong>
                    </span>
                  ) : (
                    <span style={{ color: theme.colors.textSecondary }}> — defina uma data alvo para eu calcular o valor mensal.</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetBar({
  theme,
  label,
  target,
  spent,
  color,
}: {
  theme: ReturnType<typeof useTheme>["theme"];
  label: string;
  target: number;
  spent: number;
  color: string;
}) {
  const pct = target > 0 ? Math.min(150, (spent / target) * 100) : 0;
  const over = spent > target;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: over ? theme.colors.danger : theme.colors.textSecondary }}>
          {formatBRL(spent)} / {formatBRL(target)}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: theme.glass.borderSoft, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: over ? theme.colors.danger : color }} />
      </div>
    </div>
  );
}

function PersonalFinance() {
  const { theme } = useTheme();
  const [cashflow, setCashflow] = useState<CashflowMonth[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [principles, setPrinciples] = useState<PersonalFinancePrinciple[]>([]);
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPrinciples, setShowPrinciples] = useState(false);

  async function refreshGoals() {
    const { goals } = await listSavingsGoals();
    setGoals(goals);
  }

  async function refreshBudget() {
    const b = await getBudgetSummary();
    setBudget(b);
  }

  useEffect(() => {
    Promise.all([getCashflow("pessoal"), listSavingsGoals(), listFinancePrinciples(), getBudgetSummary()]).then(([cf, g, p, b]) => {
      setCashflow(cf.months);
      setGoals(g.goals);
      setPrinciples(p.principles);
      setBudget(b);
      setLoading(false);
    });
  }, []);

  async function handleCreateGoal() {
    if (!goalName.trim() || !goalTarget) return;
    await createSavingsGoal({ name: goalName.trim(), targetAmount: Number(goalTarget), targetDate: goalDate || undefined });
    setGoalName("");
    setGoalTarget("");
    setGoalDate("");
    setShowGoalForm(false);
    refreshGoals();
  }

  async function handleUpdateGoal(id: string, current: string) {
    const value = Number(prompt("Quanto já foi guardado para essa meta (R$)?", current));
    if (Number.isNaN(value)) return;
    await updateSavingsGoal(id, value);
    refreshGoals();
  }

  async function handleDeleteGoal(id: string) {
    await deleteSavingsGoal(id);
    refreshGoals();
  }

  if (loading) return <div style={{ color: theme.colors.textSecondary }}>Carregando...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.xl }}>
      {budget && <BudgetPlanner budget={budget} goals={goals} onIncomeSaved={refreshBudget} />}

      <CashflowChart months={cashflow} />

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: theme.spacing.sm }}>
          <div style={{ fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary }}>Objetivos de enriquecer</div>
          <button onClick={() => setShowGoalForm(true)} style={{ background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.xs, cursor: "pointer" }}>
            + Nova meta
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
          {goals.length === 0 && (
            <div style={{ ...glassSurface(theme), padding: theme.spacing.md, color: theme.colors.textSecondary, textAlign: "center", fontSize: theme.typography.sizes.sm }}>
              Nenhuma meta criada ainda.
            </div>
          )}
          {goals.map((g) => {
            const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100);
            return (
              <div key={g.id} style={{ ...glassSurface(theme), padding: theme.spacing.md }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: theme.typography.weights.medium, color: theme.colors.textPrimary }}>{g.name}</span>
                  <button onClick={() => handleDeleteGoal(g.id)} style={{ background: "none", border: "none", color: theme.colors.danger, cursor: "pointer" }}>🗑</button>
                </div>
                <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginBottom: 4 }}>
                  {formatBRL(Number(g.current_amount))} de {formatBRL(Number(g.target_amount))}
                  {g.target_date ? ` · até ${new Date(g.target_date).toLocaleDateString("pt-BR")}` : ""}
                </div>
                <div style={{ height: 8, borderRadius: 4, background: theme.glass.borderSoft, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: theme.colors.primary }} />
                </div>
                <button
                  onClick={() => handleUpdateGoal(g.id, g.current_amount)}
                  style={{ background: "none", border: "none", color: theme.colors.primary, fontSize: theme.typography.sizes.xs, cursor: "pointer", marginTop: 4, padding: 0 }}
                >
                  Atualizar valor guardado
                </button>
              </div>
            );
          })}
        </div>

        {showGoalForm && (
          <GlassModal title="Nova meta de economia" onClose={() => setShowGoalForm(false)}>
            <TextField label="Nome" value={goalName} onChange={setGoalName} placeholder="Reserva de emergência, viagem, entrada de imóvel..." required />
            <TextField label="Valor alvo (R$)" type="number" value={goalTarget} onChange={setGoalTarget} required />
            <TextField label="Data alvo (opcional)" type="date" value={goalDate} onChange={setGoalDate} />
            <PrimaryButton onClick={handleCreateGoal} disabled={!goalName.trim() || !goalTarget}>
              Criar meta
            </PrimaryButton>
          </GlassModal>
        )}
      </div>

      <ExpensesSection domain="pessoal" />

      <div>
        <div onClick={() => setShowPrinciples(!showPrinciples)} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }}>
          Por que essas contas? (referência científica)
          <span style={{ color: theme.colors.textSecondary }}>{showPrinciples ? "▲" : "▼"}</span>
        </div>
        {showPrinciples && (
          <>
            <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }}>
              Conteúdo educacional geral e sourced — não é recomendação de investimento personalizada. Decisões financeiras específicas devem ser avaliadas com um profissional licenciado.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
              {principles.map((p) => (
                <div key={p.id} style={{ ...glassSurface(theme), padding: theme.spacing.md }}>
                  <div style={{ fontWeight: theme.typography.weights.medium, color: theme.colors.textPrimary, marginBottom: 4 }}>{p.title}</div>
                  <div style={{ fontSize: theme.typography.sizes.sm, color: theme.colors.textPrimary, marginBottom: 6 }}>{p.summary}</div>
                  <div style={{ fontSize: theme.typography.sizes.xs, color: theme.colors.textSecondary, borderTop: `1px solid ${theme.glass.borderSoft}`, paddingTop: 4 }}>
                    Fonte: {p.source} ({new Date(p.source_date).toLocaleDateString("pt-BR")})
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReceiptPrint({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  async function handlePrint() {
    if (payment.patient_id) {
      await logAuditAction(payment.patient_id, {
        action: "impresso",
        entityType: "recibo",
        description: `Recibo impresso: ${formatBRL(Number(payment.amount))} (${payment.plan_title})`,
      });
    }
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
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <div style={{ textAlign: "center", borderBottom: "2px solid #1a1a1a", paddingBottom: 16, marginBottom: 32 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Recibo</div>
        </div>

        <div style={{ fontSize: 15, lineHeight: 1.8 }}>
          <p>
            Recebi de <strong>{payment.patient_name}</strong> a importância de{" "}
            <strong>{formatBRL(Number(payment.amount))}</strong>, referente a {payment.plan_title}.
          </p>
          <p>
            Data do pagamento: {new Date(payment.paid_at).toLocaleDateString("pt-BR")}
            {payment.method ? ` — Forma: ${payment.method}` : ""}
          </p>
          {payment.notes && <p>Observações: {payment.notes}</p>}
        </div>

        <div style={{ marginTop: 80, textAlign: "center" }}>
          <div style={{ borderTop: "1px solid #1a1a1a", width: 320, margin: "0 auto" }} />
          <div style={{ fontSize: 13, marginTop: 6 }}>Assinatura</div>
        </div>

        <div className="sc-no-print" style={{ display: "flex", gap: 8, marginTop: 32, justifyContent: "center" }}>
          <button onClick={handlePrint} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0E7C7B", color: "#fff", cursor: "pointer" }}>
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
