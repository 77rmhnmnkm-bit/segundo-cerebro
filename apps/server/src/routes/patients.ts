import type { FastifyInstance } from "fastify";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";
import { UPLOADS_DIR } from "../uploads.js";
import { logPatientAction } from "../audit.js";
import { describeImage } from "../ai/ollama.js";
import { checkPrescription } from "../clinicalSafety.js";

const execFileAsync = promisify(execFile);

interface AiDetectionRaw {
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
  points?: { x: number; y: number }[];
}

const IMAGE_FORMATS = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic"]);

function formatForMimetype(mimetype: string): "image" | "dicom" | "pdf" | null {
  if (IMAGE_FORMATS.has(mimetype)) return "image";
  if (mimetype === "application/pdf") return "pdf";
  if (mimetype === "application/dicom" || mimetype === "application/octet-stream") return "dicom";
  return null;
}

// Mirrors the frontend's getOrientation/faceLabel in Tooth.tsx — kept here
// too since the treatment-plan step description is generated server-side.
function faceLabel(tooth: number, face: string): string {
  const quadrant = Math.floor(tooth / 10);
  const isUpper = quadrant === 1 || quadrant === 2;
  if (face === "lingual") return isUpper ? "Palatina" : "Lingual";
  if (face === "vestibular") return "Vestibular";
  if (face === "mesial") return "Mesial";
  if (face === "distal") return "Distal";
  return "Oclusal/Incisal";
}

