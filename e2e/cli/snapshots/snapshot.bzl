"""Macro for snapshot testing BCR entryies"""

load("@aspect_bazel_lib//lib:copy_to_directory.bzl", "copy_to_directory")
load("@aspect_bazel_lib//lib:write_source_files.bzl", "write_source_files")
load("@aspect_rules_js//js:defs.bzl", "js_run_binary")

def snapshot_test(name, repo_fixture, release_archive, module_name, module_version, tag, gh_repo, extra_srcs = []):
    """Create a snapshot test for a BCR entry.

    Runs the CLI against a ruleset repo fixture and a release archive to
    produce a BCR entry, and mint a write_source_files target to ensure
    the source committed snapshot is validated against the generated version.

    Args:
        name: Name of the write_source_files target
        repo_fixture: Name of the ruleset fixture under //e2e/fixtures
        release_archive: Label pointing to the release archive to use
        module_name: Name of the BCR module to publish
        module_version: Version of the BCR module to publish
        tag: Git tag for the module release
        gh_repo: Canonical "owner/repo" for the ruleset
        extra_srcs: Additional dependencies to pass the entry build
    """
    js_run_binary(
        name = "{}_entry".format(name),
        srcs = [
            "//:package_json",
            repo_fixture,
            release_archive,
        ] + extra_srcs,
        copy_srcs_to_bin = False,
        tool = "//src/application/cli:bin",
        args = [
            "create-entry",
            "--local-registry",
            "../../../$(@D)",
            "--templates-dir",
            "../../../$(execpath {})/.bcr".format(repo_fixture),
            "--module-version",
            module_version,
            "--github-repository",
            gh_repo,
            "--tag",
            tag,
            "--local-artifact-path",
            "e2e/fixtures",
        ],
        out_dirs = ["{}_bcr".format(name)],
        use_execroot_entry_point = True,
        allow_execroot_entry_point_with_no_copy_data_to_bin = True,
    )

    copy_to_directory(
        name = "{}_entry_dir".format(name),
        srcs = [
            ":{}_entry".format(name),
        ],
        replace_prefixes = {
            "{}_bcr".format(name): "",
        },
    )

    write_source_files(
        name = name,
        files = {
            module_name: ":{}_entry_dir".format(name),
        },
    )
