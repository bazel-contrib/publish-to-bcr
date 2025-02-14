#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail -o xtrace

FIXTURE="${1}"
STRIP_PREFIX="${2}"

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
ACTION_REPO_PATH="${SCRIPT_DIR}/../../"

# Create a release archive from a fixture
tar -czvf archive.tar.gz -C "${ACTION_REPO_PATH}/e2e/fixtures/${FIXTURE}" --transform "s,^./,${STRIP_PREFIX}/," --sort=name --owner=root:0 --group=root:0 --mtime="UTC 1980-02-01" .

# Substitute the archive url to a local file path
cat "${ACTION_REPO_PATH}/e2e/fixtures/${FIXTURE}/.bcr/source.template.json" | jq ".url = \"file://$(realpath archive.tar.gz)\"" > "/tmp/source.template.json"
mv /tmp/source.template.json "${ACTION_REPO_PATH}/e2e/fixtures/${FIXTURE}/.bcr/source.template.json"
cat "${ACTION_REPO_PATH}/e2e/fixtures/${FIXTURE}/.bcr/source.template.json"
