bats_load_library "bats-assert"
bats_load_library "bats-file"
bats_load_library "bats-support"

setup_file() {
    export CLI_BIN="$(dirname "${CLI_BIN}")/../main.js"
}

setup() {
    export REGISTRY_PATH="${TEST_TMPDIR}/bazel-central-registry"
    mkdir -p "${REGISTRY_PATH}/modules"
}

teardown() {
    rm -rf "${TEST_TMPDIR}/*"
}

swap_source_url() {
    local SRC=$1
    local URL=$2

    cat "${SRC}" | jq ".url = \"${URL}\"" > "${TEST_TMPDIR}/tmp"
    mv "${TEST_TMPDIR}/tmp" "${SRC}"
}

@test 'no_args_shows_help' {
    run "${NODE_BIN}" "${CLI_BIN}"

	assert_output --partial 'Not enough non-option arguments: got 0, need at least 1'
    assert_output --partial 'publish-to-bcr <cmd> [args]'

    assert_failure
}

@test '--help' {
    run "${NODE_BIN}" "${CLI_BIN}" --help

    assert_output --partial 'publish-to-bcr <cmd> [args]'
    assert_output --partial 'publish-to-bcr create-entry  Create a new module version entry for the BCR'
    assert_output --partial '--version  Show version number'

    assert_success
}

@test 'create entry with tar archive' {
    FIXTURE="e2e/fixtures/versioned"
    cp -R "${FIXTURE}" "${TEST_TMPDIR}/"
    FIXTURE="${TEST_TMPDIR}/$(basename "${FIXTURE}")"
    TEMPLATES_DIR="${FIXTURE}/.bcr"
    RELEASE_ARCHIVE="e2e/fixtures/versioned-versioned-1.0.0.tar"

    swap_source_url "${TEMPLATES_DIR}/source.template.json" "file://$(realpath "${RELEASE_ARCHIVE}")"

    run "${NODE_BIN}" "${CLI_BIN}" create-entry --local-registry "${REGISTRY_PATH}" --templates-dir "${TEMPLATES_DIR}" --module-version 1.0.0 --github-repository owner/versioned --tag v1.0.0

    assert_success

    ENTRY_PATH="${REGISTRY_PATH}/modules/versioned"

    assert_file_exists "${ENTRY_PATH}/metadata.json"
    assert_file_exists "${ENTRY_PATH}/1.0.0/MODULE.bazel"
    assert_file_exists "${ENTRY_PATH}/1.0.0/source.json"
    assert_file_exists "${ENTRY_PATH}/1.0.0/presubmit.yml"
}

@test 'create entry with zip archive' {
    FIXTURE="e2e/fixtures/zip"
    cp -R "${FIXTURE}" "${TEST_TMPDIR}/"
    FIXTURE="${TEST_TMPDIR}/$(basename "${FIXTURE}")"
    TEMPLATES_DIR="${FIXTURE}/.bcr"
    RELEASE_ARCHIVE="e2e/fixtures/zip-zip-1.0.0.zip"

    swap_source_url "${TEMPLATES_DIR}/source.template.json" "file://$(realpath "${RELEASE_ARCHIVE}")"

    run "${NODE_BIN}" "${CLI_BIN}" create-entry --local-registry "${REGISTRY_PATH}" --templates-dir "${TEMPLATES_DIR}" --module-version 1.0.0 --github-repository owner/zip --tag v1.0.0

    assert_success

    ENTRY_PATH="${REGISTRY_PATH}/modules/zip"

    assert_file_exists "${ENTRY_PATH}/metadata.json"
    assert_file_exists "${ENTRY_PATH}/1.0.0/MODULE.bazel"
    assert_file_exists "${ENTRY_PATH}/1.0.0/source.json"
    assert_file_exists "${ENTRY_PATH}/1.0.0/presubmit.yml"
}

@test 'missing OWNER/REPO vars' {
    FIXTURE="e2e/fixtures/versioned"
    cp -R "${FIXTURE}" "${TEST_TMPDIR}/"
    FIXTURE="${TEST_TMPDIR}/$(basename "${FIXTURE}")"
    TEMPLATES_DIR="${FIXTURE}/.bcr"
    RELEASE_ARCHIVE="e2e/fixtures/versioned-versioned-1.0.0.tar"

    swap_source_url "${TEMPLATES_DIR}/source.template.json" "file://$(realpath "${RELEASE_ARCHIVE}")"

    run "${NODE_BIN}" "${CLI_BIN}" create-entry --local-registry "${REGISTRY_PATH}" --templates-dir "${TEMPLATES_DIR}" --module-version 1.0.0 --tag v1.0.0

    assert_failure

    assert_output --partial 'Did you forget to pass --github-repository to substitute the OWNER and REPO variables?'
}