export async function patientsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/patients", async (req) => {
    const { search } = req.query as { search?: string };
    const result = search
      ? await pool.query("select * from patients where name ilike $1 order by name", [`%${search}%`])
      : await pool.query("select * from patients order by name");
    return { patients: result.rows };
  });

  app.get("/patients/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await pool.query("select * from patients where id = $1", [id]);
    if (result.rowCount === 0) return reply.code(404).send({ error: "Paciente não encontrado." });
    return { patient: result.rows[0] };
  });

  app.post("/patients", async (req, reply) => {
    const body = req.body as {
      name: string;
      birthDate?: string;
      phone?: string;
      email?: string;
      cpf?: string;
      address?: string;
      notes?: string;
    };
    if (!body.name?.trim()) {
      return reply.code(400).send({ error: "name é obrigatório." });
    }
    const result = await pool.query(
      `insert into patients (name, birth_date, phone, email, cpf, address, notes)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [body.name, body.birthDate ?? null, body.phone ?? null, body.email ?? null, body.cpf ?? null, body.address ?? null, body.notes ?? null],
    );
    return reply.code(201).send({ patient: result.rows[0] });
  });

  app.patch("/patients/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const fields = req.body as Record<string, unknown>;

    const columnMap: Record<string, string> = {
      name: "name",
      birthDate: "birth_date",
      phone: "phone",
      email: "email",
      cpf: "cpf",
      address: "address",
      notes: "notes",
    };

    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(columnMap)) {
      if (key in fields) {
        values.push(fields[key]);
        sets.push(`${column} = $${values.length}`);
      }
    }
    if (sets.length === 0) return reply.code(400).send({ error: "Nenhum campo para atualizar." });

    values.push(id);
    const result = await pool.query(
      `update patients set ${sets.join(", ")}, updated_at = now() where id = $${values.length} returning *`,
      values,
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "Paciente não encontrado." });
    return { patient: result.rows[0] };
  });

  app.delete("/patients/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await pool.query("delete from patients where id = $1", [id]);
    return reply.code(204).send();
  });

  // Files (photos/exams/radiographs)
  app.get("/patients/:id/files", async (req) => {
    const { id } = req.params as { id: string };
    const result = await pool.query("select * from patient_files where patient_id = $1 order by created_at desc", [id]);
    return { files: result.rows };
  });

  app.post("/patients/:id/files", async (req, reply) => {
    const { id } = req.params as { id: string };
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Envie um arquivo." });

    const format = formatForMimetype(file.mimetype);
    if (!format) return reply.code(400).send({ error: "Formato não suportado." });

    const dir = path.join(UPLOADS_DIR, "patients", id);
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}${path.extname(file.filename) || ""}`;
    const buffer = await file.toBuffer();
    await writeFile(path.join(dir, filename), buffer);

    const filePath = `/uploads/patients/${id}/${filename}`;
    const result = await pool.query(
      "insert into patient_files (patient_id, file_path, format, label) values ($1, $2, $3, $4) returning *",
      [id, filePath, format, file.filename ?? null],
    );
    return reply.code(201).send({ file: result.rows[0] });
  });

  app.delete("/patients/files/:fileId", async (req, reply) => {
    const { fileId } = req.params as { fileId: string };
    const existing = await pool.query("select * from patient_files where id = $1", [fileId]);
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Arquivo não encontrado." });
    const file = existing.rows[0];
    await pool.query("delete from patient_files where id = $1", [fileId]);
    await logPatientAction(file.patient_id, "excluido", "arquivo", `Arquivo removido: ${file.label ?? file.file_path}`);
    return reply.code(204).send();
  });

  // Salva as marcações desenhadas sobre a imagem (negatoscópio / comunicação
  // visual com paciente). annotations = lista de formas em coordenadas
  // relativas (0-1) para escalar com o zoom.
  // Perfil de saúde do paciente (alergias, medicamentos, condições de risco).
  app.get("/patients/:id/health", async (req) => {
    const { id } = req.params as { id: string };
    const r = await pool.query("select * from patient_health where patient_id = $1", [id]);
    return { health: r.rows[0] ?? { patient_id: id, allergies: [], medications: [], conditions: [], notes: null } };
  });

  app.put("/patients/:id/health", async (req) => {
    const { id } = req.params as { id: string };
    const b = req.body as { allergies?: string[]; medications?: string[]; conditions?: string[]; notes?: string };
    const clean = (a?: string[]) => (Array.isArray(a) ? a.map((s) => String(s).trim()).filter(Boolean) : []);
    const r = await pool.query(
      `insert into patient_health (patient_id, allergies, medications, conditions, notes, updated_at)
       values ($1,$2,$3,$4,$5, now())
       on conflict (patient_id) do update set
         allergies = excluded.allergies, medications = excluded.medications,
         conditions = excluded.conditions, notes = excluded.notes, updated_at = now()
       returning *`,
      [id, clean(b.allergies), clean(b.medications), clean(b.conditions), b.notes?.trim() || null],
    );
    return { health: r.rows[0] };
  });

  // Checagem de segurança de um fármaco contra o perfil do paciente (alergia +
  // condições). Regras curadas com fonte — ver packages/core/conditions.ts.
  app.post("/patients/:id/prescription-check", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { drugId } = req.body as { drugId?: string };
    if (!drugId) return reply.code(400).send({ error: "drugId é obrigatório." });
    const drug = (await pool.query("select name, active_ingredient, category from drugs where id = $1", [drugId])).rows[0];
    if (!drug) return reply.code(404).send({ error: "Medicamento não encontrado." });
    const health = (await pool.query("select allergies, conditions from patient_health where patient_id = $1", [id])).rows[0] ?? null;
    return { warnings: checkPrescription(health, drug) };
  });

  app.patch("/patients/files/:fileId", async (req, reply) => {
    const { fileId } = req.params as { fileId: string };
    const body = req.body as { radiographType?: string | null; label?: string };
    const allowed = ["panoramica", "bitewing", "periapical", "foto"];
    const rtype = body.radiographType == null ? null : allowed.includes(body.radiographType) ? body.radiographType : undefined;
    if (rtype === undefined && body.label === undefined) {
      return reply.code(400).send({ error: "Nada para atualizar." });
    }
    const result = await pool.query(
      `update patient_files set
         radiograph_type = coalesce($1, radiograph_type),
         label = coalesce($2, label)
       where id = $3 returning *`,
      [rtype, body.label ?? null, fileId],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "Arquivo não encontrado." });
    return { file: result.rows[0] };
  });

  app.put("/patients/files/:fileId/annotations", async (req, reply) => {
    const { fileId } = req.params as { fileId: string };
    const { annotations } = req.body as { annotations: unknown };
    const result = await pool.query(
      "update patient_files set annotations = $1 where id = $2 returning *",
      [JSON.stringify(annotations ?? []), fileId],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "Arquivo não encontrado." });
    return { file: result.rows[0] };
  });

  // Análise visual EXPERIMENTAL por IA (não-diagnóstica). Usa um modelo de
  // visão geral local — descreve o que observa, nunca dá laudo. O resultado
  // sempre exige confirmação do profissional (a UI deixa isso explícito).
  app.post("/patients/files/:fileId/ai-describe", async (req, reply) => {
    const { fileId } = req.params as { fileId: string };
    const existing = await pool.query("select * from patient_files where id = $1", [fileId]);
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Arquivo não encontrado." });
    const file = existing.rows[0];
    if (file.format !== "image") return reply.code(400).send({ error: "Só imagens podem ser analisadas." });

    try {
      const absolutePath = path.join(UPLOADS_DIR, file.file_path.replace(/^\/uploads\//, ""));
      const buffer = await readFile(absolutePath);
      const base64 = buffer.toString("base64");

      const prompt = `Você é um apoio de observação de imagens odontológicas, NÃO um sistema de diagnóstico. Olhe esta radiografia/foto e descreva de forma objetiva, em português, apenas o que é visualmente observável (estruturas, regiões de maior ou menor radiopacidade, restaurações aparentes, etc.). Use linguagem cautelosa ("parece", "região compatível com observação adicional"). NUNCA afirme diagnóstico. Liste no máximo 4 observações curtas.`;

      const description = await describeImage(base64, prompt);
      await pool.query("update patient_files set ai_description = $1 where id = $2", [description, fileId]);
      return { description };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Falha na análise visual." });
    }
  });

  // Detector odontológico EXPERIMENTAL (modelo open-source YOLOv8, Apache-2.0).
  // Roda o script Python local e devolve caixas como SUGESTÃO — não salva nada,
  // não é diagnóstico. O profissional confirma/edita/rejeita cada uma no
  // negatoscópio. Caixas em coordenadas relativas (0-1).
  app.post("/patients/files/:fileId/ai-detect", async (req, reply) => {
    const { fileId } = req.params as { fileId: string };
    const existing = await pool.query("select * from patient_files where id = $1", [fileId]);
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Arquivo não encontrado." });
    const file = existing.rows[0];
    if (file.format !== "image") return reply.code(400).send({ error: "Só imagens podem ser analisadas." });

    const absolutePath = path.join(UPLOADS_DIR, file.file_path.replace(/^\/uploads\//, ""));
    const pythonBin = path.join(process.cwd(), "ml-venv", "bin", "python");
    const script = path.join(process.cwd(), "ml", "detect_dental.py");

    // Sensibilidade (limiar de confiança) — quanto menor, mais achados a IA mostra.
    const bodyConf = (req.body as { conf?: number } | undefined)?.conf;
    const conf = typeof bodyConf === "number" && bodyConf >= 0.05 && bodyConf <= 0.6 ? bodyConf : 0.25;

    try {
      const { stdout } = await execFileAsync(pythonBin, [script, absolutePath, String(conf)], {
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      });
      // ultralytics imprime ruído no primeiro carregamento; nosso JSON é a
      // última linha que começa com "{".
      const jsonLine = stdout
        .trim()
        .split("\n")
        .reverse()
        .find((l) => l.trim().startsWith("{"));
      if (!jsonLine) return reply.code(502).send({ error: "Detector não retornou resultado." });
      const parsed = JSON.parse(jsonLine) as { detections?: AiDetectionRaw[]; error?: string };
      if (parsed.error) return reply.code(502).send({ error: parsed.error });

      const detections = parsed.detections ?? [];

      // Aprendizado: aplica a calibração aprendida das escolhas do profissional.
      // Para cada classe, sua taxa histórica de confirmação reordena e anota as
      // sugestões — a rede NÃO é retreinada ao vivo (ver migration 0025).
      const fb = await pool.query<{ label: string; action: string; n: string }>(
        "select label, action, count(*)::int as n from detection_feedback group by label, action",
      );
      const perLabel: Record<string, { confirm: number; reject: number; rate: number | null }> = {};
      for (const row of fb.rows) {
        const e = (perLabel[row.label] ??= { confirm: 0, reject: 0, rate: null });
        if (row.action === "confirm") e.confirm = Number(row.n);
        else e.reject = Number(row.n);
      }
      let totalDecisions = 0;
      for (const e of Object.values(perLabel)) {
        const tot = e.confirm + e.reject;
        e.rate = tot > 0 ? e.confirm / tot : null;
        totalDecisions += tot;
      }
      const baseLabel = (l: string) => l.replace(/\s*\d{1,3}%\s*$/, "").trim();
      const scored = detections
        .map((d) => {
          const stats = perLabel[baseLabel(d.label)];
          const learnedRate = stats?.rate ?? null;
          const score = learnedRate != null ? 0.5 * d.confidence + 0.5 * learnedRate : d.confidence;
          return { ...d, learnedRate, score };
        })
        .sort((a, b) => b.score - a.score);

      return { detections: scored, learning: { totalDecisions, perLabel } };
    } catch (err) {
      return reply.code(502).send({
        error:
          err instanceof Error && err.message.includes("ENOENT")
            ? "Ambiente de IA de detecção não instalado (ml-venv)."
            : err instanceof Error
              ? err.message
              : "Falha na detecção.",
      });
    }
  });

  // Aprendizado: registra a escolha do profissional (confirmar/rejeitar) sobre
  // um achado sugerido. Alimenta a calibração por classe usada em ai-detect.
  app.post("/patients/files/:fileId/detection-feedback", async (req, reply) => {
    const { fileId } = req.params as { fileId: string };
    const body = req.body as {
      label: string;
      action: "confirm" | "reject";
      confidence?: number;
      x?: number;
      y?: number;
      w?: number;
      h?: number;
    };
    if (!body?.label || (body.action !== "confirm" && body.action !== "reject")) {
      return reply.code(400).send({ error: "label e action (confirm|reject) são obrigatórios." });
    }
    const fileRow = (await pool.query("select patient_id from patient_files where id = $1", [fileId])).rows[0];
    const label = body.label.replace(/\s*\d{1,3}%\s*$/, "").trim();
    await pool.query(
      `insert into detection_feedback (patient_id, file_id, label, predicted_confidence, action, x, y, w, h)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [fileRow?.patient_id ?? null, fileId, label, body.confidence ?? null, body.action, body.x ?? null, body.y ?? null, body.w ?? null, body.h ?? null],
    );
    return reply.code(201).send({ ok: true });
  });

  // Medical records (evolução)
  app.get("/patients/:id/records", async (req) => {
    const { id } = req.params as { id: string };
    const result = await pool.query("select * from medical_records where patient_id = $1 order by created_at desc", [id]);
    return { records: result.rows };
  });

  app.post("/patients/:id/records", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { content, nextSteps } = req.body as { content: string; nextSteps?: string };
    if (!content?.trim()) return reply.code(400).send({ error: "content é obrigatório." });
    const result = await pool.query(
      "insert into medical_records (patient_id, content, next_steps) values ($1, $2, $3) returning *",
      [id, content.trim(), nextSteps?.trim() || null],
    );
    return reply.code(201).send({ record: result.rows[0] });
  });

  app.delete("/patients/records/:recordId", async (req, reply) => {
    const { recordId } = req.params as { recordId: string };
    const existing = await pool.query("select * from medical_records where id = $1", [recordId]);
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Registro não encontrado." });
    const record = existing.rows[0];
    await pool.query("delete from medical_records where id = $1", [recordId]);
    await logPatientAction(record.patient_id, "excluido", "evolucao", `Anotação de evolução removida: "${record.content.slice(0, 80)}"`);
    return reply.code(204).send();
  });

  // Odontogram
  app.get("/patients/:id/odontogram", async (req) => {
    const { id } = req.params as { id: string };
    const result = await pool.query(
      "select * from odontogram_entries where patient_id = $1 order by tooth_number, recorded_at desc",
      [id],
    );
    return { entries: result.rows };
  });

  app.post("/patients/:id/odontogram", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      toothNumber: number;
      face?: string;
      procedureName: string;
      material?: string;
      status?: string;
    };
    if (!body.toothNumber || !body.procedureName) {
      return reply.code(400).send({ error: "toothNumber e procedureName são obrigatórios." });
    }

    const client = await pool.connect();
    try {
      await client.query("begin");

      const entryResult = await client.query(
        `insert into odontogram_entries (patient_id, tooth_number, face, procedure_name, material, status)
         values ($1, $2, $3, $4, $5, coalesce($6, 'saudavel')) returning *`,
        [id, body.toothNumber, body.face ?? null, body.procedureName, body.material ?? null, body.status ?? null],
      );
      const entry = entryResult.rows[0];

      // Every odontogram entry is also a treatment-plan line item, auto-filed
      // so nothing has to be entered twice — but it's a normal step row
      // afterwards, freely editable/removable from the Tratamento tab.
      let plan = (await client.query(
        "select * from treatment_plans where patient_id = $1 and status = 'ativo' order by created_at limit 1",
        [id],
      )).rows[0];
      if (!plan) {
        plan = (await client.query(
          "insert into treatment_plans (patient_id, title) values ($1, 'Plano Geral') returning *",
          [id],
        )).rows[0];
      }

      const stepStatus = entry.status === "carie" ? "pendente" : "concluido";
      const faceText = entry.face ? ` (${faceLabel(body.toothNumber, entry.face)})` : "";
      const countResult = await client.query("select count(*) from treatment_plan_steps where plan_id = $1", [plan.id]);
      await client.query(
        `insert into treatment_plan_steps (plan_id, description, procedure_name, status, order_index)
         values ($1, $2, $3, $4, $5)`,
        [plan.id, `Dente ${body.toothNumber}${faceText}: ${body.procedureName}`, body.procedureName, stepStatus, Number(countResult.rows[0].count)],
      );

      await client.query("commit");
      await logPatientAction(
        id,
        "criado",
        "odontograma",
        `Dente ${body.toothNumber}${entry.face ? ` (${faceLabel(body.toothNumber, entry.face)})` : ""}: ${body.procedureName}`,
      );
      return reply.code(201).send({ entry });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  });

  app.delete("/patients/odontogram/:entryId", async (req, reply) => {
    const { entryId } = req.params as { entryId: string };
    const existing = await pool.query("select * from odontogram_entries where id = $1", [entryId]);
    if (existing.rowCount === 0) return reply.code(404).send({ error: "Registro não encontrado." });
    const entry = existing.rows[0];
    await pool.query("delete from odontogram_entries where id = $1", [entryId]);
    await logPatientAction(
      entry.patient_id,
      "excluido",
      "odontograma",
      `Dente ${entry.tooth_number}${entry.face ? ` (${faceLabel(entry.tooth_number, entry.face)})` : ""}: ${entry.procedure_name} removido`,
    );
    return reply.code(204).send();
  });

  // Audit log (append-only, never editable) — every deletion and print across
  // the patient record lands here for legal/traceability purposes.
  app.get("/patients/:id/audit-log", async (req) => {
    const { id } = req.params as { id: string };
    const result = await pool.query(
      "select * from patient_audit_log where patient_id = $1 order by created_at desc",
      [id],
    );
    return { log: result.rows };
  });

  app.post("/patients/:id/audit-log", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { action, entityType, description } = req.body as { action: string; entityType: string; description: string };
    if (!action || !entityType || !description) {
      return reply.code(400).send({ error: "action, entityType e description são obrigatórios." });
    }
    await logPatientAction(id, action, entityType, description);
    return reply.code(201).send({ ok: true });
  });
}
