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
  overrides: { url?: string; stripPrefix?: string } = {}
): string {
  return `\
  {
    "integrity": "**leave this alone**",
    "strip_prefix": "${overrides.stripPrefix || "{REPO}-{VERSION}"}",
    "url": "${
      overrides.url ||
      "https://github.com/{OWNER}/{REPO}/archive/refs/tags/{TAG}.tar.gz"
    }"
  }
  `;
}

export function fakePresubmitFile(): string {
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
  options: { versions?: string[]; homepage?: string } = {}
): string {
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
      "versions": ${JSON.stringify(options.versions || [])},
      "yanked_versions": {}
    }
  `;
}
