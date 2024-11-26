import { promises as fs } from "node:fs";
import stream from "node:stream";
import zlib from "node:zlib";

const LZMA_CONCATENATED = 0x08;

type lzma_ret = number;

const lzma_ret = {
  OK                 : 0,
  STREAM_END         : 1,
  NO_CHECK           : 2,
  UNSUPPORTED_CHECK  : 3,
  GET_CHECK          : 4,
  MEM_ERROR          : 5,
  MEMLIMIT_ERROR     : 6,
  FORMAT_ERROR       : 7,
  OPTIONS_ERROR      : 8,
  DATA_ERROR         : 9,
  BUF_ERROR          : 10,
  PROG_ERROR         : 11,
  SEEK_NEEDED        : 12,
} as const;

const BUF_SIZE = 0x10000; // 64 KiB

// 128 MiB, large enough for archives encoded with `xz -9` plus some
// extra margin;
const MEM_LIMIT = 0x8000000;

type ptr = number;

interface xzdec_exports {
  xzdec_allocate(len: number): ptr;
  xzdec_deallocate(ptr: ptr): void;

  xzdec_new_stream_decoder(
    memlimit: number,
    flags: number,
    xzdec_ptr: ptr,
  ): lzma_ret;

  xzdec_drop(xzdec: ptr): lzma_ret;

  xzdec_input_empty(xzdec: ptr): number;

  xzdec_set_input(xzdec: ptr, input_buf: ptr, input_buf_len: number): void;

  xzdec_next_output(
    xzdec: ptr,
    output_buf: ptr,
    output_buf_cap: number,
    output_buf_len: ptr,
  ): lzma_ret;

  xzdec_finish(
    xzdec: ptr,
    output_buf: ptr,
    output_buf_cap: number,
    output_buf_len: ptr,
  ): lzma_ret;
};

let moduleOnce: Promise<WebAssembly.Module> = null;

async function loadXzdec(): Promise<WebAssembly.Module> {
  const wasmPath = "./infrastructure/xzdec/xzdec.wasm.gz";
  const wasmGzBytes = await fs.readFile(wasmPath);
  const wasmBytes = new Uint8Array(zlib.gunzipSync(wasmGzBytes));
  return await WebAssembly.compile(wasmBytes);
}

export async function decompress(r: stream.Readable, w: stream.Writable) {
  if (moduleOnce === null) {
    moduleOnce = loadXzdec();
  }

  const instance = await WebAssembly.instantiate(await moduleOnce, {});
  const mem: WebAssembly.Memory = instance.exports.memory as any;
  const {
    xzdec_allocate,
    // xzdec_deallocate,
    xzdec_new_stream_decoder,
    // xzdec_drop,
    xzdec_input_empty,
    xzdec_set_input,
    xzdec_next_output,
    xzdec_finish,
  } = (instance.exports as any) as xzdec_exports;

  const SCRATCH_SIZE = 8;
  const scratchPtr = xzdec_allocate(SCRATCH_SIZE) as number;
  const inputPtr = xzdec_allocate(BUF_SIZE) as number;
  const outputPtr = xzdec_allocate(BUF_SIZE) as number;
  if (scratchPtr == 0 || inputPtr === 0 || outputPtr === 0) {
    throw new Error("xzdec_allocate() failed");
  }

    // struct scratch {
    //     struct Xzdec *;
    //     uint8_t *output_buf_len;
    // }
    const xzdecPtr = scratchPtr;
    const outputLenPtr = scratchPtr + 4;
  
    const flags = LZMA_CONCATENATED;
    let rc = xzdec_new_stream_decoder(MEM_LIMIT, flags, scratchPtr);
    if (rc !== lzma_ret.OK) {
      throw new Error(`xzdec_new_stream_decoder() failed: lzma_ret(${rc})`);
    }
    const xzdec = peekU32(mem, xzdecPtr);

    for await (let chunk of r) {
      while (chunk.length > 0) {
        if (xzdec_input_empty(xzdec) === 1) {
          const input = chunk.subarray(0, BUF_SIZE);
          chunk = chunk.subarray(BUF_SIZE);
          new Uint8Array(mem.buffer, inputPtr, input.length).set(input);
          xzdec_set_input(xzdec, inputPtr, input.length);
        }

        while (xzdec_input_empty(xzdec) == 0) {
          let rc = xzdec_next_output(xzdec, outputPtr, BUF_SIZE, outputLenPtr);
          if (rc !== lzma_ret.OK) {
            throw new Error(`xzdec_next_output() failed: lzma_ret(${rc})`);
          }
          const outputLen = peekU32(mem, outputLenPtr);
          if (outputLen > 0) {
            await new Promise((resolve) => {
              if (!w.write(Buffer.from(mem.buffer, outputPtr, outputLen))) {
                w.once('drain', resolve)
              }
              else {
                resolve(null);
              }
            });
          }
        }
      }
    }
  
    rc = xzdec_finish(xzdec, outputPtr, BUF_SIZE, outputLenPtr);
    if (rc !== lzma_ret.OK) {
      if (rc !== lzma_ret.STREAM_END) {
        throw new Error(`xzdec_finish() failed: lzma_ret(${rc})`);
      }
      const outputLen = peekU32(mem, outputLenPtr);
      if (outputLen > 0) {
        w.write(Buffer.from(mem.buffer, outputPtr, outputLen));
      }
    }

    // Be lazy and let the entire module get garbage-collected, instead of
    // deallocating buffers.
}

function peekU32(mem: WebAssembly.Memory, addr: ptr): number {
  return new Uint32Array(mem.buffer, addr)[0];
}
