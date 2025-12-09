bats_load_library "bats-assert"
bats_load_library "bats-file"
bats_load_library "bats-support"

setup() {
    export REGISTRY_PATH="${TEST_TMPDIR}/bazel-central-registry"
    mkdir -p "${REGISTRY_PATH}/modules"

    export jq="../${JQ_BIN#"external/"}"
}

teardown() {
    rm -rf "${TEST_TMPDIR}"/*
}

swap_source_url() {
    local SRC=$1
    local URL=$2

    cat "${SRC}" | jq ".url = \"${URL}\"" > "${TEST_TMPDIR}/tmp"
    mv "${TEST_TMPDIR}/tmp" "${SRC}"
}

swap_attestation_url() {
    local SRC=$1
    local FIELD=$2
    local URL=$3

    cat "${SRC}" | jq ".attestations[\"${FIELD}\"].url = \"${URL}\"" > "${TEST_TMPDIR}/tmp"
    mv "${TEST_TMPDIR}/tmp" "${SRC}"
}

mock_attestation() {
    local NAME=$1

    FILE="$(mktemp -p "${TEST_TMPDIR}" --directory)/${NAME}"
    jq --null-input "{foobar:\"${NAME}\"}" > "${FILE}"

    echo -n "${FILE}"
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
    RELEASE_ARCHIVE="e2e/fixtures/versioned-versioned-1.0.0.tar.gz"

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

@test 'multi-module entry' {
    FIXTURE="e2e/fixtures/multi-module"
    cp -R "${FIXTURE}" "${TEST_TMPDIR}/"
    FIXTURE="${TEST_TMPDIR}/$(basename "${FIXTURE}")"
    TEMPLATES_DIR="${FIXTURE}/.bcr"
    RELEASE_ARCHIVE="e2e/fixtures/multi-module-multi-module-1.0.0.tar.gz"

    swap_source_url "${TEMPLATES_DIR}/source.template.json" "file://$(realpath "${RELEASE_ARCHIVE}")"
    swap_source_url "${TEMPLATES_DIR}/submodule/source.template.json" "file://$(realpath "${RELEASE_ARCHIVE}")"

    run "${NODE_BIN}" "${CLI_BIN}" create-entry --local-registry "${REGISTRY_PATH}" --templates-dir "${TEMPLATES_DIR}" --module-version 1.0.0 --github-repository testorg/multi-module --tag v1.0.0

    assert_success

    ENTRY_PATH="${REGISTRY_PATH}/modules/module"

    assert_file_exists "${ENTRY_PATH}/metadata.json"
    assert_file_exists "${ENTRY_PATH}/1.0.0/MODULE.bazel"
    assert_file_exists "${ENTRY_PATH}/1.0.0/source.json"
    assert_file_exists "${ENTRY_PATH}/1.0.0/presubmit.yml"

    ENTRY_PATH="${REGISTRY_PATH}/modules/submodule"

    assert_file_exists "${ENTRY_PATH}/metadata.json"
    assert_file_exists "${ENTRY_PATH}/1.0.0/MODULE.bazel"
    assert_file_exists "${ENTRY_PATH}/1.0.0/source.json"
    assert_file_exists "${ENTRY_PATH}/1.0.0/presubmit.yml"
}

@test 'create entry with attestations' {
    FIXTURE="e2e/fixtures/attestations"
    cp -R "${FIXTURE}" "${TEST_TMPDIR}/"
    FIXTURE="${TEST_TMPDIR}/$(basename "${FIXTURE}")"
    TEMPLATES_DIR="${FIXTURE}/.bcr"
    RELEASE_ARCHIVE="e2e/fixtures/attestations-attestations-1.0.0.tar.gz"

    SOURCE_ATTESTATION=$(mock_attestation "source.json.intoto.jsonl")
    MODULE_ATTESTATION=$(mock_attestation "MODULE.bazel.intoto.jsonl")
    ARCHIVE_ATTESTATION=$(mock_attestation "attestations-v1.0.0.tar.gz.intoto.jsonl")

    swap_source_url "${TEMPLATES_DIR}/source.template.json" "file://$(realpath "${RELEASE_ARCHIVE}")"
    swap_attestation_url "${TEMPLATES_DIR}/attestations.template.json" "source.json" "file://$(realpath "${SOURCE_ATTESTATION}")"
    swap_attestation_url "${TEMPLATES_DIR}/attestations.template.json" "MODULE.bazel" "file://$(realpath "${MODULE_ATTESTATION}")"
    swap_attestation_url "${TEMPLATES_DIR}/attestations.template.json" "{REPO}-{TAG}.tar.gz" "file://$(realpath "${ARCHIVE_ATTESTATION}")"

    run "${NODE_BIN}" "${CLI_BIN}" create-entry --local-registry "${REGISTRY_PATH}" --templates-dir "${TEMPLATES_DIR}" --module-version 1.0.0 --github-repository owner/attestations --tag v1.0.0

    assert_success

    ENTRY_PATH="${REGISTRY_PATH}/modules/attestations"

    assert_file_exists "${ENTRY_PATH}/1.0.0/attestations.json"
}

@test 'missing OWNER/REPO vars' {
    FIXTURE="e2e/fixtures/versioned"
    cp -R "${FIXTURE}" "${TEST_TMPDIR}/"
    FIXTURE="${TEST_TMPDIR}/$(basename "${FIXTURE}")"
    TEMPLATES_DIR="${FIXTURE}/.bcr"
    RELEASE_ARCHIVE="e2e/fixtures/versioned-versioned-1.0.0.tar.gz"

    swap_source_url "${TEMPLATES_DIR}/source.template.json" "file://$(realpath "${RELEASE_ARCHIVE}")"

    run "${NODE_BIN}" "${CLI_BIN}" create-entry --local-registry "${REGISTRY_PATH}" --templates-dir "${TEMPLATES_DIR}" --module-version 1.0.0 --tag v1.0.0

    assert_failure

    assert_output --partial 'Did you forget to pass --github-repository to substitute the OWNER and REPO variables?'
}

@test 'missing module name' {
    FIXTURE="e2e/fixtures/missing-module-name"
    cp -R "${FIXTURE}" "${TEST_TMPDIR}/"
    FIXTURE="${TEST_TMPDIR}/$(basename "${FIXTURE}")"
    TEMPLATES_DIR="${FIXTURE}/.bcr"
    RELEASE_ARCHIVE="e2e/fixtures/missing-module-name-missing-module-name-1.0.0.tar.gz"

    swap_source_url "${TEMPLATES_DIR}/source.template.json" "file://$(realpath "${RELEASE_ARCHIVE}")"

    run "${NODE_BIN}" "${CLI_BIN}" \
        create-entry \
        --local-registry "${REGISTRY_PATH}" \
        --templates-dir "${TEMPLATES_DIR}" \
        --module-version 1.0.0 \
        --github-repository testorg/missing-module-name \
        --tag v1.0.0

    assert_failure

    assert_output --partial "Failed to parse module name from"
    assert_output --partial "/MODULE.bazel"
}

@test 'outputs json blob with info about entry to stdout' {
    FIXTURE="e2e/fixtures/versioned"
    cp -R "${FIXTURE}" "${TEST_TMPDIR}/"
    FIXTURE="${TEST_TMPDIR}/$(basename "${FIXTURE}")"
    TEMPLATES_DIR="${FIXTURE}/.bcr"
    RELEASE_ARCHIVE="e2e/fixtures/versioned-versioned-1.0.0.tar.gz"

    swap_source_url "${TEMPLATES_DIR}/source.template.json" "file://$(realpath "${RELEASE_ARCHIVE}")"

    STDOUT=$("${NODE_BIN}" "${CLI_BIN}" create-entry --local-registry "${REGISTRY_PATH}" --templates-dir "${TEMPLATES_DIR}" --module-version 1.0.0 --github-repository owner/versioned --tag v1.0.0)
    ENTRY_PATH="${REGISTRY_PATH}/modules/versioned/1.0.0"

    ACTUAL=$("${jq}" <<< ${STDOUT} .)
    EXPECTED=$("${jq}" --null-input "{\"modules\": [{\"name\": \"versioned\", entryPath: \"${ENTRY_PATH}\"}]}")

    assert_equal "${EXPECTED}" "${ACTUAL}"
}
