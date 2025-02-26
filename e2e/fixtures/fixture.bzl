"Macros for setting up test fixtures"

load("@rules_pkg//pkg:mappings.bzl", "pkg_files", "strip_prefix")
load("@rules_pkg//pkg:pkg.bzl", "pkg_tar")
load("@rules_pkg//pkg:zip.bzl", "pkg_zip")

def fixture_archive(name, archive, prefix, fixture = None):
    """Create a release archive for a module fixture

    Args:
        name: Name of the archive (without extension)
        archive: Type of archive, "tar" or "zip"
        prefix: Prefix to add at the root of the archive
        fixture: Name of the fixture to use (defaults to `name`)
    """
    if fixture == None:
        fixture = name

    pkg_files(
        name = "{}_files".format(name),
        srcs = native.glob(["{}/**".format(fixture)]),
        strip_prefix = strip_prefix.from_pkg(fixture),
    )

    if archive == "zip":
        pkg_zip(
            name = name,
            srcs = [":{}_files".format(name)],
            compression_level = 0,
            package_dir = prefix,
            out = "{}-{}.zip".format(fixture, "" if prefix == None else prefix),
            visibility = ["//e2e:__subpackages__"],
        )
    elif archive == "tar.gz":
        pkg_tar(
            name = name,
            srcs = [":{}_files".format(name)],
            package_dir = prefix,
            out = "{}-{}.tar.gz".format(fixture, "" if prefix == None else prefix),
            extension = "tar.gz",
            visibility = ["//e2e:__subpackages__"],
        )
