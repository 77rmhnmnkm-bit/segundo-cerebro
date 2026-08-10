import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";
import { logPatientAction } from "../audit.js";

export async function treatmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Treatment plans
  app.get("/patients/:id/treatment-plans", async (req) => {
    const { id } = req.params as { id: string };
    const plans = await pool.query("select * from treatment_plans where patient_id = $1 order by created_at desc", [id]);
    return { plans: plans.rows };
  });

  app.post("/patients/:id/treatment-plans", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { title } = req.body as { title: string };
    if (!title?.trim()) return reply.code(400).send({ error: "title é obrigatório." });
    const result = await pool.query(
      "insert into treatment_plans (patient_id, title) values ($1, $2) returning *",
      [id, title.trim()],
    );
    return reply.code(201).send({ plan: result.rows[0] });
  });

  app.patch("/treatment-plans/:planId", async (req, reply) => {
    const { planId } = req.params as { planId: string };
    const { status } = req.body as { status: string };
    const result = await pool.query(
      "update treatment_plans set status = $1, updated_at = now() where id = $2 returning *",
      [status, planId],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "Plano não encontrado." });
    return { plan: result.rows[0] };
  });

  app.delete("/treatment-plans/:planId", async (req, reply) => {
    const { planId } = req.params as { planId: string };
    const existing = await pool.query("select * from treatment_plans where id = $1", [planId]);
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Plano não encontrado." });
    const plan = existing.rows[0];
    await pool.query("delete from treatment_plans where id = $1", [planId]);
    await logPatientAction(plan.patient_id, "excluido", "plano_tratamento", `Plano de tratamento removido: ${plan.title}`);
    return reply.code(204).send();
  });

  // Steps
  app.get("/treatment-plans/:planId/steps", async (req) => {
    const { planId } = req.params as { planId: string };
    const result = await pool.query(
      "select * from treatment_plan_steps where plan_id = $1 order by order_index",
      [planId],
    );
    return { steps: result.rows };
  });

  app.post("/treatment-plans/:planId/steps", async (req, reply) => {
    const { planId } = req.params as { planId: string };
    const body = req.body as { description: string; procedureName?: string; value?: number };
    if (!body.description?.trim()) return reply.code(400).send({ error: "description é obrigatório." });

    const countResult = await pool.query("select count(*) from treatment_plan_steps where plan_id = $1", [planId]);
    const orderIndex = Number(countResult.rows[0].count);

    const result = await pool.query(
      `insert into treatment_plan_steps (plan_id, description, procedure_name, value, order_index)
       values ($1, $2, $3, $4, $5) returning *`,
      [planId, body.description.trim(), body.procedureName ?? null, body.value ?? null, orderIndex],
    );
    return reply.code(201).send({ step: result.rows[0] });
  });

  app.patch("/treatment-plan-steps/:stepId", async (req, reply) => {
    const { stepId } = req.params as { stepId: string };
    const body = req.body as { status?: string; description?: string; procedureName?: string; value?: number | null };

    const columnMap: Record<string, string> = {
      status: "status",
      description: "description",
      procedureName: "procedure_name",
      value: "value",
    };

    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(columnMap)) {
      if (key in body) {
        values.push((body as Record<string, unknown>)[key]);
        sets.push(`${column} = $${values.length}`);
      }
    }
    if (sets.length === 0) return reply.code(400).send({ error: "Nenhum campo para atualizar." });

    values.push(stepId);
    const result = await pool.query(
      `update treatment_plan_steps set ${sets.join(", ")} where id = $${values.length} returning *`,
      values,
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "Etapa não encontrada." });
    return { step: result.rows[0] };
  });

  app.delete("/treatment-plan-steps/:stepId", async (req, reply) => {
    const { stepId } = req.params as { stepId: string };
    const existing = await pool.query(
      "select s.*, p.patient_id from treatment_plan_steps s join treatment_plans p on p.id = s.plan_id where s.id = $1",
      [stepId],
    );
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Etapa não encontrada." });
    const step = existing.rows[0];
    await pool.query("delete from treatment_plan_steps where id = $1", [stepId]);
    await logPatientAction(step.patient_id, "excluido", "etapa_tratamento", `Etapa removida: ${step.description}`);
    return reply.code(204).send();
  });

  // Payments
  app.get("/treatment-plans/:planId/payments", async (req) => {
    const { planId } = req.params as { planId: string };
    const result = await pool.query("select * from payments where plan_id = $1 order by paid_at desc", [planId]);
    return { payments: result.rows };
  });

  app.post("/treatment-plans/:planId/payments", async (req, reply) => {
    const { planId } = req.params as { planId: string };
    const body = req.body as { amount: number; stepId?: string; paidAt?: string; method?: string; notes?: string };
    if (!body.amount) return reply.code(400).send({ error: "amount é obrigatório." });
    const result = await pool.query(
      `insert into payments (plan_id, step_id, amount, paid_at, method, notes)
       values ($1, $2, $3, coalesce($4, current_date), $5, $6) returning *`,
      [planId, body.stepId ?? null, body.amount, body.paidAt ?? null, body.method ?? null, body.notes ?? null],
    );
    return reply.code(201).send({ payment: result.rows[0] });
  });

  app.delete("/payments/:paymentId", async (req, reply) => {
    const { paymentId } = req.params as { paymentId: string };
    const existing = await pool.query(
      "select pay.*, plan.patient_id from payments pay join treatment_plans plan on plan.id = pay.plan_id where pay.id = $1",
      [paymentId],
    );
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Pagamento não encontrado." });
    const payment = existing.rows[0];
    await pool.query("delete from payments where id = $1", [paymentId]);
    await logPatientAction(payment.patient_id, "excluido", "pagamento", `Pagamento removido: R$ ${payment.amount}`);
    return reply.code(204).send();
  });

  // Recall schedules
  app.get("/patients/:id/recalls", async (req) => {
    const { id } = req.params as { id: string };
    const result = await pool.query(
      "select * from recall_schedules where patient_id = $1 order by due_date",
      [id],
    );
    return { recalls: result.rows };
  });

  app.post("/patients/:id/recalls", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { recallType: string; dueDate: string };
    if (!body.recallType?.trim() || !body.dueDate) {
      return reply.code(400).send({ error: "recallType e dueDate são obrigatórios." });
    }
    const result = await pool.query(
      "insert into recall_schedules (patient_id, recall_type, due_date) values ($1, $2, $3) returning *",
      [id, body.recallType.trim(), body.dueDate],
    );
    return reply.code(201).send({ recall: result.rows[0] });
  });

  app.patch("/recalls/:recallId", async (req, reply) => {
    const { recallId } = req.params as { recallId: string };
    const { completed } = req.body as { completed: boolean };
    const result = await pool.query(
      "update recall_schedules set completed = $1 where id = $2 returning *",
      [completed, recallId],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "Recall não encontrado." });
    return { recall: result.rows[0] };
  });

  app.delete("/recalls/:recallId", async (req, reply) => {
    const { recallId } = req.params as { recallId: string };
    const existing = await pool.query("select * from recall_schedules where id = $1", [recallId]);
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Recall não encontrado." });
    const recall = existing.rows[0];
    await pool.query("delete from recall_schedules where id = $1", [recallId]);
    await logPatientAction(recall.patient_id, "excluido", "recall", `Recall removido: ${recall.recall_type}`);
    return reply.code(204).send();
  });

  // Cross-patient: upcoming recalls, used by the dashboard widget.
  app.get("/recalls/upcoming", async (req) => {
    const { days } = req.query as { days?: string };
    const numDays = Math.min(Math.max(Number(days) || 30, 1), 365);
    const result = await pool.query(
      `select r.*, p.name as patient_name
       from recall_schedules r
       join patients p on p.id = r.patient_id
       where r.completed = false and r.due_date <= current_date + ($1::int || ' days')::interval
       order by r.due_date`,
      [numDays],
    );
    return { recalls: result.rows };
  });

  // Financeiro — cross-patient view, since payments are otherwise only
  // visible nested inside each patient's treatment plan.
  app.get("/finance/summary", async (req) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (from) {
      values.push(from);
      conditions.push(`paid_at >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      conditions.push(`paid_at <= $${values.length}`);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

    const received = await pool.query(
      `select coalesce(sum(amount), 0) as total, count(*) as count from payments ${where}`,
      values,
    );
    const pending = await pool.query(
      `select coalesce(sum(s.value), 0) as total, count(*) as count
       from treatment_plan_steps s
       where s.status != 'concluido' and s.value is not null
         and not exists (select 1 from payments p where p.step_id = s.id)`,
    );

    return {
      totalReceived: received.rows[0].total,
      paymentsCount: Number(received.rows[0].count),
      totalPending: pending.rows[0].total,
      pendingCount: Number(pending.rows[0].count),
    };
  });

  app.get("/finance/payments", async (req) => {
    const { limit } = req.query as { limit?: string };
    const numLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const result = await pool.query(
      `select pay.*, plan.title as plan_title, plan.patient_id, pat.name as patient_name
       from payments pay
       join treatment_plans plan on plan.id = pay.plan_id
       join patients pat on pat.id = plan.patient_id
       order by pay.paid_at desc, pay.created_at desc
       limit $1`,
      [numLimit],
    );
    return { payments: result.rows };
  });

  // Expenses — covers both domains (clínica/trabalho and pessoal), mirroring
  // the accounts-payable side that dental practice-management software
  // always pairs with receivables.
  app.get("/finance/expenses", async (req) => {
    const { domain } = req.query as { domain?: "trabalho" | "pessoal" };
    const result = domain
      ? await pool.query("select * from expenses where domain = $1 order by paid_at desc", [domain])
      : await pool.query("select * from expenses order by paid_at desc");
    return { expenses: result.rows };
  });

  app.post("/finance/expenses", async (req, reply) => {
    const body = req.body as {
      domain: "trabalho" | "pessoal";
      category: string;
      description?: string;
      amount: number;
      paidAt?: string;
      recurring?: boolean;
      bucket?: "necessidade" | "desejo" | "poupanca";
    };
    if (!body.domain || !body.category || !body.amount) {
      return reply.code(400).send({ error: "domain, category e amount são obrigatórios." });
    }
    const result = await pool.query(
      `insert into expenses (domain, category, description, amount, paid_at, recurring, bucket)
       values ($1, $2, $3, $4, coalesce($5, current_date), coalesce($6, false), $7) returning *`,
      [body.domain, body.category, body.description ?? null, body.amount, body.paidAt ?? null, body.recurring ?? null, body.bucket ?? null],
    );
    return reply.code(201).send({ expense: result.rows[0] });
  });

  app.delete("/finance/expenses/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await pool.query("delete from expenses where id = $1", [id]);
    return reply.code(204).send();
  });

  // Cash flow — monthly income (payments, expense domain=trabalho only counts
  // payments as income) vs expenses, for a given domain.
  app.get("/finance/cashflow", async (req) => {
    const { domain, months } = req.query as { domain?: "trabalho" | "pessoal"; months?: string };
    const numMonths = Math.min(Math.max(Number(months) || 6, 1), 24);

    const incomeQuery =
      domain === "pessoal"
        ? `select to_char(paid_at, 'YYYY-MM') as month, 0::numeric as income from expenses where false group by 1`
        : `select to_char(paid_at, 'YYYY-MM') as month, sum(amount) as income
           from payments
           where paid_at >= current_date - ($1::int || ' months')::interval
           group by 1`;

    const income = await pool.query(incomeQuery, domain === "pessoal" ? [] : [numMonths]);
    const expensesResult = await pool.query(
      `select to_char(paid_at, 'YYYY-MM') as month, sum(amount) as total
       from expenses
       where domain = $1 and paid_at >= current_date - ($2::int || ' months')::interval
       group by 1`,
      [domain ?? "trabalho", numMonths],
    );

    const months_: Record<string, { income: number; expenses: number }> = {};
    for (const row of income.rows) months_[row.month] = { income: Number(row.income), expenses: 0 };
    for (const row of expensesResult.rows) {
      if (!months_[row.month]) months_[row.month] = { income: 0, expenses: 0 };
      months_[row.month].expenses = Number(row.total);
    }

    const sorted = Object.entries(months_)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));

    return { months: sorted };
  });

  // Savings goals (pessoal)
  app.get("/finance/savings-goals", async () => {
    const result = await pool.query("select * from savings_goals order by created_at desc");
    return { goals: result.rows };
  });

  app.post("/finance/savings-goals", async (req, reply) => {
    const body = req.body as { name: string; targetAmount: number; currentAmount?: number; targetDate?: string };
    if (!body.name?.trim() || !body.targetAmount) {
      return reply.code(400).send({ error: "name e targetAmount são obrigatórios." });
    }
    const result = await pool.query(
      "insert into savings_goals (name, target_amount, current_amount, target_date) values ($1, $2, coalesce($3, 0), $4) returning *",
      [body.name.trim(), body.targetAmount, body.currentAmount ?? null, body.targetDate ?? null],
    );
    return reply.code(201).send({ goal: result.rows[0] });
  });

  app.patch("/finance/savings-goals/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { currentAmount } = req.body as { currentAmount: number };
    const result = await pool.query(
      "update savings_goals set current_amount = $1 where id = $2 returning *",
      [currentAmount, id],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "Meta não encontrada." });
    return { goal: result.rows[0] };
  });

  app.delete("/finance/savings-goals/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await pool.query("delete from savings_goals where id = $1", [id]);
    return reply.code(204).send();
  });

  // Personal finance principles — read-only, sourced reference content.
  app.get("/finance/principles", async () => {
    const result = await pool.query("select * from personal_finance_principles order by source_date desc");
    return { principles: result.rows };
  });

  // Budget planner — applies the 50/30/20 rule to the user's own declared
  // income and actual tracked expenses (current calendar month), so the
  // numbers shown are real, not generic advice.
  app.get("/finance/budget", async () => {
    const incomeRow = await pool.query("select value from app_settings where key = 'personal_monthly_income'");
    const monthlyIncome = Number(incomeRow.rows[0]?.value ?? 0);

    const spent = await pool.query(
      `select coalesce(bucket, 'sem_categoria') as bucket, sum(amount) as total
       from expenses
       where domain = 'pessoal' and date_trunc('month', paid_at) = date_trunc('month', current_date)
       group by 1`,
    );

    const spentByBucket: Record<string, number> = { necessidade: 0, desejo: 0, poupanca: 0, sem_categoria: 0 };
    for (const row of spent.rows) spentByBucket[row.bucket] = Number(row.total);

    return {
      monthlyIncome,
      target: {
        necessidade: monthlyIncome * 0.5,
        desejo: monthlyIncome * 0.3,
        poupanca: monthlyIncome * 0.2,
      },
      spent: spentByBucket,
    };
  });
}
