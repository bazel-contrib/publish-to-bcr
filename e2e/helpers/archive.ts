import archiver from "archiver";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tar from "tar";

export async function makeReleaseTarball(
  fixture: string,
  stripPrefix?: string
): Promise<string> {
  const filename = path.join(
    os.tmpdir(),
    randomBytes(4).toString("hex") + ".tar.gz"
  );

  await tar.create(
    {
      gzip: { level: 1 },
      prefix: stripPrefix,
      file: filename,
      cwd: path.join("e2e", "fixtures", fixture),
      portable: true,
      mtime: new Date(0),
    } as any, // Typing bug, missing `mtime``: https://github.com/DefinitelyTyped/DefinitelyTyped/issues/67775
    ["."]
  );

  return filename;
}

export async function makeReleaseZip(
  fixture: string,
  stripPrefix?: string
): Promise<string> {
  const filename = path.join(
    os.tmpdir(),
    randomBytes(4).toString("hex") + ".zip"
  );

  const output = fs.createWriteStream(filename);
  const archive = archiver("zip");

  archive.pipe(output);

  const hermeticDate = new Date(0);
  archive.directory(
    path.join("e2e", "fixtures", fixture),
    stripPrefix || false,
    {
      date: hermeticDate,
    }
  );

  await archive.finalize();

  return filename;
}
