# Publish to BCR

A GitHub app that mirrors releases of your Bazel ruleset to the [Bazel Central Registry](https://github.com/bazelbuild/bazel-central-registry).

## Prerequisites

Prepare your ruleset for bzlmod by following the [Bzlmod User Guide](https://bazel.build/docs/bzlmod).

## How it works

1. [Configure](https://github.com/apps/publish-to-bcr) the app for two repositories:

   - Your ruleset repository.
   - A fork of [bazelbuild/bazel-central-registry](https://github.com/bazelbuild/bazel-central-registry). The fork can be in the same GitHub account as your ruleset _or_ in the release author's personal account. If you use release automation and the release author is the github-actions bot, then the fork must
     be in ruleset's account unless you [override the releaser](./templates/README.md#optional-configyml).

   _Note: Authors of rulesets under the `bazelbuild` org should add the app to their personal fork of `bazelbuild/bazel-central-registry`._

1. Include these [template files](./templates) in your ruleset repository.
1. Cut a release. You will be tagged in a pull request against the BCR.

## Publishing multiple modules in the same repo

You can publish BCR entries for multiple modules that exist in your git repository by configuring [`moduleRoots`](./templates/README.md#optional-configyml).

## Including patches

Include patches in the BCR entry by adding them under `.bcr/patches` in your ruleset repository. All patches must have the `.patch` extension and be in the `-p1` format.

For example, a patch in `.bcr/patches/remove_dev_deps.patch` will be included in the entry's pull request and will be referenced in the
corresponding `source.json` file:

```json
{
    ...
    "patch_strip": 0,
    "patches": {
        "remove_dev_deps.patch": "sha256-DXvBJbXZWf3hITOIjeJbgER6UOXIB6ogpgullT+oP4k="
    }
}
```

To patch in a submodule, add the patch to a patches folder under the submodule path `.bcr/[sub/module]/patches` where sub/module is the path to the WORKSPACE folder relative to the repository root.

## Reporting issues

Create an issue in this repository for support.
