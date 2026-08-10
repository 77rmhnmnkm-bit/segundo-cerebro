import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { transcribeAudio } from "../ai/whisper.js";

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "video/mp4": ".mp4",
};

export async function transcribeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // Generic voice-to-text: reused by prontuário dictation now, and by
  // inventory voice-taking later — always returns text for the user to
  // review/edit, never writes anything by itself.
  app.post("/transcribe", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Envie um arquivo de áudio." });

    const extension = EXTENSION_BY_MIME[file.mimetype];
    if (!extension) return reply.code(400).send({ error: "Formato de áudio não suportado." });

    try {
      const buffer = await file.toBuffer();
      const text = await transcribeAudio(buffer, extension);
      return { text };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "Falha na transcrição." });
    }
  });
}
