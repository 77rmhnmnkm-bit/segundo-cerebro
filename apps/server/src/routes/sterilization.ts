import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";

// Rastreabilidade de esterilização (RDC nº 1.002/2025). Registra ciclos com os
// dados obrigatórios da etiqueta e o monitoramento por indicador biológico.
export async function sterilizationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/sterilization/cycles", async () => {
    const r = await pool.query("select * from sterilization_cycles order by sterilized_at desc limit 200");
    return { cycles: r.rows };
  });

  app.post("/sterilization/cycles", async (req, reply) => {
    const b = req.body as {
      autoclave?: string;
      cycleNumber?: string;
      lotNumber?: string;
      materialType?: string;
      operator?: string;
      sterilizedAt?: string;
      chemicalIndicator?: string;
      biologicalIndicator?: string;
      hasImplant?: boolean;
      notes?: string;
    };
    if (!b.autoclave?.trim() || !b.operator?.trim()) {
      return reply.code(400).send({ error: "autoclave e operador são obrigatórios." });
    }
    // Lote: gera um identificador rastreável se não informado.
    const sterilizedAt = b.sterilizedAt ? new Date(b.sterilizedAt) : new Date();
    const lot = b.lotNumber?.trim() || autoLot(b.autoclave.trim(), b.cycleNumber, sterilizedAt);
    const chem = ["ok", "fail", "na"].includes(b.chemicalIndicator ?? "") ? b.chemicalIndicator : "ok";
    const bio = ["na", "pending", "pass", "fail"].includes(b.biologicalIndicator ?? "") ? b.biologicalIndicator : "na";

    const r = await pool.query(
      `insert into sterilization_cycles
        (autoclave, cycle_number, lot_number, material_type, operator, sterilized_at, chemical_indicator, biological_indicator, has_implant, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [
        b.autoclave.trim(),
        b.cycleNumber?.trim() || null,
        lot,
        b.materialType?.trim() || null,
        b.operator.trim(),
        sterilizedAt.toISOString(),
        chem,
        bio,
        !!b.hasImplant,
        b.notes?.trim() || null,
      ],
    );
    return reply.code(201).send({ cycle: r.rows[0] });
  });

  app.delete("/sterilization/cycles/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await pool.query("delete from sterilization_cycles where id = $1", [id]);
    return reply.code(204).send();
  });

  app.get("/sterilization/bi", async () => {
    const r = await pool.query("select * from sterilization_bi_tests order by tested_at desc, created_at desc limit 200");
    return { tests: r.rows };
  });

  app.post("/sterilization/bi", async (req, reply) => {
    const b = req.body as { autoclave?: string; testedAt?: string; lotNumber?: string; result?: string; notes?: string };
    if (!b.autoclave?.trim()) return reply.code(400).send({ error: "autoclave é obrigatório." });
    const result = ["pending", "pass", "fail"].includes(b.result ?? "") ? b.result : "pending";
    const r = await pool.query(
      `insert into sterilization_bi_tests (autoclave, tested_at, lot_number, result, notes)
       values ($1, coalesce($2, current_date), $3, $4, $5) returning *`,
      [b.autoclave.trim(), b.testedAt || null, b.lotNumber?.trim() || null, result, b.notes?.trim() || null],
    );
    return reply.code(201).send({ test: r.rows[0] });
  });

  // Status para o banner: indicador biológico atrasado (>7 dias), falhas abertas.
  app.get("/sterilization/status", async () => {
    const lastBi = (await pool.query("select tested_at, result from sterilization_bi_tests order by tested_at desc, created_at desc limit 1")).rows[0];
    let daysSinceBi: number | null = null;
    if (lastBi) {
      const diff = Date.now() - new Date(lastBi.tested_at).getTime();
      daysSinceBi = Math.floor(diff / 86400000);
    }
    const biOverdue = daysSinceBi === null || daysSinceBi > 7;
    const fails = (
      await pool.query(
        `select
           (select count(*) from sterilization_bi_tests where result = 'fail') +
           (select count(*) from sterilization_cycles where chemical_indicator = 'fail' or biological_indicator = 'fail') as n`,
      )
    ).rows[0].n;
    const week = (await pool.query("select count(*) n from sterilization_cycles where sterilized_at >= current_date - interval '7 days'")).rows[0].n;
    return {
      lastBiDate: lastBi?.tested_at ?? null,
      lastBiResult: lastBi?.result ?? null,
      biOverdue,
      daysSinceBi,
      openFails: Number(fails),
      cyclesThisWeek: Number(week),
    };
  });
}

function autoLot(autoclave: string, cycle: string | undefined, date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const slug = autoclave.replace(/\s+/g, "").slice(0, 6).toUpperCase();
  return `${y}${m}${d}-${slug}${cycle ? `-C${cycle}` : ""}`;
}
