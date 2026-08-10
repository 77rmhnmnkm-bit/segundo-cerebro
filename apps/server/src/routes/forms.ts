import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";
import { logPatientAction } from "../audit.js";

export async function formsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Latest version of each template type — older versions stay in the table
  // (untouched) so historical responses keep resolving correctly.
  app.get("/form-templates", async () => {
    const result = await pool.query(
      `select distinct on (type) *
       from form_templates
       order by type, version desc`,
    );
    return { templates: result.rows };
  });

  app.get("/form-templates/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const template = await pool.query("select * from form_templates where id = $1", [id]);
    if (template.rowCount === 0) return reply.code(404).send({ error: "Template não encontrado." });
    const fields = await pool.query(
      "select * from form_template_fields where template_id = $1 order by order_index",
      [id],
    );
    return { template: template.rows[0], fields: fields.rows };
  });

  app.get("/patients/:id/form-responses", async (req) => {
    const { id } = req.params as { id: string };
    const result = await pool.query(
      `select r.*, t.name as template_name, t.type as template_type
       from form_responses r
       join form_templates t on t.id = r.template_id
       where r.patient_id = $1
       order by r.created_at desc`,
      [id],
    );
    return { responses: result.rows };
  });

  app.get("/form-responses/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const response = await pool.query(
      `select r.*, t.name as template_name, t.type as template_type
       from form_responses r
       join form_templates t on t.id = r.template_id
       where r.id = $1`,
      [id],
    );
    if (response.rowCount === 0) return reply.code(404).send({ error: "Resposta não encontrada." });

    const values = await pool.query(
      `select v.*, f.label, f.field_type, f.section, f.order_index
       from form_response_values v
       join form_template_fields f on f.id = v.field_id
       where v.response_id = $1
       order by f.order_index`,
      [id],
    );
    return { response: response.rows[0], values: values.rows };
  });

  app.post("/patients/:id/form-responses", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { templateId: string; values: { fieldId: string; value: unknown }[] };
    if (!body.templateId || !Array.isArray(body.values)) {
      return reply.code(400).send({ error: "templateId e values são obrigatórios." });
    }

    const template = await pool.query("select * from form_templates where id = $1", [body.templateId]);
    if (template.rowCount === 0) return reply.code(404).send({ error: "Template não encontrado." });

    const client = await pool.connect();
    try {
      await client.query("begin");
      const response = await client.query(
        "insert into form_responses (patient_id, template_id, template_version) values ($1, $2, $3) returning *",
        [id, body.templateId, template.rows[0].version],
      );
      const responseId = response.rows[0].id;

      for (const v of body.values) {
        await client.query(
          "insert into form_response_values (response_id, field_id, value) values ($1, $2, $3)",
          [responseId, v.fieldId, JSON.stringify(v.value)],
        );
      }

      await client.query("commit");
      await logPatientAction(id, "criado", "formulario", `Formulário preenchido: ${template.rows[0].name}`);
      return reply.code(201).send({ response: response.rows[0] });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  });

  app.delete("/form-responses/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await pool.query(
      `select r.*, t.name as template_name from form_responses r join form_templates t on t.id = r.template_id where r.id = $1`,
      [id],
    );
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Resposta não encontrada." });
    const response = existing.rows[0];
    await pool.query("delete from form_responses where id = $1", [id]);
    await logPatientAction(response.patient_id, "excluido", "formulario", `Formulário removido: ${response.template_name}`);
    return reply.code(204).send();
  });
}
