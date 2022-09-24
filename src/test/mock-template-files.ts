import { randomUUID } from "crypto";

export function fakeModuleFile(
  overrides: {
    moduleName?: string;
    version?: string;
    invalidContents?: boolean;
    deps?: boolean;
    missingName?: boolean;
  } = {}
): string {
  if (overrides.invalidContents) {
    return randomUUID();
  }
  let content = `\
  module(
    ${
      overrides.missingName
        ? ""
        : `name = "${overrides.moduleName || "fake_ruleset"}",`
    }
    compatibility_level = 1,
    version = "${overrides.version || "0.0.0"}",
  )
  `;
  if (overrides.deps) {
    content += `\
bazel_dep(name = "bazel_skylib", version = "1.1.1")
bazel_dep(name = "platforms", version = "0.0.4")
`;
  }

  return content;
}

export function fakeSourceFile(
  overrides: {
    url?: string;
    stripPrefix?: string;
    malformed?: boolean;
    missingStripPrefix?: boolean;
    missingUrl?: boolean;
  } = {}
): string {
  if (overrides.malformed) {
    return `{"foo:`;
  }
  return `\
  {
    "integrity": "**leave this alone**",
    ${
      overrides.missingStripPrefix
        ? ""
        : `"strip_prefix": "${overrides.stripPrefix || "{REPO}-{VERSION}"}",`
    }
    ${
      overrides.missingUrl
        ? ""
        : `"url": "${
            overrides.url ||
            "https://github.com/{OWNER}/{REPO}/archive/refs/tags/{TAG}.tar.gz"
          }"`
    }
  }
  `;
}

export function fakePresubmitFile(
  options: { malformed?: boolean } = {}
): string {
  if (options.malformed) {
    return `
    ---
    buildifier: latest
      tasks
`;
  }
  return `\
---
buildifier: latest
tasks:
  ubuntu2004:
    build_targets:
      - "//..."
    test_targets:
      - "//..."
  macos:
    build_targets:
      - "//..."
    test_targets:
      - "//..."
  windows:
    build_targets:
      - "//..."
    test_targets:
      - "//..."
`;
}

export function fakeMetadataFile(
  options: {
    versions?: string[];
    homepage?: string;
    malformed?: boolean;
    missingVersions?: boolean;
  } = {}
): string {
  if (options.malformed) {
    return `{"foo":`;
  }
  return `\
    {
      "homepage": "${options.homepage || "https://docs.aspect.dev/bazel-lib"}",
      "maintainers": [
        {
          "email": "json@bearded.ca",
          "github": "bazel-contrib",
          "name": "Json Bearded"
        }
      ],
      ${
        options.missingVersions
          ? ""
          : `"versions": ${JSON.stringify(options.versions || [])},`
      }
      "yanked_versions": {}
    }
  `;
}

export function fakeConfigFile(
  options: { fixedReleaser?: string; invalidFixedReleaser?: boolean } = {}
) {
  if (options.invalidFixedReleaser) {
    return `\
fixedReleaser: {}
`;
  }
  return `\
${options.fixedReleaser ? `fixedReleaser: ${options.fixedReleaser}` : ""}
`;
}
