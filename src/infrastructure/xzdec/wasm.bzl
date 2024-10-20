_WASM_ABIS = [
    "wasm32-wasip2",
]

def _platform_transition(settings, attr):
    return {"//command_line_option:platforms": str(attr._platform)}

platform_transition = transition(
    implementation = _platform_transition,
    inputs = [],
    outputs = ["//command_line_option:platforms"],
)

def _wasm_binary(ctx):
    out = ctx.outputs.out
    if not out:
        out = ctx.actions.declare_file(ctx.attr.name + ".wasm")
    ctx.actions.symlink(output = out, target_file = ctx.file.lib)
    return DefaultInfo(files = depset([out]))

wasm_binary = rule(
    implementation = _wasm_binary,
    attrs = {
        "lib": attr.label(
            allow_single_file = True,
            cfg = platform_transition,
        ),
        "out": attr.output(),
        "_platform": attr.label(
            default = Label("@toolchains_llvm//platforms:wasm32"),
        ),
        "_allowlist_function_transition": attr.label(
            default = "@bazel_tools//tools/allowlists/function_transition_allowlist",
        ),
    },
)

_SYSROOT_BUILD = """
filegroup(
    name = {name},
    srcs = glob(["include/**/*", "lib/**/*", "share/**/*"], allow_empty=True),
    visibility = ["//visibility:public"],
)
"""

def _wasi_sysroot(ctx):
    ctx.download_and_extract(
        integrity = "sha256-NRcvfSeZSFsVpGsdh/UKWF2RXsZiCA8AXZkVOlCIjwg=",
        stripPrefix = "wasi-sysroot-24.0",
        url = ["https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-24/wasi-sysroot-24.0.tar.gz"],
    )

    ctx.file("BUILD.bazel", "")
    ctx.file("sysroots/BUILD.bazel", "")
    for abi in _WASM_ABIS:
        ctx.file("sysroots/%s/BUILD.bazel" % (abi,), _SYSROOT_BUILD.format(
            name = repr(abi),
        ))
        ctx.execute(["mv", "include/" + abi, "sysroots/%s/include" % (abi,)])
        ctx.execute(["mv", "lib/" + abi, "sysroots/%s/lib" % (abi,)])
        ctx.execute(["mv", "share/" + abi, "sysroots/%s/share" % (abi,)])

wasi_sysroot = repository_rule(
    implementation = _wasi_sysroot,
)

def _wasm32_libclang_rt(ctx):
    ctx.file("BUILD.bazel", """
exports_files(["libclang_rt.builtins-wasm32.a"])

filegroup(
    name = "libclang_rt-wasm32-wasi",
    srcs = ["libclang_rt.builtins-wasm32.a"],
    visibility = ["//visibility:public"],
)
""")

    ctx.download_and_extract(
        integrity = "sha256-fjPA33WLkEabHePKFY4tCn9xk01YhFJbpqNy3gs7Dsc=",
        stripPrefix = "libclang_rt.builtins-wasm32-wasi-24.0",
        url = ["https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-24/libclang_rt.builtins-wasm32-wasi-24.0.tar.gz"],
    )

wasm32_libclang_rt = repository_rule(
    implementation = _wasm32_libclang_rt,
)
