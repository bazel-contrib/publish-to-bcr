"""Makes tool macros for terraform et al"""

load("@rules_shell//shell:sh_binary.bzl", "sh_binary")

def make_tool(tool, target, data = [], **kwargs):
    sh_binary(
        name = tool,
        srcs = ["//tools:tool.sh"],
        args = select({
            "//platforms/config:linux_x86_64": ["$(rootpath @{tool}_linux_x86_64{target})".format(
                target = target,
                tool = tool,
            )],
            "//platforms/config:macos_aarch64": ["$(rootpath @{tool}_macos_aarch64{target})".format(
                target = target,
                tool = tool,
            )],
            "//platforms/config:macos_x86_64": ["$(rootpath @{tool}_macos_x86_64{target})".format(
                target = target,
                tool = tool,
            )],
        }),
        data = select({
            "//platforms/config:linux_x86_64": ["@{tool}_linux_x86_64{target}".format(
                target = target,
                tool = tool,
            )],
            "//platforms/config:macos_aarch64": ["@{tool}_macos_aarch64{target}".format(
                target = target,
                tool = tool,
            )],
            "//platforms/config:macos_x86_64": ["@{tool}_macos_x86_64{target}".format(
                target = target,
                tool = tool,
            )],
        }) + data,
        tags = kwargs.pop("tags", ["manual"]),
        visibility = kwargs.pop("visibility", ["//:__subpackages__"]),
        **kwargs
    )
