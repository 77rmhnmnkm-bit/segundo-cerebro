import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";
import { extractEventFromText } from "../ai/ollama.js";
import { extractPdfText, ocrImage } from "../ai/extractText.js";
import { geocodeAddress, travelMinutesBetween } from "../ai/geocoding.js";

type EventCategory = "atendimento_paciente" | "pessoal" | "academico";

function computeNotifyAt(startAt: string, travelMinutes: number | null, prepMinutes: number): Date {
  const start = new Date(startAt);
  const totalMinutesBefore = (travelMinutes ?? 0) + prepMinutes;
  return new Date(start.getTime() - totalMinutesBefore * 60 * 1000);
}

async function draftFromText(text: string) {
  const extraction = await extractEventFromText(text);
  const draft: {
    title: string;
    category: typeof extraction.category;
    startAt: string;
    locationText?: string;
    description?: string;
    locationLat?: number;
    locationLng?: number;
    travelMinutes?: number;
  } = {
    title: extraction.title,
    category: extraction.category,
    startAt: new Date(`${extraction.date}T${extraction.time}:00`).toISOString(),
    locationText: extraction.locationText ?? undefined,
    description: extraction.description ?? undefined,
  };

  // Best-effort: geocode the mentioned location and compute travel time from
  // the configured base address. Never blocks event creation if it fails —
  // the user can always fill these in manually.
  if (extraction.locationText) {
    try {
      const baseCoordsRaw = await pool.query("select value from app_settings where key = 'base_address_coords'");
      const baseCoords = baseCoordsRaw.rows[0]?.value as { lat: number; lng: number } | null;
      const destination = await geocodeAddress(extraction.locationText);
      if (destination) {
        draft.locationLat = destination.lat;
        draft.locationLng = destination.lng;
        if (baseCoords) {
          const minutes = await travelMinutesBetween(baseCoords, destination);
          if (minutes !== null) draft.travelMinutes = minutes;
        }
      }
    } catch {
      // geocoding/travel time is a nice-to-have here, never fatal
    }
  }

  return draft;
}

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/heic": ".heic",
};

