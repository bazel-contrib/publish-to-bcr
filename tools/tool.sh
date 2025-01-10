#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

tool="${PWD}/$1"
shift

cd "${BUILD_WORKING_DIRECTORY}"

exec "${tool}" "$@"
