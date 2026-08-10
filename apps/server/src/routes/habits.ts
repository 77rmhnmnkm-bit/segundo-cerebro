import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";

// #24 Rastreador de hábitos baseado em ciência. Streak e contagem dos últimos
// 7 dias são calculados no servidor a partir de habit_logs (datas locais).
export async function habitsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/habits", async () => {
    const habits = await pool.query("select * from habits where active = true order by created_at");
    const logs = await pool.query(
      "select habit_id, log_date from habit_logs where log_date >= current_date - interval '60 days'",
    );
    const byHabit = new Map<string, Set<string>>();
    for (const l of logs.rows) {
      const key = l.habit_id as string;
      const d = toIso(l.log_date);
      if (!byHabit.has(key)) byHabit.set(key, new Set());
      byHabit.get(key)!.add(d);
    }
    const todayIso = toIso(new Date());
    const last7 = lastNDates(7);

    const result = habits.rows.map((h) => {
      const dates = byHabit.get(h.id) ?? new Set<string>();
      return {
        ...h,
        done_today: dates.has(todayIso),
        streak: currentStreak(dates),
        done_last_7: last7.filter((d) => dates.has(d)).length,
        log_dates: [...dates].sort(),
      };
    });
    return { habits: result };
  });

  app.post("/habits", async (req, reply) => {
    const b = req.body as { name?: string; rationale?: string; source?: string; cadence?: string; targetPerWeek?: number };
    if (!b.name?.trim()) return reply.code(400).send({ error: "name é obrigatório." });
    const cadence = b.cadence === "weekly" ? "weekly" : "daily";
    const r = await pool.query(
      "insert into habits (name, rationale, source, cadence, target_per_week) values ($1,$2,$3,$4,$5) returning *",
      [b.name.trim(), b.rationale ?? null, b.source ?? null, cadence, b.targetPerWeek ?? null],
    );
    return reply.code(201).send({ habit: r.rows[0] });
  });

  // Marca/desmarca o hábito num dia (padrão: hoje).
  app.post("/habits/:id/toggle", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { date } = (req.body as { date?: string }) ?? {};
    const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toIso(new Date());
    const existing = await pool.query("select id from habit_logs where habit_id = $1 and log_date = $2", [id, day]);
    if (existing.rowCount) {
      await pool.query("delete from habit_logs where id = $1", [existing.rows[0].id]);
      return { done: false };
    }
    await pool.query("insert into habit_logs (habit_id, log_date) values ($1, $2) on conflict do nothing", [id, day]);
    return { done: true };
  });

  app.delete("/habits/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await pool.query("update habits set active = false where id = $1", [id]);
    return reply.code(204).send();
  });
}

function toIso(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  // data local y-m-d (evita rollover UTC-3)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(toIso(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

// Sequência de dias consecutivos terminando hoje (ou ontem, se hoje ainda não feito).
function currentStreak(dates: Set<string>): number {
  let streak = 0;
  const d = new Date();
  if (!dates.has(toIso(d))) d.setDate(d.getDate() - 1); // permite contar a partir de ontem
  while (dates.has(toIso(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
