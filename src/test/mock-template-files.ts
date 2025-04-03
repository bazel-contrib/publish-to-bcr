import { randomUUID } from 'crypto';

import { FixedReleaser } from '../domain/configuration';

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
      ? ''
      : `name = "${overrides.moduleName || 'fake_ruleset'}",`
  }
  compatibility_level = 1,
  version = "${overrides.version || '0.0.0'}",
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

export interface FakeSourceFileOptions {
  readonly url?: string;
  readonly stripPrefix?: string;
  readonly malformed?: boolean;
  readonly missingStripPrefix?: boolean;
  readonly missingUrl?: boolean;
}

export function fakeSourceFile(overrides: FakeSourceFileOptions = {}): string {
  if (overrides.malformed) {
    return `{"foo:`;
  }
  return `\
  {
    "integrity": "**leave this alone**",
    ${
      overrides.missingStripPrefix
        ? ''
        : `"strip_prefix": "${
            overrides.stripPrefix !== undefined
              ? overrides.stripPrefix
              : '{REPO}-{VERSION}'
          }",`
    }
    ${
      overrides.missingUrl
        ? ''
        : `"url": "${
            overrides.url ||
            'https://github.com/{OWNER}/{REPO}/archive/refs/tags/{TAG}.tar.gz'
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
    yankedVersions?: Record<string, string>;
    homepage?: string;
    malformed?: boolean;
    missingVersions?: boolean;
    missingMaintainerGitHubId?: boolean;
  } = {}
): string {
  if (options.malformed) {
    return `{"foo":`;
  }
  const maintainers = [
    {
      email: 'json@bearded.ca',
      github: 'foo-user',
      name: 'Json Bearded',
      ...(!options.missingMaintainerGitHubId
        ? {
            github_user_id: 1234,
          }
        : {}),
    },
  ];
  return `\
    {
      "homepage": "${options.homepage || 'https://docs.aspect.dev/bazel-lib'}",
      "maintainers": ${JSON.stringify(maintainers)},
      ${
        options.missingVersions
          ? ''
          : `"versions": ${JSON.stringify(options.versions || [])},`
      }
      "yanked_versions": ${JSON.stringify(options.yankedVersions || {})}
    }
  `;
}

export function fakeConfigFile(
  options: {
    fixedReleaser?: FixedReleaser;
    invalidFixedReleaser?: boolean;
    content?: string;
  } = {}
) {
  if (options.content) {
    return options.content;
  }
  if (options.invalidFixedReleaser) {
    return `\
fixedReleaser: foobar
`;
  }
  return `\
${
  options.fixedReleaser
    ? `fixedReleaser: ${JSON.stringify(options.fixedReleaser)}`
    : ''
}
`;
}

export function fakeAttestationsFile(
  options: {
    content?: string;
  } = {}
): string {
  if (options.content) {
    return options.content;
  }
  return `\
{
  "types": ["https://slsa.dev/provenance/v1"],
  "attestations": {
    "source.json": {
      "url": "https://github.com/{OWNER}/{REPO}/releases/download/{TAG}/source.json.intoto.jsonl",
      "integrity": ""
    },
    "MODULE.bazel": {
      "url": "https://github.com/{OWNER}/{REPO}/releases/download/{TAG}/MODULE.bazel.intoto.jsonl",
      "integrity": ""
    },
    "{REPO}-{TAG}.tar.gz.intoto.jsonl": {
      "url": "https://github.com/{OWNER}/{REPO}/releases/download/{TAG}/{REPO}-{TAG}.tar.gz.intoto.jsonl",
      "integrity": ""
    }
  }
}
`;
}
