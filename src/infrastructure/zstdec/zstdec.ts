import stream from 'node:stream';

import { Decompress } from 'fzstd';

/**
 * Decompress a Zstandard-compressed stream from *r* and write the
 * decompressed bytes to *w*. Resolves once the input stream has ended
 * and all output has been flushed; does not close *w*.
 */
export async function decompress(r: stream.Readable, w: stream.Writable) {
  return new Promise<void>((resolve, reject) => {
    let resolved = false;
    const finish = (err?: Error) => {
      if (resolved) return;
      resolved = true;
      err ? reject(err) : resolve();
    };

    const decompressor = new Decompress((chunk, final) => {
      if (chunk.length > 0 && !w.write(Buffer.from(chunk))) {
        r.pause();
        w.once('drain', () => r.resume());
      }
      if (final) {
        finish();
      }
    });

    r.on('data', (chunk: Buffer) => {
      try {
        decompressor.push(
          new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
        );
      } catch (e) {
        finish(e as Error);
      }
    });

    r.on('end', () => {
      try {
        decompressor.push(new Uint8Array(0), true);
      } catch (e) {
        finish(e as Error);
      }
    });

    r.on('error', finish);
  });
}
