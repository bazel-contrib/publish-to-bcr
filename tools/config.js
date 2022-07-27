import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
export const DIST_DIR = path.join(PROJECT_DIR, "dist");
