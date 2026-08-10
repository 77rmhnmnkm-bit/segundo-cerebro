import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";

// #26 PKM (Zettelkasten): notas com [[links]] entre si. Links e backlinks são
// derivados do corpo das notas — sem tabela de ligação separada.
const WIKILINK = /\[\[([^\]]+)\]\]/g;

function extractLinks(body: string): string[] {
  const titles = new Set<string>();
  for (const m of body.matchAll(WIKILINK)) {
    const t = m[1].trim();
    if (t) titles.add(t);
  }
  return [...titles];
}

export async function knowledgeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/knowledge", async () => {
    const r = await pool.query(
      "select id, title, body, updated_at from knowledge_notes order by updated_at desc",
    );
    const notes = r.rows.map((n) => ({
      id: n.id,
      title: n.title,
      updated_at: n.updated_at,
      snippet: (n.body as string).replace(WIKILINK, "$1").slice(0, 140),
      link_count: extractLinks(n.body).length,
    }));
    return { notes };
  });

  app.get("/knowledge/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await pool.query("select * from knowledge_notes where id = $1", [id]);
    if (r.rowCount === 0) return reply.code(404).send({ error: "Nota não encontrada." });
    const note = r.rows[0];

    const titles = extractLinks(note.body);
    const links: { id: string; title: string }[] = [];
    const missing: string[] = [];
    if (titles.length) {
      const found = await pool.query(
        `select id, title from knowledge_notes where lower(title) = any($1::text[])`,
        [titles.map((t) => t.toLowerCase())],
      );
      const foundByLower = new Map(found.rows.map((f) => [f.title.toLowerCase(), f]));
      for (const t of titles) {
        const hit = foundByLower.get(t.toLowerCase());
        if (hit) links.push({ id: hit.id, title: hit.title });
        else missing.push(t);
      }
    }

    // Backlinks: notas cujo corpo cita [[este título]].
    const back = await pool.query(
      `select id, title from knowledge_notes
       where id <> $1 and lower(body) like '%[[' || lower($2) || ']]%' order by updated_at desc`,
      [id, note.title],
    );

    return { note: { ...note, links, missing_links: missing, backlinks: back.rows } };
  });

  app.post("/knowledge", async (req, reply) => {
    const b = req.body as { title?: string; body?: string };
    if (!b.title?.trim()) return reply.code(400).send({ error: "title é obrigatório." });
    const r = await pool.query(
      "insert into knowledge_notes (title, body) values ($1, $2) returning *",
      [b.title.trim(), b.body ?? ""],
    );
    return reply.code(201).send({ note: r.rows[0] });
  });

  app.put("/knowledge/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { title?: string; body?: string };
    const r = await pool.query(
      `update knowledge_notes set
         title = coalesce($1, title),
         body = coalesce($2, body),
         updated_at = now()
       where id = $3 returning *`,
      [b.title?.trim() ?? null, b.body ?? null, id],
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: "Nota não encontrada." });
    return { note: r.rows[0] };
  });

  app.delete("/knowledge/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await pool.query("delete from knowledge_notes where id = $1", [id]);
    return reply.code(204).send();
  });
}
