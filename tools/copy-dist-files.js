import { globbySync } from "globby";
import fs from "node:fs";
import path from "node:path";
import { DIST_DIR, PROJECT_DIR } from "./config.js";

async function main() {
  const filesToInclude = getDistributableFiles();
  copyFilesToDist(filesToInclude);
}

function getDistributableFiles() {
  return globbySync([
    "package.json",
    "yarn.lock",
    "src/infrastructure/xzdec/xzdec.wasm.gz",
  ], {
    cwd: PROJECT_DIR,
  });
}

function copyFilesToDist(files) {
  console.info(`Copying extra files to ${DIST_DIR}`);
  files.forEach((file) => {
    const src = path.join(PROJECT_DIR, file);
    const distFile = file.replace(/^src\//, "");
    const dest = path.join(DIST_DIR, "publish-to-bcr", distFile);
    console.info(`  => ${file}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  });
}

(async () => {
  await main();
})();
