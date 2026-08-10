import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";
import { logPatientAction } from "../audit.js";
import { extractPdfText } from "../ai/extractText.js";

export async function libraryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Specialties + procedures
  app.get("/clinical-specialties", async () => {
    const result = await pool.query("select * from clinical_specialties order by name");
    return { specialties: result.rows };
  });

  app.post("/clinical-specialties", async (req, reply) => {
    const { name } = req.body as { name: string };
    if (!name?.trim()) return reply.code(400).send({ error: "name é obrigatório." });
    const result = await pool.query(
      "insert into clinical_specialties (name) values ($1) returning *",
      [name.trim()],
    );
    return reply.code(201).send({ specialty: result.rows[0] });
  });

  app.get("/clinical-specialties/:id/procedures", async (req) => {
    const { id } = req.params as { id: string };
    const result = await pool.query("select * from procedures where specialty_id = $1 order by name", [id]);
    return { procedures: result.rows };
  });

  app.post("/clinical-specialties/:id/procedures", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name: string; materials?: string; techniqueScript?: string };
    if (!body.name?.trim()) return reply.code(400).send({ error: "name é obrigatório." });
    const result = await pool.query(
      "insert into procedures (specialty_id, name, materials, technique_script) values ($1, $2, $3, $4) returning *",
      [id, body.name.trim(), body.materials ?? null, body.techniqueScript ?? null],
    );
    return reply.code(201).send({ procedure: result.rows[0] });
  });

  app.patch("/procedures/:procedureId", async (req, reply) => {
    const { procedureId } = req.params as { procedureId: string };
    const body = req.body as { name?: string; materials?: string; techniqueScript?: string };
    const sets: string[] = [];
    const values: unknown[] = [];
    if (body.name !== undefined) {
      values.push(body.name);
      sets.push(`name = $${values.length}`);
    }
    if (body.materials !== undefined) {
      values.push(body.materials);
      sets.push(`materials = $${values.length}`);
    }
    if (body.techniqueScript !== undefined) {
      values.push(body.techniqueScript);
      sets.push(`technique_script = $${values.length}`);
    }
    if (sets.length === 0) return reply.code(400).send({ error: "Nenhum campo para atualizar." });
    values.push(procedureId);
    const result = await pool.query(
      `update procedures set ${sets.join(", ")} where id = $${values.length} returning *`,
      values,
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "Procedimento não encontrado." });
    return { procedure: result.rows[0] };
  });

  app.delete("/procedures/:procedureId", async (req, reply) => {
    const { procedureId } = req.params as { procedureId: string };
    await pool.query("delete from procedures where id = $1", [procedureId]);
    return reply.code(204).send();
  });

  // Specialty reference documents — a PDF uploaded once gets its text
  // extracted and stored (cheap); the binary itself is discarded. Printing
  // later reformats this plain text into an elegant A4 layout on demand.
  app.get("/clinical-specialties/:id/documents", async (req) => {
    const { id } = req.params as { id: string };
    const result = await pool.query(
      "select id, specialty_id, title, created_at from specialty_documents where specialty_id = $1 order by created_at desc",
      [id],
    );
    return { documents: result.rows };
  });

  app.get("/specialty-documents/:docId", async (req, reply) => {
    const { docId } = req.params as { docId: string };
    const result = await pool.query("select * from specialty_documents where id = $1", [docId]);
    if (result.rowCount === 0) return reply.code(404).send({ error: "Documento não encontrado." });
    return { document: result.rows[0] };
  });

  app.post("/clinical-specialties/:id/documents", async (req, reply) => {
    const { id } = req.params as { id: string };
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Envie um arquivo PDF." });
    if (file.mimetype !== "application/pdf") return reply.code(400).send({ error: "Apenas PDF é suportado." });

    const buffer = await file.toBuffer();
    const extractedText = await extractPdfText(buffer);
    if (!extractedText) {
      return reply.code(422).send({
        error: "Não encontrei texto nesse PDF — ele parece ser digitalizado (imagem), formato ainda não suportado.",
      });
    }

    const result = await pool.query(
      "insert into specialty_documents (specialty_id, title, extracted_text) values ($1, $2, $3) returning id, specialty_id, title, created_at",
      [id, file.filename ?? "Documento", extractedText],
    );
    return reply.code(201).send({ document: result.rows[0] });
  });

  app.delete("/specialty-documents/:docId", async (req, reply) => {
    const { docId } = req.params as { docId: string };
    await pool.query("delete from specialty_documents where id = $1", [docId]);
    return reply.code(204).send();
  });

  // Drugs (anesthetic/medication reference data)
  app.get("/drugs", async (req) => {
    const { category } = req.query as { category?: string };
    const result = category
      ? await pool.query("select * from drugs where category = $1 order by name", [category])
      : await pool.query("select * from drugs order by category, name");
    return { drugs: result.rows };
  });

  // Instruction templates (pre/post-op)
  app.get("/instruction-templates", async (req) => {
    const { type } = req.query as { type?: string };
    const result = type
      ? await pool.query("select * from instruction_templates where type = $1 order by title", [type])
      : await pool.query("select * from instruction_templates order by type, title");
    return { templates: result.rows };
  });

  app.post("/instruction-templates", async (req, reply) => {
    const body = req.body as { type: string; title: string; body: string };
    if (!body.title?.trim() || !body.body?.trim()) {
      return reply.code(400).send({ error: "title e body são obrigatórios." });
    }
    const result = await pool.query(
      "insert into instruction_templates (type, title, body) values ($1, $2, $3) returning *",
      [body.type, body.title.trim(), body.body],
    );
    return reply.code(201).send({ template: result.rows[0] });
  });

  app.patch("/instruction-templates/:templateId", async (req, reply) => {
    const { templateId } = req.params as { templateId: string };
    const { body } = req.body as { body: string };
    const result = await pool.query(
      "update instruction_templates set body = $1 where id = $2 returning *",
      [body, templateId],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "Modelo não encontrado." });
    return { template: result.rows[0] };
  });

  // Prescriptions (patient-scoped)
  app.get("/patients/:id/prescriptions", async (req) => {
    const { id } = req.params as { id: string };
    const result = await pool.query(
      `select p.*, d.name as drug_name, d.standard_presentation
       from prescriptions p join drugs d on d.id = p.drug_id
       where p.patient_id = $1 order by p.created_at desc`,
      [id],
    );
    return { prescriptions: result.rows };
  });

  app.post("/patients/:id/prescriptions", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { drugId: string; dosageText: string; quantity?: string };
    if (!body.drugId || !body.dosageText?.trim()) {
      return reply.code(400).send({ error: "drugId e dosageText são obrigatórios." });
    }
    const result = await pool.query(
      "insert into prescriptions (patient_id, drug_id, dosage_text, quantity) values ($1, $2, $3, $4) returning *",
      [id, body.drugId, body.dosageText.trim(), body.quantity ?? null],
    );
    const drugName = (await pool.query("select name from drugs where id = $1", [body.drugId])).rows[0]?.name;
    await logPatientAction(id, "criado", "receituario", `Receituário gerado: ${drugName ?? body.drugId}`);
    return reply.code(201).send({ prescription: result.rows[0] });
  });

  app.delete("/prescriptions/:prescriptionId", async (req, reply) => {
    const { prescriptionId } = req.params as { prescriptionId: string };
    const existing = await pool.query(
      "select p.*, d.name as drug_name from prescriptions p join drugs d on d.id = p.drug_id where p.id = $1",
      [prescriptionId],
    );
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Receituário não encontrado." });
    const prescription = existing.rows[0];
    await pool.query("delete from prescriptions where id = $1", [prescriptionId]);
    await logPatientAction(prescription.patient_id, "excluido", "receituario", `Receituário removido: ${prescription.drug_name}`);
    return reply.code(204).send();
  });

  // Dose calculations (patient-scoped) — saved from the clinical calculator,
  // so the math behind any prescribed dose stays attached to the patient's record.
  app.get("/patients/:id/dose-calculations", async (req) => {
    const { id } = req.params as { id: string };
    const result = await pool.query(
      `select c.*, d.name as drug_name
       from dose_calculations c join drugs d on d.id = c.drug_id
       where c.patient_id = $1 order by c.created_at desc`,
      [id],
    );
    return { calculations: result.rows };
  });

  app.post("/patients/:id/dose-calculations", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      drugId: string;
      weightKg: number;
      isPediatric?: boolean;
      comorbidities?: string;
      maxDoseMg?: number;
      maxUnits?: number;
    };
    if (!body.drugId || !body.weightKg) {
      return reply.code(400).send({ error: "drugId e weightKg são obrigatórios." });
    }
    const result = await pool.query(
      `insert into dose_calculations (patient_id, drug_id, weight_kg, is_pediatric, comorbidities, max_dose_mg, max_units)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [id, body.drugId, body.weightKg, body.isPediatric ?? false, body.comorbidities ?? null, body.maxDoseMg ?? null, body.maxUnits ?? null],
    );
    const drugName = (await pool.query("select name from drugs where id = $1", [body.drugId])).rows[0]?.name;
    await logPatientAction(id, "criado", "calculo_dose", `Cálculo de dose salvo: ${drugName ?? body.drugId} (${body.weightKg} kg)`);
    return reply.code(201).send({ calculation: result.rows[0] });
  });

  app.delete("/dose-calculations/:calculationId", async (req, reply) => {
    const { calculationId } = req.params as { calculationId: string };
    const existing = await pool.query(
      "select c.*, d.name as drug_name from dose_calculations c join drugs d on d.id = c.drug_id where c.id = $1",
      [calculationId],
    );
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Cálculo não encontrado." });
    const calculation = existing.rows[0];
    await pool.query("delete from dose_calculations where id = $1", [calculationId]);
    await logPatientAction(calculation.patient_id, "excluido", "calculo_dose", `Cálculo de dose removido: ${calculation.drug_name}`);
    return reply.code(204).send();
  });

  // Clinical cases (patient-scoped)
  app.get("/patients/:id/clinical-cases", async (req) => {
    const { id } = req.params as { id: string };
    const result = await pool.query(
      `select c.*, pr.name as procedure_name
       from clinical_cases c left join procedures pr on pr.id = c.procedure_id
       where c.patient_id = $1 order by c.created_at desc`,
      [id],
    );
    return { cases: result.rows };
  });

  app.post("/patients/:id/clinical-cases", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      title: string;
      description?: string;
      hours?: number;
      procedureId?: string;
      supervisorName?: string;
    };
    if (!body.title?.trim()) return reply.code(400).send({ error: "title é obrigatório." });
    const result = await pool.query(
      `insert into clinical_cases (patient_id, procedure_id, title, description, hours, supervisor_name)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [id, body.procedureId ?? null, body.title.trim(), body.description ?? null, body.hours ?? null, body.supervisorName ?? null],
    );
    return reply.code(201).send({ case: result.rows[0] });
  });

  app.delete("/clinical-cases/:caseId", async (req, reply) => {
    const { caseId } = req.params as { caseId: string };
    const existing = await pool.query("select * from clinical_cases where id = $1", [caseId]);
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Caso não encontrado." });
    const clinicalCase = existing.rows[0];
    await pool.query("delete from clinical_cases where id = $1", [caseId]);
    await logPatientAction(clinicalCase.patient_id, "excluido", "caso_clinico", `Caso clínico removido: ${clinicalCase.title}`);
    return reply.code(204).send();
  });

  // App settings (key/value) — e.g. the supervisor-confirmation toggle.
  app.get("/settings/:key", async (req, reply) => {
    const { key } = req.params as { key: string };
    const result = await pool.query("select * from app_settings where key = $1", [key]);
    if (result.rowCount === 0) return reply.code(404).send({ error: "Configuração não encontrada." });
    return { setting: result.rows[0] };
  });

  app.put("/settings/:key", async (req, reply) => {
    const { key } = req.params as { key: string };
    const { value } = req.body as { value: unknown };
    const result = await pool.query(
      `insert into app_settings (key, value) values ($1, $2)
       on conflict (key) do update set value = $2, updated_at = now()
       returning *`,
      [key, JSON.stringify(value)],
    );
    return { setting: result.rows[0] };
  });
}
