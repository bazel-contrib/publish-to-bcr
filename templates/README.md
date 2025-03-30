# Publish to BCR template files

The [.bcr](.bcr) folder contains template files that you must include in your ruleset repository.
The app uses these templates to form a new BCR entry after a release.

Copy the `.bcr` folder to the root of your ruleset repository and customize the template files accordingly.

For more information about the files that make up a BCR entry, see the [Bzlmod User Guide](https://docs.bazel.build/versions/main/bzlmod.html).

---

### [.bcr/metadata.template.json](.bcr/metadata.template.json)

Insert your ruleset's homepage and fill out the list of maintainers. Replace `OWNER/REPO` with your repository's
canonical name. Leave `versions` alone as this will be filled automatically.

_Note_: Maintainers will be emailed if a release fails.

```jsonc
{
  "homepage": "INSERT_YOUR_HOMEPAGE", // <-- Edit this
  "maintainers": [
    {
      // <-- And this
      "name": "INSERT_YOUR_NAME",
      "email": "INSERT_YOUR_EMAIL",
      "github": "INSERT_YOUR_GITHUB_USERNAME"
    }
  ],
  "repository": [
    "github:OWNER/REPO"  // <-- Replace OWNER and REPO with the correct values
  ],
  "versions": [],
  "yanked_versions": {}
}
```

---

### [.bcr/presubmit.yml](.bcr/presubmit.yml)

Use the provided presubmit.yml file or replace it with your own. It should contain
essential build and test targets that are used to sanity check a module version.
The tasks are run by the BCR's CI pipelines.

We recommend using test workspace in your ruleset that exercises your module
with bzlmod.

Note that the `bazel` version must be specified for all tasks.

```yaml
bcr_test_module:
  module_path: "e2e/bzlmod"
  matrix:
    platform: ["debian10", "macos", "ubuntu2004", "windows"]
    bazel: [6.x, 7.x]
  tasks:
    run_tests:
      name: "Run test module"
      platform: ${{ platform }}
      bazel: ${{ bazel }}
      test_targets:
        - "//..."
```

---

### [.bcr/source.template.json](.bcr/source.template.json)

The app will automatically substitute in values for `{REPO}`, `{VERSION}`, `{OWNER}`, and `{TAG}`
corresponding to your ruleset repository and the release.

The `integrity` hash will automatically be filled out by the app. Leave it empty.

Check that the `strip_prefix` and `url` follow the correct format for your ruleset's release
archive. The values the template comes with correspond to the archives produced by the
release-tgz.yml workflow shown below.

```jsonc
{
  "integrity": "", // <-- Leave this alone
  "strip_prefix": "{REPO}-{VERSION}",
  "url": "https://github.com/{OWNER}/{REPO}/releases/download/{TAG}/{REPO}-{VERSION}.tar.gz"
}
```

Instead of publishing release archives using release-tgz.yml it is possible to rely on
GitHub-generated source archives. This is strongly discouraged because these are not generated in a
stable way over time, so checksums intermittently change. Any time this happens, all your old
releases will instantly become unusable because the `integrity` values checked into the
bazel-central-registry repo will be stale.

```jsonc
{
  "integrity": "",
  "strip_prefix": "{REPO}-{VERSION}",
  "url": "https://github.com/{OWNER}/{REPO}/archive/refs/tags/{TAG}.tar.gz" // strongly discouraged
}
```

---

### (Optional) [.bcr/config.yml](.bcr/config.yml)

A configuration file to override default behaviour of the app.

```yaml
fixedReleaser:
  login: <GITHUB_USERNAME>
  email: <EMAIL>
```

| Field         | Description                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fixedReleaser | GitHub username and email to use as the author for BCR commits. Set this if you want a single user to always be the author of BCR entries regardless of who cut the release. |
| moduleRoots | List of relative paths to Bazel modules within the repository. Set this if your MODULE.bazel file is not in the root directory, or if you want to publish multiple modules to the BCR. Defaults to `["."]`. Each module root must have a corresponding set of template files (metadata.template.json, source.template.json, presubmit.yml) under `.bcr` with the same relative path as the module. For example, if `moduleRoots` is `[".", "sub/module"]`, then there must be separate sets of template files under `.bcr` and `.bcr/sub/module`.  |

---

### (Optional) [.github/workflows/release-tgz.yml](.github/workflows/release-tgz.yml)

This GitHub Actions workflow uploads a source archive with a stable checksum for each new release
you publish. When you push a tag and publish a release for that tag, the workflow adds the source
archive as an artifact under that release.

Using a workflow like this is preferred over relying on GitHub's lazily generated source archives,
which do not have a stable checksum over time and will fail integrity checks.

```yaml
name: Release
on:
  release:
    types: [released]
permissions:
  contents: write
jobs:
  upload:
    uses: bazel-contrib/publish-to-bcr/.github/workflows/release-tgz.yml@master
```
