import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

export class ReleaseHashService {
  public async calculate(archiveUrl: string): Promise<string> {
    const filename = archiveUrl.substring(archiveUrl.lastIndexOf("/") + 1);

    const downloadedPath = path.join(os.tmpdir(), filename);
    await download(archiveUrl, downloadedPath);

    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(downloadedPath));
    const digest = hash.digest("base64");

    return digest;
  }
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode === 200) {
        const file = fs.createWriteStream(dest, { flags: "w" });
        file.on("finish", () => resolve());
        file.on("error", (err) => {
          file.close();
          fs.unlink(dest, () => reject(err.message));
          reject(err);
        });
        response.pipe(file);
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // Redirect
        download(response.headers.location, dest).then(() => resolve());
      } else {
        reject(
          `Server responded with ${response.statusCode}: ${response.statusMessage}`
        );
      }
    });

    request.on("error", (err) => {
      reject(err.message);
    });
  });
}
