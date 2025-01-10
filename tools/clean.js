import fs from "node:fs";
import { BUILD_DIR, DIST_DIR } from "./config.js";

fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.rmSync(DIST_DIR, { recursive: true, force: true });
