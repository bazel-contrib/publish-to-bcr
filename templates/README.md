# Publish to BCR template files

The [.bcr](.bcr) folder contains template files that you must include in your ruleset repository.
The app uses these templates to form a new BCR entry after a release.

Copy the `.bcr` folder to the root of your ruleset repository and customize the template files accordingly.

For more information about the files that make up a BCR entry, see the [Bzlmod User Guide](https://docs.bazel.build/versions/main/bzlmod.html).

---

### [metadata.template.json](.bcr/metadata.template.json)

Insert your ruleset's homepage and fill out the list of maintainers. Leave `versions` alone as this
will be filled automatically.

```jsonc
{
  "homepage": "INSERT_YOUR_HOMEPAGE", // <-- Edit this
  "maintainers": [
    {
      // <-- And this
      "email": "INSERT_YOUR_EMAIL",
      "github": "INSERT_YOUR_GITHUB_ORG_OR_USERNAME",
      "name": "INSERT_YOUR_NAME"
    }
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

```yaml
bcr_test_module:
  module_path: "e2e/bzlmod"
  matrix:
    platform: ["debian10", "macos", "ubuntu2004", "windows"]
  tasks:
    run_tests:
      name: "Run test module"
      platform: ${{ platform }}
      test_targets:
        - "//..."
```

---

### [source.template.json](.bcr/source.template.json)

The app will automatically substitute in values for `{REPO}`, `{VERSION}`, `{OWNER}`, and `{TAG}`
corresponding to your ruleset repository and the release.

Check that the `strip_prefix` and `url` follow the correct format for your ruleset's release archive.

The `integrity` hash will automatically be filled out by the app.

```jsonc
{
  "integrity": "", // <-- Leave this alone
  "strip_prefix": "{REPO}-{VERSION}",
  "url": "https://github.com/{OWNER}/{REPO}/archive/refs/tags/{TAG}.tar.gz"
}
```

---

### (Optional) [config.yml](.bcr/config.yml)

A configuration file to override default behaviour of the app.

```yaml
fixedReleaser: <GITHUB_USERNAME>
```

| Field         | Description                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fixedReleaser | GitHub username (e.g., `kormide`) to author BCR entries. Set this if you want a single user to always be the author of BCR entries regardless of who cut the release. |
