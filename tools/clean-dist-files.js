import fs from "node:fs";
import { DIST_DIR } from "./config.js";

fs.rmSync(DIST_DIR, { recursive: true, force: true });