export async function eventsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Geocodes the user's starting point once and caches lat/lng, so every
  // future event's travel time is computed from here without re-geocoding.
  app.put("/settings/base-address", async (req, reply) => {
    const { address } = req.body as { address: string };
    if (!address?.trim()) return reply.code(400).send({ error: "address é obrigatório." });

    const geocoded = await geocodeAddress(address);
    if (!geocoded) {
      return reply.code(422).send({ error: "Não consegui localizar esse endereço. Tente ser mais específico." });
    }

    await pool.query(
      `insert into app_settings (key, value) values ('base_address', $1)
       on conflict (key) do update set value = $1, updated_at = now()`,
      [JSON.stringify(address)],
    );
    await pool.query(
      `insert into app_settings (key, value) values ('base_address_coords', $1)
       on conflict (key) do update set value = $1, updated_at = now()`,
      [JSON.stringify({ lat: geocoded.lat, lng: geocoded.lng, displayName: geocoded.displayName })],
    );

    return { address, coords: geocoded };
  });

  // Returns a draft for the user to review/edit — never creates the event
  // directly, so the AI's guess is always confirmed before it's saved.
  app.post("/events/extract", async (req, reply) => {
    const { text } = req.body as { text: string };
    if (!text?.trim()) {
      return reply.code(400).send({ error: "text é obrigatório." });
    }

    try {
      const draft = await draftFromText(text);
      return { draft, rawInput: text };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Falha na extração por IA." });
    }
  });

  // Same as /events/extract, but the text comes from OCR (print/foto) or a
  // PDF's embedded text instead of being typed directly.
  app.post("/events/extract-file", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ error: "Envie um arquivo (imagem ou PDF)." });
    }

    const buffer = await file.toBuffer();
    let extractedText: string;

    try {
      if (file.mimetype === "application/pdf") {
        extractedText = await extractPdfText(buffer);
        if (!extractedText) {
          return reply.code(422).send({
            error: "Não encontrei texto neste PDF — ele parece ser digitalizado (imagem). Esse formato ainda não é suportado, tente enviar um print/foto.",
          });
        }
      } else if (file.mimetype in IMAGE_EXTENSION_BY_MIME) {
        extractedText = await ocrImage(buffer, IMAGE_EXTENSION_BY_MIME[file.mimetype]);
        if (!extractedText) {
          return reply.code(422).send({ error: "Não consegui ler nenhum texto nessa imagem." });
        }
      } else {
        return reply.code(400).send({ error: "Formato não suportado. Envie uma imagem (PNG/JPG) ou PDF." });
      }

      const draft = await draftFromText(extractedText);
      return { draft, rawInput: extractedText };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Falha ao processar o arquivo." });
    }
  });

  app.get("/events", async (req) => {
    const { from, to, category } = req.query as { from?: string; to?: string; category?: EventCategory };

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (from) {
      values.push(from);
      conditions.push(`start_at >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      conditions.push(`start_at <= $${values.length}`);
    }
    if (category) {
      values.push(category);
      conditions.push(`category = $${values.length}`);
    }

    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const result = await pool.query(
      `select e.*, p.name as patient_name, p.phone as patient_phone
       from events e left join patients p on p.id = e.patient_id
       ${where} order by e.start_at asc`,
      values,
    );
    return { events: result.rows };
  });

  app.post("/events", async (req, reply) => {
    const body = req.body as {
      title: string;
      description?: string;
      category: EventCategory;
      patientId?: string;
      startAt: string;
      endAt?: string;
      locationText?: string;
      locationLat?: number;
      locationLng?: number;
      travelMinutes?: number;
      prepMinutes?: number;
      source?: "manual" | "ai_text" | "ai_photo";
      rawInput?: string;
    };

    if (!body.title || !body.category || !body.startAt) {
      return reply.code(400).send({ error: "title, category e startAt são obrigatórios." });
    }

    const prepMinutes = body.prepMinutes ?? 90;
    const notifyAt = computeNotifyAt(body.startAt, body.travelMinutes ?? null, prepMinutes);

    const result = await pool.query(
      `insert into events
        (title, description, category, patient_id, start_at, end_at, location_text, location_lat, location_lng,
         travel_minutes, prep_minutes, notify_at, source, raw_input)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, coalesce($13, 'manual'), $14)
       returning *`,
      [
        body.title,
        body.description ?? null,
        body.category,
        body.patientId ?? null,
        body.startAt,
        body.endAt ?? null,
        body.locationText ?? null,
        body.locationLat ?? null,
        body.locationLng ?? null,
        body.travelMinutes ?? null,
        prepMinutes,
        notifyAt,
        body.source ?? null,
        body.rawInput ?? null,
      ],
    );

    return reply.code(201).send({ event: result.rows[0] });
  });

  app.patch("/events/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const fields = req.body as Record<string, unknown>;

    const columnMap: Record<string, string> = {
      title: "title",
      description: "description",
      category: "category",
      patientId: "patient_id",
      startAt: "start_at",
      endAt: "end_at",
      locationText: "location_text",
      locationLat: "location_lat",
      locationLng: "location_lng",
      travelMinutes: "travel_minutes",
      prepMinutes: "prep_minutes",
      confirmationStatus: "confirmation_status",
    };

    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(columnMap)) {
      if (key in fields) {
        values.push(fields[key]);
        sets.push(`${column} = $${values.length}`);
      }
    }

    if (sets.length === 0) {
      return reply.code(400).send({ error: "Nenhum campo para atualizar." });
    }

    // Recompute notify_at whenever timing-relevant fields change.
    if ("startAt" in fields || "travelMinutes" in fields || "prepMinutes" in fields) {
      const current = await pool.query("select * from events where id = $1", [id]);
      if (current.rowCount === 0) return reply.code(404).send({ error: "Evento não encontrado." });
      const existing = current.rows[0];
      const startAt = (fields.startAt as string) ?? existing.start_at;
      const travelMinutes = "travelMinutes" in fields ? (fields.travelMinutes as number) : existing.travel_minutes;
      const prepMinutes = "prepMinutes" in fields ? (fields.prepMinutes as number) : existing.prep_minutes;
      values.push(computeNotifyAt(startAt, travelMinutes, prepMinutes));
      sets.push(`notify_at = $${values.length}`);
    }

    values.push(id);
    const result = await pool.query(
      `update events set ${sets.join(", ")}, updated_at = now() where id = $${values.length} returning *`,
      values,
    );

    if (result.rowCount === 0) return reply.code(404).send({ error: "Evento não encontrado." });
    return { event: result.rows[0] };
  });

  app.delete("/events/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await pool.query("delete from events where id = $1", [id]);
    return reply.code(204).send();
  });
}
