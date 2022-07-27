# Publish to BCR

_:warning: This app is under development and is not ready to be used._

A GitHub app that mirrors releases of your bazel ruleset to the [Bazel Central Registry](https://github.com/bazelbuild/bazel-central-registry).

## Prerequisites

See the [Bzlmod User Guide](https://bazel.build/docs/bzlmod) for how to make your ruleset ready for bzlmod.

## How it works

1. [Add the app](https://github.com/apps/publish-to-bcr) to your ruleset repository and to your fork of [bazelbuild/bazel-central-registry](https://github.com/bazelbuild/bazel-central-registry). The fork can be in the same GitHub account as your ruleset or in your personal account.
1. Include these [template files](templates/README.md) to your ruleset repository.
1. Cut a release. You will be tagged in a pull request against the BCR with an entry for your module.

## Reporting issues

Create an issue in this repository for support.
