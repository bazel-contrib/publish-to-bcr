import crypto from 'node:crypto';
import fs from 'node:fs';

export function computeIntegrityHash(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  const digest = hash.digest('base64');
  return `sha256-${digest}`;
}
