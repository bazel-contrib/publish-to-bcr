"""Macro for setting up release archives for testing"""

load("@rules_pkg//pkg:mappings.bzl", "pkg_files", "strip_prefix")
load("@rules_pkg//pkg:pkg.bzl", "pkg_tar")
load("@rules_pkg//pkg:zip.bzl", "pkg_zip")
load("@rules_xz//xz/compress:defs.bzl", "xz_compress")

def release_archive(name, fixture, extension, prefix, out):
    """Create a release archive for a ruleset repo fixture.

    Args:
        name: Name of the archive target
        fixture: Name of the ruleset repo fixture under //e2e/fixtures
        extension: Extension of the archive to produce
        prefix: Prefix to include in the archive root
        out: Filename of the produced archive
    """

    # Only package up the MODULE.bazel files. Leave out the .bcr metadata
    # which may not be included in the release archive and shouldn't be
    # relied upon.
    pkg_files(
        name = "{}_files".format(name),
        srcs = native.glob(["{}/**/MODULE.bazel".format(fixture)]),
        strip_prefix = strip_prefix.from_pkg("{}".format(fixture)),
    )

    if extension == "zip":
        pkg_zip(
            name = name,
            srcs = [":{}_files".format(name)],
            compression_level = 0,
            package_dir = prefix,
            out = out,
            visibility = ["//e2e:__subpackages__"],
        )
    elif extension == "tar.gz":
        pkg_tar(
            name = name,
            srcs = [":{}_files".format(name)],
            package_dir = prefix,
            out = out,
            visibility = ["//e2e:__subpackages__"],
        )
    elif extension == "tar.xz":
        pkg_tar(
            name = "{}_archive".format(name),
            srcs = [":{}_files".format(name)],
            package_dir = prefix,
            out = out.removesuffix(".xz"),
            extension = "tar",
        )

        xz_compress(
            name = name,
            src = "{}_archive".format(name),
            visibility = ["//e2e:__subpackages__"],
        )
