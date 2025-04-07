import 'jest-extended';

import fs from 'node:fs';

import { mocked } from 'jest-mock';

import { Artifact, ArtifactDownloadError, DownloadOptions } from './artifact';
import {
  AttestationDownloadError,
  AttestationsTemplate,
  AttestationsTemplateError,
  UnsubstitutedAttestationVarsError,
} from './attestations-template';
import { SubstitutableVar } from './substitution';

jest.mock('node:fs');
jest.mock('./artifact');

const ATTESTATIONS_TEMPLATE_PATH = 'attestations.json';
const VALID_ATTESTATIONS_TEMPLATE = `\
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
describe('AttestationsTemplate', () => {
  beforeEach(() => {
    mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
      return path === ATTESTATIONS_TEMPLATE_PATH;
    });
    mocked(fs.readFileSync).mockImplementation(((path: fs.PathLike) => {
      if (path === ATTESTATIONS_TEMPLATE_PATH) {
        return VALID_ATTESTATIONS_TEMPLATE;
      }
      throw new Error(`Unmocked file ${path}`);
    }) as any);
  });

  describe('tryLoad', () => {
    test('returns null if the file does not exist', () => {
      expect(
        AttestationsTemplate.tryLoad(
          '/some/nonexistent/path/attestations.template.json'
        )
      ).toBeNull();
    });

    test('returns an AttestationsTemplate if the file exists and is valid', () => {
      const template = AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH);
      expect(template instanceof AttestationsTemplate).toBe(true);
    });

    test('throws when file contains invalid JSON', () => {
      mocked(fs.readFileSync).mockReturnValue(`\
{
  "types": ["https://slsa.dev/provenance/v1"],
  "attestations": {
    "source.json": {
      "url": "https://github.com/{OWNER}/{REPO}/releases/download/{TAG}/source.json.intoto.jsonl",
      "integrity": ""
    },
  }
`);
      expect(() =>
        AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH)
      ).toThrowWithMessage(
        AttestationsTemplateError,
        'Expected double-quoted property name in JSON at position 220'
      );
    });

    test('throws when file missing attestations field', () => {
      mocked(fs.readFileSync).mockReturnValue(`\
{
  "types": ["https://slsa.dev/provenance/v1"]
}
`);
      expect(() =>
        AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH)
      ).toThrowWithMessage(
        AttestationsTemplateError,
        'missing attestations field'
      );
    });

    test('throws when attestations field is not an object', () => {
      mocked(fs.readFileSync).mockReturnValue(`\
{
  "types": ["https://slsa.dev/provenance/v1"],
  "attestations": [
    {"source.json": {
      "url": "https://github.com/{OWNER}/{REPO}/releases/download/{TAG}/source.json.intoto.jsonl",
      "integrity": ""
    }}
  ]
}
`);
      expect(() =>
        AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH)
      ).toThrowWithMessage(
        AttestationsTemplateError,
        'invalid attestations field'
      );
    });

    test('throws when an attestation is not an object', () => {
      mocked(fs.readFileSync).mockReturnValue(`\
{
  "types": ["https://slsa.dev/provenance/v1"],
  "attestations": {
    "source.json": [{
      "url": "https://github.com/{OWNER}/{REPO}/releases/download/{TAG}/source.json.intoto.jsonl",
      "integrity": ""
    }]
  }
}
`);
      expect(() =>
        AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH)
      ).toThrowWithMessage(
        AttestationsTemplateError,
        'invalid attestation with key source.json'
      );
    });

    test('throws when an attestation is missing the url', () => {
      mocked(fs.readFileSync).mockReturnValue(`\
{
  "types": ["https://slsa.dev/provenance/v1"],
  "attestations": {
    "source.json": {
      "integrity": ""
    }
  }
}
`);
      expect(() =>
        AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH)
      ).toThrowWithMessage(
        AttestationsTemplateError,
        'attestation with key source.json is missing url'
      );
    });

    test('throws when an attestation url is not a string', () => {
      mocked(fs.readFileSync).mockReturnValue(`\
{
  "types": ["https://slsa.dev/provenance/v1"],
  "attestations": {
    "source.json": {
      "url": 123,
      "integrity": ""
    }
  }
}
`);
      expect(() =>
        AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH)
      ).toThrowWithMessage(
        AttestationsTemplateError,
        'attestation with key source.json has invalid url'
      );
    });
  });

  describe('substitute', () => {
    test('substitutes an attestation url', () => {
      const template = AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH);
      template.substitute({
        OWNER: 'foo',
        REPO: 'bar',
        TAG: 'v1.0.0',
      });
      template.save('attestations.json');

      const written = mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(JSON.parse(written).attestations['source.json'].url).toEqual(
        'https://github.com/foo/bar/releases/download/v1.0.0/source.json.intoto.jsonl'
      );
    });

    test('substitutes an attestation key', () => {
      const template = AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH);
      template.substitute({
        OWNER: 'foo',
        REPO: 'bar',
        TAG: 'v1.0.0',
      });
      template.save('attestations.json');

      const written = mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(
        'bar-v1.0.0.tar.gz.intoto.jsonl' in JSON.parse(written).attestations
      ).toBe(true);
    });
  });

  describe('validateFullySubstituted', () => {
    test('succeeds when fully substituted', () => {
      const template = AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH);
      template.substitute({
        OWNER: 'foo',
        REPO: 'bar',
        TAG: 'v1.0.0',
      });
      expect(() => template.validateFullySubstituted()).not.toThrow();
    });

    test('fails when not fully substituted', () => {
      const template = AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH);
      template.substitute({
        OWNER: 'foo',
        // REPO: "bar",
        TAG: 'v1.0.0',
      });

      let thrownError: any;
      try {
        template.validateFullySubstituted();
        expect.fail('Expected to throw');
      } catch (e) {
        thrownError = e;
      }

      expect(thrownError instanceof UnsubstitutedAttestationVarsError);
      const unsubbedVars = (thrownError as UnsubstitutedAttestationVarsError)
        .unsubstituted;
      expect(unsubbedVars.size).toEqual(1);
      expect(unsubbedVars.has(SubstitutableVar.REPO)).toBe(true);
    });
  });

  describe('computeIntegrityHashes', () => {
    const options: DownloadOptions = {
      backoffDelayFactor: 2000,
    };

    test('downloads each attestation', async () => {
      const template = AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH);
      template.substitute({
        OWNER: 'foo',
        REPO: 'bar',
        TAG: 'v1.0.0',
      });
      await template.computeIntegrityHashes(options);

      const artifacts = mocked(Artifact).mock.instances;
      expect(artifacts.length).toEqual(3);

      const a1 = artifacts.find(
        (_, i) =>
          mocked(Artifact).mock.calls[i][0] ===
          'https://github.com/foo/bar/releases/download/v1.0.0/source.json.intoto.jsonl'
      )!;
      const a2 = artifacts.find(
        (_, i) =>
          mocked(Artifact).mock.calls[i][0] ===
          'https://github.com/foo/bar/releases/download/v1.0.0/MODULE.bazel.intoto.jsonl'
      )!;
      const a3 = artifacts.find(
        (_, i) =>
          mocked(Artifact).mock.calls[i][0] ===
          'https://github.com/foo/bar/releases/download/v1.0.0/bar-v1.0.0.tar.gz.intoto.jsonl'
      )!;

      expect([a1, a2, a3].every((a) => a !== undefined)).toBe(true);

      expect(a1.download).toHaveBeenCalled();
      expect(a2.download).toHaveBeenCalled();
      expect(a3.download).toHaveBeenCalled();
    });

    test('fills out the correct integrity hashes', async () => {
      jest
        .spyOn(Artifact.prototype, 'computeIntegrityHash')
        .mockImplementation(function () {
          const index = mocked(Artifact).mock.instances.indexOf(this);
          const url = mocked(Artifact).mock.calls[index][0];

          if (
            url ===
            'https://github.com/foo/bar/releases/download/v1.0.0/source.json.intoto.jsonl'
          ) {
            return 'sha256-source';
          } else if (
            url ===
            'https://github.com/foo/bar/releases/download/v1.0.0/MODULE.bazel.intoto.jsonl'
          ) {
            return 'sha256-module';
          } else if (
            url ===
            'https://github.com/foo/bar/releases/download/v1.0.0/bar-v1.0.0.tar.gz.intoto.jsonl'
          ) {
            return 'sha256-archive';
          }

          throw new Error('Unexpected archive');
        });

      const template = AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH);
      template.substitute({
        OWNER: 'foo',
        REPO: 'bar',
        TAG: 'v1.0.0',
      });
      await template.computeIntegrityHashes(options);

      const artifacts = mocked(Artifact).mock.instances;
      expect(artifacts.length).toEqual(3);

      template.save('attestations.json');
      const written = JSON.parse(
        mocked(fs.writeFileSync).mock.calls[0][1] as string
      );

      expect(written.attestations['source.json'].integrity).toEqual(
        'sha256-source'
      );
      expect(written.attestations['MODULE.bazel'].integrity).toEqual(
        'sha256-module'
      );
      expect(
        written.attestations['bar-v1.0.0.tar.gz.intoto.jsonl'].integrity
      ).toEqual('sha256-archive');
    });

    test('throws when an attestation fails to download', async () => {
      jest
        .spyOn(Artifact.prototype, 'download')
        .mockRejectedValue(
          new ArtifactDownloadError('https://foo/bar/artifact.baz', 404)
        );

      const template = AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH);
      template.substitute({
        OWNER: 'foo',
        REPO: 'bar',
        TAG: 'v1.0.0',
      });

      await expect(template.computeIntegrityHashes(options)).rejects.toThrow(
        AttestationDownloadError
      );
    });
  });

  describe('save', () => {
    test('saves the template to disk', () => {
      const template = AttestationsTemplate.tryLoad(ATTESTATIONS_TEMPLATE_PATH);
      template.save('attestations.json');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'attestations.json',
        expect.any(String),
        'utf8'
      );
      const written = JSON.parse(
        mocked(fs.writeFileSync).mock.calls[0][1] as string
      );
      expect(written).toEqual(
        JSON.parse(fs.readFileSync(ATTESTATIONS_TEMPLATE_PATH, 'utf8'))
      );
    });
  });
});
