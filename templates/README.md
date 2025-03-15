# Publish to BCR template files

The [.bcr](.bcr) folder contains template files that you must include in your ruleset repository.
The publish automation logic uses these templates to form a new BCR entry after a release.

Copy the `.bcr` folder to the root of your ruleset repository and customize the template files accordingly.

For more information about the files that make up a BCR entry, see the [Bzlmod User Guide](https://docs.bazel.build/versions/main/bzlmod.html).

---

### [metadata.template.json](.bcr/metadata.template.json)

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

### [presubmit.yml](.bcr/presubmit.yml)

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

### [source.template.json](.bcr/source.template.json)

Values will be automatically substituted for `{REPO}`, `{VERSION}`, `{OWNER}`, and `{TAG}`
corresponding to your ruleset repository and the release.

Check that the `strip_prefix` and `url` follow the correct format for your ruleset's release
archive.  If your repository relies on GitHub-generated source archives, then use
`{REPO}-{VERSION}`. If your repository builds its own release archive, you probably do not have a
prefix to be stripped. So, set `strip_prefix` to an empty string.

The `integrity` hash will automatically be filled out.

```jsonc
{
  "integrity": "", // <-- Leave this alone
  "strip_prefix": "{REPO}-{VERSION}",
  "url": "https://github.com/{OWNER}/{REPO}/releases/download/{TAG}/{REPO}-{TAG}.tar.gz"
}
```

---

### (Optional) [config.yml](.bcr/config.yml)

A configuration file to override default behaviour.

```yaml
fixedReleaser:
  login: <GITHUB_USERNAME>
  email: <EMAIL>
```

| Field         | Description                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fixedReleaser | [Only used by the Legacy GitHub app, not the reusable workflow] GitHub username and email to use as the author for commits. Set this if you want a single user to always be the author of BCR entries regardless of who cut the release. |
| moduleRoots | List of relative paths to Bazel modules within the repository. Set this if your MODULE.bazel file is not in the root directory, or if you want to publish multiple modules to the BCR. Defaults to `["."]`. Each module root must have a corresponding set of template files (metadata.template.json, source.template.json, presubmit.yml) under `.bcr` with the same relative path as the module. For example, if `moduleRoots` is `[".", "sub/module"]`, then there must be separate sets of template files under `.bcr` and `.bcr/sub/module`.  |

