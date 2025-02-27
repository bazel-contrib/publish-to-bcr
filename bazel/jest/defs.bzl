"""
Defaults for jest tests
"""

load("@aspect_bazel_lib//lib:copy_file.bzl", "copy_file")
load("@aspect_rules_jest//jest:defs.bzl", _jest_test = "jest_test")

def jest_test(name, **kwargs):
    """Defaults for jest_test.

    Args:
        name: Name of the jest_test target
        **kwargs: Additional attributes to pass to the jest_test rule
    """

    # Tell jest to use babel to transform ESM into commonjs before
    # running tests, because testing ESM in jest is a nightmare.
    # The location of the babel config file must be next to the jest
    # root in order to work, so copy it here.
    copy_file(
        name = "{}__babel_config".format(name),
        src = "//:babel.config.json",
        out = "babel.config.json",
    )

    data = kwargs.pop("data", [])

    _jest_test(
        name = name,
        config = "//:jest_config",
        data = data + [
            "babel.config.json",
            "//:node_modules/@babel/preset-env",
            "//:node_modules/babel-plugin-transform-import-meta",
            "//:package_json",
        ],
        node_modules = "//:node_modules",
        **kwargs
    )
