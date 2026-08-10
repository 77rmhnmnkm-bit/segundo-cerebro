import type { FastifyInstance } from "fastify";
import { mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { pool } from "../db/pool.js";
import { requireAuth } from "../auth/middleware.js";
import { UPLOADS_DIR } from "../uploads.js";

// #22 Exporta as confirmações do profissional (detection_feedback "confirm")
// como um dataset YOLO de verdade — imagens + rótulos + data.yaml + README com
// o comando de fine-tune. As escolhas dele viram, de fato, treino do detector.
// HONESTO: é um conjunto INCREMENTAL (só o que ele confirmou). O ideal é
// combinar com o dataset original num fine-tune offline, não rodar em produção.
const CLASS_ORDER = [
  "Cárie",
  "Coroa",
  "Restauração",
  "Implante",
  "Dente ausente",
  "Lesão periapical",
  "Raiz residual",
  "Obturação de canal",
];

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function classIndex(label: string): number {
  const l = label.toLowerCase();
  if (l.includes("cárie") || l.includes("carie")) return 0;
  if (l.includes("coroa")) return 1;
  if (l.includes("restaura")) return 2;
  if (l.includes("implante")) return 3;
  if (l.includes("ausente")) return 4;
  if (l.includes("periapical")) return 5;
  if (l.includes("raiz")) return 6;
  if (l.includes("canal") || l.includes("obtura")) return 7;
  return -1;
}

export async function trainingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post("/ai/training-export", async (_req, reply) => {
    // Fonte: as anotações CONFIRMADAS (✓) salvas em cada radiografia — elas têm
    // o polígono completo do achado (o modelo é de segmentação). Gera rótulos
    // YOLO-seg (classe + pontos do contorno normalizados 0-1).
    const files = (
      await pool.query(
        `select id, file_path, annotations from patient_files
         where format = 'image' and annotations is not null and jsonb_array_length(annotations) > 0`,
      )
    ).rows;

    type Ann = { type?: string; label?: string; confirmed?: boolean; points?: { x: number; y: number }[]; x?: number; y?: number; w?: number; h?: number };

    const byClass: Record<string, number> = {};
    let labelCount = 0;
    const datasetFiles: { id: string; file_path: string; lines: string[] }[] = [];

    for (const f of files) {
      const anns = (f.annotations as Ann[]).filter((a) => a.confirmed === true && a.label);
      const lines: string[] = [];
      for (const a of anns) {
        const cls = classIndex(a.label!);
        if (cls < 0) continue;
        // polígono normalizado; caixa vira retângulo de 4 pontos
        let pts: { x: number; y: number }[] | null = null;
        if (Array.isArray(a.points) && a.points.length >= 3) pts = a.points;
        else if (a.w != null && a.h != null && a.x != null && a.y != null)
          pts = [{ x: a.x, y: a.y }, { x: a.x + a.w, y: a.y }, { x: a.x + a.w, y: a.y + a.h }, { x: a.x, y: a.y + a.h }];
        if (!pts) continue;
        const coords = pts.map((p) => `${clamp01(p.x).toFixed(6)} ${clamp01(p.y).toFixed(6)}`).join(" ");
        lines.push(`${cls} ${coords}`);
        byClass[CLASS_ORDER[cls]] = (byClass[CLASS_ORDER[cls]] ?? 0) + 1;
        labelCount++;
      }
      if (lines.length) datasetFiles.push({ id: f.id, file_path: f.file_path, lines });
    }

    if (datasetFiles.length === 0) {
      return reply.code(200).send({ imageCount: 0, labelCount: 0, byClass: {}, message: "Nenhum achado confirmado e salvo ainda. No negatoscópio, confirme (✓) os achados e clique em Salvar." });
    }

    const outDir = path.join(process.cwd(), "ml", "dataset_export");
    await rm(outDir, { recursive: true, force: true });
    await mkdir(path.join(outDir, "images"), { recursive: true });
    await mkdir(path.join(outDir, "labels"), { recursive: true });

    let imageCount = 0;
    for (const { id, file_path, lines } of datasetFiles) {
      const abs = path.join(UPLOADS_DIR, file_path.replace(/^\/uploads\//, ""));
      const ext = path.extname(file_path) || ".jpg";
      try {
        await copyFile(abs, path.join(outDir, "images", `${id}${ext}`));
        await writeFile(path.join(outDir, "labels", `${id}.txt`), lines.join("\n") + "\n");
        imageCount++;
      } catch {
        /* imagem ausente no disco — pula */
      }
    }

    const dataYaml =
      `# Dataset de fine-tune (segmentação) gerado das suas confirmações\n` +
      `path: ${outDir}\ntrain: images\nval: images\n` +
      `nc: ${CLASS_ORDER.length}\nnames: [${CLASS_ORDER.map((n) => `'${n}'`).join(", ")}]\n`;
    await writeFile(path.join(outDir, "data.yaml"), dataYaml);

    const readme =
      `# Fine-tune do detector (segmentação) com suas confirmações\n\n` +
      `${imageCount} imagem(ns), ${labelCount} contorno(s) que VOCÊ confirmou (✓) e salvou.\n` +
      `Incremental — continue a partir dos pesos atuais.\n\n` +
      `No venv ml-venv:\n\n` +
      `    ml-venv/bin/yolo segment train model=ml/dental_best.pt data=ml/dataset_export/data.yaml epochs=50 imgsz=640\n\n` +
      `Novos pesos: runs/segment/train/weights/best.pt — revise antes de adotar.\n` +
      `Atenção: regiões não confirmadas contam como fundo; melhor combinar com o dataset original.\n`;
    await writeFile(path.join(outDir, "README.txt"), readme);

    return { imageCount, labelCount, byClass, path: outDir };
  });
}
