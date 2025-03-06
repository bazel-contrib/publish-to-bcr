#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail -o xtrace

FIXTURE="${1}"
STRIP_PREFIX="${2}"

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
ACTION_REPO_PATH="${SCRIPT_DIR}/../../"
FIXTURE_PATH="${ACTION_REPO_PATH}/e2e/fixtures/${FIXTURE}"

# Create a release archive from a fixture
tar -czvf archive.tar.gz -C "${FIXTURE_PATH}" --transform "s,^./,${STRIP_PREFIX}/," --sort=name --owner=root:0 --group=root:0 --mtime="UTC 1980-02-01" .

if [ -f "${FIXTURE_PATH}/.bcr/config.yml" ]; then
    readarray -t MODULE_ROOTS < <(cat "${FIXTURE_PATH}/.bcr/config.yml" | yq -r '.moduleRoots.[]')
else
    MODULE_ROOTS=(".")
fi

# Substitute the archive url to a local file path
for MODULE_ROOT in "${MODULE_ROOTS[@]}"; do
    cat "${FIXTURE_PATH}/.bcr/${MODULE_ROOT}/source.template.json" | jq ".url = \"file://$(realpath archive.tar.gz)\"" > "/tmp/source.template.json"
    mv /tmp/source.template.json "${FIXTURE_PATH}/.bcr/${MODULE_ROOT}/source.template.json"
    cat "${FIXTURE_PATH}/.bcr/${MODULE_ROOT}/source.template.json"
done
