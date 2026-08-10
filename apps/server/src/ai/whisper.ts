import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const WHISPER_BIN = process.env.WHISPER_BIN ?? "/opt/homebrew/bin/whisper-cli";
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? "/opt/homebrew/bin/ffmpeg";
const MODEL_PATH = process.env.WHISPER_MODEL ?? path.join(dirname, "..", "..", "models", "ggml-small.bin");

export async function transcribeAudio(buffer: Buffer, sourceExtension: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "sc-whisper-"));
  const inputPath = path.join(dir, `input${sourceExtension}`);
  const wavPath = path.join(dir, "audio.wav");
  const outputBase = path.join(dir, "output");

  try {
    await writeFile(inputPath, buffer);
    // Browsers record webm/ogg; whisper.cpp wants wav (16kHz mono).
    await execFileAsync(FFMPEG_BIN, ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", wavPath]);
    await execFileAsync(WHISPER_BIN, [
      "-m", MODEL_PATH,
      "-f", wavPath,
      "--output-txt",
      "--no-timestamps",
      "-l", "pt",
      "-of", outputBase,
    ]);
    const text = await readFile(`${outputBase}.txt`, "utf-8");
    return text.trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
