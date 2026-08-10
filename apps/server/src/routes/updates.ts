import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";
import { refreshDentalUpdates } from "../ai/feeds.js";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12h

export async function updatesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get<{ Querystring: { category?: string; evidence?: string } }>("/dental-updates", async (req) => {
    const latest = await pool.query("select max(fetched_at) as last_fetch from dental_updates");
    const lastFetch = latest.rows[0]?.last_fetch;
    const isStale = !lastFetch || Date.now() - new Date(lastFetch).getTime() > STALE_AFTER_MS;

    if (isStale) {
      await refreshDentalUpdates().catch(() => {});
    }

    const { category, evidence } = req.query;
    const conditions: string[] = [];
    const params: string[] = [];
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (evidence) {
      params.push(evidence);
      conditions.push(`evidence_level = $${params.length}`);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const result = await pool.query(
      `select * from dental_updates ${where} order by coalesce(published_at, fetched_at) desc limit 15`,
      params,
    );
    return { updates: result.rows };
  });

  app.post("/dental-updates/refresh", async () => {
    const { added, errors } = await refreshDentalUpdates();
    const result = await pool.query(
      "select * from dental_updates order by coalesce(published_at, fetched_at) desc limit 15",
    );
    return { updates: result.rows, added, errors };
  });
}
