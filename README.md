# Publish to BCR

Release automation that mirrors releases of your Bazel ruleset to the [Bazel Central Registry](https://github.com/bazelbuild/bazel-central-registry).

## Prerequisites

Prepare your ruleset for bzlmod by following the [Bzlmod User Guide](https://bazel.build/docs/bzlmod).

Then, include these [template files](./templates) in your ruleset repository.

## Setup

Create a GitHub Actions workflow in your ruleset repository by creating a file, typically named `.github/workflows/publish.yaml`.

This repository provides a reusable workflow that contains all the boilerplate.
See complete documentation in the [reusable workflow file](./.github/workflows/publish.yaml).

1. Decide how your workflow will be invoked

Use an `on` block, and provide at least the `tag_name` as an input.

For example, if you have a release automation using GitHub Actions, you might call this publish workflow upon successful completion.
A recommended setup for release automation, including generating attestations to prove the provenance of release artifacts, may be found at
https://github.com/bazel-contrib/.github/blob/master/.github/workflows/

As another example, you might use `workflow_dispatch` to manually run the publish workflow from the GitHub web UI or the CLI
([documentation](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/manually-running-a-workflow))

It's also useful to permit both of these, for example:

```yaml
on:
  # Run the publish workflow after a successful release
  # Will be triggered from the release.yaml workflow
  workflow_call:
    inputs:
      tag_name:
        required: true
        type: string
  # In case of problems, let release engineers retry by manually dispatching
  # the workflow from the GitHub UI
  workflow_dispatch:
    inputs:
      tag_name:
        required: true
        type: string
```

2. Reference the reusable workflow in your `publish` job (replacing the `[version]` placeholder).

```yaml
jobs:    
  publish:
    uses: bazel-contrib/publish-to-bcr/.github/workflows/publish.yaml@[version]
    with:
      tag_name: ${{ inputs.tag_name }}
      # GitHub repository which is a fork of the upstream where the Pull Request will be opened.
      registry_fork: aspect-build/bazel-central-registry
    permissions:
      attestations: write
      contents: write
      id-token: write
    secrets:
      # Necessary to push to the BCR fork, and to open a pull request against a registry
      publish_token: ${{ secrets.PUBLISH_TOKEN }}
```

3. Create a Personal Access Token

Create a "Classic" PAT, see [documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-personal-access-token-classic)

> [!NOTE]  
> At the moment, fine-grained PATs are not supported because they cannot open pull requests against public 
> repositories, although this is on GitHub's roadmap: https://github.com/github/roadmap/issues/600.

Save it as `PUBLISH_TOKEN` in your repository or org, under _Settings > Secrets and variables > Actions_.

## Publishing multiple modules in the same repo

Multple modules that are versioned together in the same git repository can be published by configuring [`moduleRoots`](./templates/README.md#optional-configyml).

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

## LEGACY GitHub App

Prior to the introduction of the attestation feature in March 2025, this functionality was provided by a GitHub App.

This documentation remains for users of that method to reference before upgrading.

[Configure](https://github.com/apps/publish-to-bcr) the app for two repositories:

   - Your ruleset repository.
   - A fork of [bazelbuild/bazel-central-registry](https://github.com/bazelbuild/bazel-central-registry). The fork can be in the same GitHub account as your ruleset _or_ in the release author's personal account. If you use release automation and the release author is the github-actions bot, then the fork must
     be in ruleset's account unless you [override the releaser](./templates/README.md#optional-configyml).

   _Note: Authors of rulesets under the `bazelbuild` org should add the app to their personal fork of `bazelbuild/bazel-central-registry`._

