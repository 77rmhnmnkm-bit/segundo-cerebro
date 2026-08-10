import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";

export async function notesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/notes", async () => {
    const result = await pool.query("select * from inbox_items order by done asc, created_at desc");
    return { notes: result.rows };
  });

  app.post("/notes", async (req, reply) => {
    const { content } = req.body as { content: string };
    if (!content?.trim()) {
      return reply.code(400).send({ error: "content é obrigatório." });
    }
    const result = await pool.query("insert into inbox_items (content) values ($1) returning *", [content.trim()]);
    return reply.code(201).send({ note: result.rows[0] });
  });

  app.patch("/notes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { done } = req.body as { done: boolean };
    const result = await pool.query("update inbox_items set done = $1 where id = $2 returning *", [done, id]);
    if (result.rowCount === 0) return reply.code(404).send({ error: "Nota não encontrada." });
    return { note: result.rows[0] };
  });

  app.delete("/notes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await pool.query("delete from inbox_items where id = $1", [id]);
    return reply.code(204).send();
  });
}
