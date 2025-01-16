import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import archiver from 'archiver';
import tar from 'tar';

export async function makeReleaseTarball(
  fixture: string,
  prefix?: string
): Promise<string> {
  const filename = path.join(
    os.tmpdir(),
    randomBytes(4).toString('hex') + '.tar.gz'
  );

  await tar.create(
    {
      gzip: { level: 1 },
      prefix,
      file: filename,
      cwd: path.join('e2e', 'fixtures', fixture),
      portable: true,
      mtime: new Date(0),
    } as any, // Typing bug, missing `mtime``: https://github.com/DefinitelyTyped/DefinitelyTyped/issues/67775
    ['.']
  );

  return filename;
}

export async function makeReleaseZip(
  fixture: string,
  prefix?: string
): Promise<string> {
  const filename = path.join(
    os.tmpdir(),
    randomBytes(4).toString('hex') + '.zip'
  );

  const output = fs.createWriteStream(filename);
  const archive = archiver('zip');

  archive.pipe(output);

  const hermeticDate = new Date(0);
  archive.directory(path.join('e2e', 'fixtures', fixture), prefix || false, {
    date: hermeticDate,
  });

  await archive.finalize();

  return filename;
}
