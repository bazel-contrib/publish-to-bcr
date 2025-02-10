#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail -o xtrace

STRIP_PREFIX="$(cat bazel-central-registry/modules/versioned/1.0.0/source.json | jq -r ".strip_prefix")"
EXPECTED="publish-to-bcr-1.0.0"
if [ "${STRIP_PREFIX}" != "${EXPECTED}" ]; then
    echo "Incorrect strip prefix"
    echo "Expected ${EXPECTED} but got ${STRIP_PREFIX}"
    exit 1
fi
echo "Success"