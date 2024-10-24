# xz decompressor

This directory contains a WebAssembly module for decompressing an Xz file using
[liblzma], along with a JavaScript wrapper that adapts `xzdec.wasm` for use
with the Node.js [`node:stream`] library.

[liblzma]: https://github.com/tukaani-project/xz/tree/v5.4.5/src/liblzma
[`node:stream`]: https://nodejs.org/docs/latest-v18.x/api/stream.html

Files:
- `xzdec.c` is a thin wrapper around liblzma that exports functions with a
  WebAssembly-style ABI. It compiles to `xzdec.wasm`.
- `xzdec.wasm.gz` is a gzip-compressed `xzdec.wasm`, to reduce the size impact
  of checking generated build artifacts into Git.
- `xzdec.ts` exports the `decompress(r: stream.Readable, w: stream.Writable)`
  function, which instantiates a WebAssembly module from `xzdec.wasm.gz` and
  decompresses an Xz bitstream.

When building a new version of `xzdec.wasm.gz`, or verifying that the checked-in
artifact matches the expected output, Bazel should be run with `-c opt` so that
the compiled output is optimized.

```
$ cd src/infrastructure/xzdec
$ bazel build -c opt //:xzdec_wasm_gz
$ diff -s xzdec.wasm.gz bazel-bin/xzdec_wasm_gz/xzdec.wasm.gz
Files xzdec.wasm.gz and bazel-bin/xzdec_wasm_gz/xzdec.wasm.gz are identical
$
```

Note that variations in the gzip compression may cause spurious differences
between `xzdec.wasm.gz` -- in this case, decompressing the two files and
comparing `xzdec.wasm` directly may provide more consistent behavior.
