import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";
import { chatCompletion } from "../ai/ollama.js";

export async function briefingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Picks the next upcoming event and asks the model for a short, concrete
  // prep tip grounded in that event's real fields (category/title/location) —
  // never invented from nothing, always tied to a real row.
  app.get("/dashboard/next-event-briefing", async () => {
    const result = await pool.query(
      `select e.*, p.name as patient_name from events e
       left join patients p on p.id = e.patient_id
       where e.start_at > now() order by e.start_at asc limit 1`,
    );

    const event = result.rows[0];
    if (!event) return { event: null, tip: null };

    const categoryLabel =
      event.category === "atendimento_paciente" ? "atendimento com paciente" : event.category === "academico" ? "compromisso acadêmico" : "compromisso pessoal";

    const prompt = `Compromisso: "${event.title}" (${categoryLabel}), em ${new Date(event.start_at).toLocaleString("pt-BR")}${event.location_text ? `, local: ${event.location_text}` : ""}${event.patient_name ? `, paciente: ${event.patient_name}` : ""}.

Em 1-2 frases curtas e práticas, sugira como essa pessoa deveria se preparar antes desse compromisso específico (ex.: estudar algo pontual, separar tempo de leitura, se arrumar e tomar banho com antecedência, revisar material). Baseie-se apenas no que foi informado — não invente detalhes que não foram dados. Responda só com a sugestão, sem introdução.`;

    try {
      const tip = await chatCompletion([
        { role: "system", content: "Você é um assistente pessoal direto e prático, em português." },
        { role: "user", content: prompt },
      ]);
      return { event, tip };
    } catch {
      return { event, tip: null };
    }
  });
}
