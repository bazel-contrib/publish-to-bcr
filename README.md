# Publish to BCR

_:warning: This app is under development and is not ready to be used._

A GitHub app that mirrors releases of your Bazel ruleset to the [Bazel Central Registry](https://github.com/bazelbuild/bazel-central-registry).

## Prerequisites

Prepare your ruleset for bzlmod by following the [Bzlmod User Guide](https://bazel.build/docs/bzlmod).

## How it works

1. [Configure](https://github.com/apps/publish-to-bcr) the app for:
   - Your ruleset repository
   - A fork of [bazelbuild/bazel-central-registry](https://github.com/bazelbuild/bazel-central-registry). The fork can be in the same GitHub account as your ruleset _or_ in your personal account.
1. Include these [template files](templates/README.md) in your ruleset repository.
1. Cut a release. You will be tagged in a pull request against the BCR.

## Reporting issues

Create an issue in this repository for support.
