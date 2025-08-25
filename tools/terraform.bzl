"""Terraform tool runnable target with optional data deps that will be built before run"""

load("@rules_shell//shell:sh_binary.bzl", "sh_binary")

def terraform(name, data = [], **kwargs):
    sh_binary(
        name = name,
        srcs = ["//tools:tool.sh"],
        args = ["$(rootpath @multitool//tools/terraform)"],
        data = ["@multitool//tools/terraform"] + data,
        tags = kwargs.pop("tags", ["manual"]),
        visibility = kwargs.pop("visibility", ["//:__subpackages__"]),
        **kwargs
    )
