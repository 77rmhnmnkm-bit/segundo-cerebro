import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// This server runs as a long-lived process (eventually via launchd, not an
// interactive shell), so it can't rely on a shell rc file having put
// Homebrew on PATH — point at the known Homebrew bin path explicitly.
const TESSERACT_BIN = process.env.TESSERACT_BIN ?? "/opt/homebrew/bin/tesseract";

export async function ocrImage(buffer: Buffer, extension: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "sc-ocr-"));
  const inputPath = path.join(dir, `input${extension}`);
  const outputBase = path.join(dir, "output");

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync(TESSERACT_BIN, [inputPath, outputBase, "-l", "por+eng"]);
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(`${outputBase}.txt`, "utf-8");
    return text.trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text.trim();
}
