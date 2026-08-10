import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(dirname, "..", "uploads");
