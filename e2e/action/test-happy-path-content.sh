#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail -o xtrace

EXPECTED_PATH="expected"
mkdir -p "${EXPECTED_PATH}/1.0.0"

cat > "${EXPECTED_PATH}/metadata.json" <<- EOF
{
    "homepage": "https://github.com/testorg/versioned",
    "maintainers": [
        {
            "name": "Foo McBar",
            "email": "foo@test.org",
            "github": "foobar",
            "github_user_id": 1234
        }
    ],
    "repository": [
        "github:testorg/versioned"
    ],
    "versions": [
        "1.0.0"
    ],
    "yanked_versions": {}
}
EOF
cat > "${EXPECTED_PATH}/1.0.0/MODULE.bazel" <<- EOF
module(
    name = "versioned",
    version = "1.0.0",
)
EOF
cat > "${EXPECTED_PATH}/1.0.0/source.json" <<- EOF
{
    "integrity": "sha256-eLJUZjOh+76IBFAfzeh/4WHDIneTz/JE2I3omT4EVng=",
    "strip_prefix": "versioned-1.0.0",
    "url": "file:///home/runner/work/publish-to-bcr/publish-to-bcr/archive.tar.gz"
}
EOF
cat > "${EXPECTED_PATH}/1.0.0/presubmit.yml" <<- EOF
bcr_test_module:
  module_path: "e2e/bzlmod"
  matrix:
    platform: ["debian10", "macos", "ubuntu2004", "windows"]
    bazel: [6.x, 7.x]
  tasks:
    run_tests:
      name: "Run test module"
      platform: \${{ platform }}
      bazel: \${{ bazel }}
      test_targets:
        - "//..."
EOF

ENTRY_PATH="bazel-central-registry/modules/versioned"

diff <(jq --sort-keys . "${ENTRY_PATH}/metadata.json") <(jq --sort-keys . "${EXPECTED_PATH}/metadata.json")
diff <(jq --sort-keys . "${ENTRY_PATH}/1.0.0/source.json") <(jq --sort-keys . "${EXPECTED_PATH}/1.0.0/source.json")
diff "${ENTRY_PATH}/1.0.0/MODULE.bazel" "${EXPECTED_PATH}/1.0.0/MODULE.bazel"
diff "${ENTRY_PATH}/1.0.0/presubmit.yml" "${EXPECTED_PATH}/1.0.0/presubmit.yml"