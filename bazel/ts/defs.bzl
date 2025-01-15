"""
Defaults for Typescript projects
"""

load("@aspect_rules_ts//ts:defs.bzl", _ts_config = "ts_config", _ts_project = "ts_project")

ts_config = _ts_config

def ts_project(name, **kwargs):
    """Defaults for ts_project.

    Args:
        name: Name of the ts_project target
        **kwargs: Additional attributes to pass to the ts_project rule
    """

    tsconfig = kwargs.pop("tsconfig", "//:tsconfig")

    _ts_project(
        name = name,
        declaration = True,
        source_map = True,
        allow_js = True,
        tsconfig = {"include": ["**/*.ts"]},
        extends = tsconfig,
        **kwargs
    )
