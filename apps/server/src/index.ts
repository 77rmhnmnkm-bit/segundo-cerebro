import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import { authRoutes } from "./routes/auth.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { eventsRoutes } from "./routes/events.js";
import { notesRoutes } from "./routes/notes.js";
import { patientsRoutes } from "./routes/patients.js";
import { formsRoutes } from "./routes/forms.js";
import { transcribeRoutes } from "./routes/transcribe.js";
import { treatmentRoutes } from "./routes/treatment.js";
import { libraryRoutes } from "./routes/library.js";
import { assistantRoutes } from "./routes/assistant.js";
import { briefingRoutes } from "./routes/briefing.js";
import { updatesRoutes } from "./routes/updates.js";
import { habitsRoutes } from "./routes/habits.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { trainingRoutes } from "./routes/training.js";
import { sterilizationRoutes } from "./routes/sterilization.js";
import { UPLOADS_DIR } from "./uploads.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
// 200MB covers long voice memos/heavy attachments (agenda audio, patient files) — still bounded
// to avoid pathological uploads since everything is processed in memory.
await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } });
await app.register(staticFiles, { root: UPLOADS_DIR, prefix: "/uploads/" });
await app.register(authRoutes);
await app.register(inventoryRoutes);
await app.register(eventsRoutes);
await app.register(notesRoutes);
await app.register(patientsRoutes);
await app.register(formsRoutes);
await app.register(transcribeRoutes);
await app.register(treatmentRoutes);
await app.register(libraryRoutes);
await app.register(assistantRoutes);
await app.register(briefingRoutes);
await app.register(updatesRoutes);
await app.register(habitsRoutes);
await app.register(knowledgeRoutes);
await app.register(trainingRoutes);
await app.register(sterilizationRoutes);

app.get("/health", async () => ({ status: "ok" }));

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
