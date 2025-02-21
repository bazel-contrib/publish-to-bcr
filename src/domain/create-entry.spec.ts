import { randomUUID } from 'node:crypto';
import fs, { PathLike } from 'node:fs';
import path from 'node:path';

import { createTwoFilesPatch } from 'diff';
import { Mocked, mocked } from 'jest-mock';

import { GitClient } from '../infrastructure/git';
import {
  fakeMetadataFile,
  fakeModuleFile,
  fakePresubmitFile,
  fakeSourceFile,
} from '../test/mock-template-files';
import { expectThrownError } from '../test/util';
import { Artifact } from './artifact';
import {
  CreateEntryService,
  PatchModuleError,
  VersionAlreadyPublishedError,
} from './create-entry';
import { CANONICAL_BCR } from './find-registry-fork';
import { computeIntegrityHash } from './integrity-hash';
import { MetadataFileError } from './metadata-file';
import { ModuleFile } from './module-file';
import { ReleaseArchive } from './release-archive';
import { Repository } from './repository';
import { RulesetRepository } from './ruleset-repository';

let createEntryService: CreateEntryService;
let mockGitClient: Mocked<GitClient>;

jest.mock('../infrastructure/git');
jest.mock('../infrastructure/github');
jest.mock('./integrity-hash');
jest.mock('./release-archive');
jest.mock('./artifact');
jest.mock('node:fs');
jest.mock('exponential-backoff');

const mockedFileReads: Record<string, string> = {};
const EXTRACTED_MODULE_PATH = '/fake/path/to/MODULE.bazel';
let mockReleaseArchive: ReleaseArchive;

beforeEach(() => {
  mocked(fs.readFileSync).mockImplementation(((
    path: string,
    ...args: any[]
  ) => {
    if (path in mockedFileReads) {
      return mockedFileReads[path];
    }
    return (jest.requireActual('node:fs') as any).readFileSync.apply([
      path,
      ...args,
    ]);
  }) as any);

  mocked(fs.readdirSync).mockImplementation(((p: PathLike, _options: any) => {
    return Object.keys(mockedFileReads)
      .filter((f) => path.dirname(f) === p)
      .map((f) => path.basename(f));
  }) as any);

  mocked(fs.existsSync).mockImplementation(((p: string) => {
    if (p in mockedFileReads) {
      return true;
    }
    for (const f of Object.keys(mockedFileReads)) {
      if (path.dirname(f) == p) {
        return true;
      }
    }
    return (jest.requireActual('node:fs') as any).existsSync(path);
  }) as any);

  for (const key of Object.keys(mockedFileReads)) {
    delete mockedFileReads[key];
  }

  mockReleaseArchive = {
    extractModuleFile: jest.fn(async () => {
      return new ModuleFile(EXTRACTED_MODULE_PATH);
    }),
    artifact: {
      computeIntegrityHash: jest.fn().mockReturnValue(`sha256-${randomUUID()}`),
      cleanup: jest.fn(),
    } as Partial<Artifact> as Artifact,
    cleanup: jest.fn(),
  } as Partial<ReleaseArchive> as ReleaseArchive;

  mocked(ReleaseArchive.fetch).mockResolvedValue(mockReleaseArchive);

  mockGitClient = mocked(new GitClient());
  mocked(computeIntegrityHash).mockReturnValue(`sha256-${randomUUID()}`);
  createEntryService = new CreateEntryService();
});

afterEach(() => {
  CANONICAL_BCR.cleanup();
});

describe('createEntryFiles', () => {
  test('creates the required entry files', async () => {
    mockRulesetFiles();

    const tag = 'v1.2.3';
    const version = RulesetRepository.getVersionFromTag(tag);
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;

    await rulesetRepo.shallowCloneAndCheckout(tag);
    await bcrRepo.shallowCloneAndCheckout('main');
    await createEntryService.createEntryFiles(
      rulesetRepo.metadataTemplate('.'),
      rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
      rulesetRepo.presubmitPath('.'),
      rulesetRepo.patchesPath('.'),
      bcrRepo.diskPath,
      version
    );

    const metadataFilePath = path.join(
      bcrRepo.diskPath,
      'modules',
      'fake_ruleset',
      'metadata.json'
    );
    const sourceFilePath = path.join(
      bcrRepo.diskPath,
      'modules',
      'fake_ruleset',
      version,
      'source.json'
    );
    const presubmitFilePath = path.join(
      bcrRepo.diskPath,
      'modules',
      'fake_ruleset',
      version,
      'presubmit.yml'
    );
    const moduleFilePath = path.join(
      bcrRepo.diskPath,
      'modules',
      'fake_ruleset',
      version,
      'MODULE.bazel'
    );

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      metadataFilePath,
      expect.any(String)
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      moduleFilePath,
      expect.any(String)
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      sourceFilePath,
      expect.any(String)
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.any(String),
      presubmitFilePath
    );
  });

  test('returns the module name from the release archive', async () => {
    mockRulesetFiles({ extractedModuleName: 'foomodule' });

    const tag = 'v1.2.3';
    const version = RulesetRepository.getVersionFromTag(tag);
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;

    await rulesetRepo.shallowCloneAndCheckout(tag);
    await bcrRepo.shallowCloneAndCheckout('main');
    const result = await createEntryService.createEntryFiles(
      rulesetRepo.metadataTemplate('.'),
      rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
      rulesetRepo.presubmitPath('.'),
      rulesetRepo.patchesPath('.'),
      bcrRepo.diskPath,
      version
    );

    expect(result.moduleName).toEqual('foomodule');
  });

  test('cleans up the release archive extraction', async () => {
    mockRulesetFiles();

    const tag = 'v1.2.3';
    const version = RulesetRepository.getVersionFromTag(tag);
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;

    await rulesetRepo.shallowCloneAndCheckout(tag);
    await bcrRepo.shallowCloneAndCheckout('main');
    await createEntryService.createEntryFiles(
      rulesetRepo.metadataTemplate('.'),
      rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
      rulesetRepo.presubmitPath('.'),
      rulesetRepo.patchesPath('.'),
      bcrRepo.diskPath,
      version
    );

    expect(mockReleaseArchive.cleanup).toHaveBeenCalled();
  });

  test('creates the required entry files for a different module root', async () => {
    mockRulesetFiles({
      moduleRoot: 'sub/dir',
    });

    const tag = 'v1.2.3';
    const version = RulesetRepository.getVersionFromTag(tag);
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;

    await rulesetRepo.shallowCloneAndCheckout(tag);
    await bcrRepo.shallowCloneAndCheckout('main');
    await createEntryService.createEntryFiles(
      rulesetRepo.metadataTemplate('sub/dir'),
      rulesetRepo.sourceTemplate('sub/dir').substitute({ TAG: tag }),
      rulesetRepo.presubmitPath('sub/dir'),
      rulesetRepo.patchesPath('sub/dir'),
      bcrRepo.diskPath,
      version
    );

    const metadataFilePath = path.join(
      bcrRepo.diskPath,
      'modules',
      'fake_ruleset',
      'metadata.json'
    );
    const sourceFilePath = path.join(
      bcrRepo.diskPath,
      'modules',
      'fake_ruleset',
      version,
      'source.json'
    );
    const presubmitFilePath = path.join(
      bcrRepo.diskPath,
      'modules',
      'fake_ruleset',
      version,
      'presubmit.yml'
    );
    const moduleFilePath = path.join(
      bcrRepo.diskPath,
      'modules',
      'fake_ruleset',
      version,
      'MODULE.bazel'
    );

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      metadataFilePath,
      expect.any(String)
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      moduleFilePath,
      expect.any(String)
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      sourceFilePath,
      expect.any(String)
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.any(String),
      presubmitFilePath
    );
  });

  test('throws when an entry for the version already exists', async () => {
    mockRulesetFiles();

    const tag = 'v1.0.0';
    const version = RulesetRepository.getVersionFromTag(tag);
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;

    await bcrRepo.shallowCloneAndCheckout('main');
    mockBcrMetadataExists(bcrRepo, 'fake_ruleset', true);
    mockBcrMetadataFile(bcrRepo, 'fake_ruleset', {
      versions: [version],
    });

    await rulesetRepo.shallowCloneAndCheckout(tag);

    const thrownError = await expectThrownError(
      () =>
        createEntryService.createEntryFiles(
          rulesetRepo.metadataTemplate('.'),
          rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
          rulesetRepo.presubmitPath('.'),
          rulesetRepo.patchesPath('.'),
          bcrRepo.diskPath,
          version
        ),
      VersionAlreadyPublishedError
    );
    expect(thrownError!.message.includes(version)).toEqual(true);
  });

  describe('metadata.json', () => {
    test("creates a new metadata file if one doesn't exist for the ruleset", async () => {
      mockRulesetFiles();

      const tag = 'v1.2.3';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      await bcrRepo.shallowCloneAndCheckout('main');
      mockBcrMetadataExists(bcrRepo, 'fake_ruleset', false);

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeMetadataCall = mocked(fs.writeFileSync).mock.calls.find(
        (call) => (call[0] as string).includes('metadata.json')
      );
      const writtenMetadataContent = writeMetadataCall[1] as string;
      expect(JSON.parse(fakeMetadataFile({ versions: [version] }))).toEqual(
        JSON.parse(writtenMetadataContent)
      );
    });

    test('adds versions from existing bcr metadata file if one exists', async () => {
      mockRulesetFiles();

      const tag = 'v1.2.3';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      await bcrRepo.shallowCloneAndCheckout('main');
      mockBcrMetadataExists(bcrRepo, 'fake_ruleset', true);
      mockBcrMetadataFile(bcrRepo, 'fake_ruleset', {
        versions: ['1.0.0', '1.1.0'],
      });

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeMetadataCall = mocked(fs.writeFileSync).mock.calls.find(
        (call) => (call[0] as string).includes('metadata.json')
      );
      const writtenMetadataContent = writeMetadataCall[1] as string;
      expect(
        JSON.parse(fakeMetadataFile({ versions: ['1.0.0', '1.1.0', version] }))
      ).toEqual(JSON.parse(writtenMetadataContent));
    });

    test('does not include versions in the template metadata file', async () => {
      // ...because the canonical released versions comes from the BCR
      mockRulesetFiles({ metadataVersions: ['0.0.1'] });

      const tag = 'v1.2.3';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      await bcrRepo.shallowCloneAndCheckout('main');
      mockBcrMetadataExists(bcrRepo, 'fake_ruleset', true);
      mockBcrMetadataFile(bcrRepo, 'fake_ruleset', {
        versions: ['1.0.0'],
      });

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeMetadataCall = mocked(fs.writeFileSync).mock.calls.find(
        (call) => (call[0] as string).includes('metadata.json')
      );
      const writtenMetadataContent = writeMetadataCall[1] as string;
      expect(
        JSON.parse(fakeMetadataFile({ versions: ['1.0.0', version] })) // doesn't have 0.0.1
      ).toEqual(JSON.parse(writtenMetadataContent));
    });

    test('updates bcr metadata file if there were changes to the template', async () => {
      mockRulesetFiles({ metadataHomepage: 'foo.bar.com' });

      const tag = 'v1.2.3';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      await bcrRepo.shallowCloneAndCheckout('main');
      mockBcrMetadataExists(bcrRepo, 'fake_ruleset', true);
      mockBcrMetadataFile(bcrRepo, 'fake_ruleset');

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeMetadataCall = mocked(fs.writeFileSync).mock.calls.find(
        (call) => (call[0] as string).includes('metadata.json')
      );
      const writtenMetadataContent = writeMetadataCall[1] as string;
      expect(JSON.parse(writtenMetadataContent)).toEqual(
        JSON.parse(
          fakeMetadataFile({ versions: [version], homepage: 'foo.bar.com' })
        )
      );
    });

    test("creates a new metadata file when the tag doens't start with a 'v'", async () => {
      mockRulesetFiles();

      const tag = '1.2.3';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      await bcrRepo.shallowCloneAndCheckout('main');
      mockBcrMetadataExists(bcrRepo, 'fake_ruleset', false);

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeMetadataCall = mocked(fs.writeFileSync).mock.calls.find(
        (call) => (call[0] as string).includes('metadata.json')
      );
      const writtenMetadataContent = writeMetadataCall[1] as string;
      expect(JSON.parse(fakeMetadataFile({ versions: [version] }))).toEqual(
        JSON.parse(writtenMetadataContent)
      );
    });

    test('complains when the bcr metadata file cannot be parsed', async () => {
      mockRulesetFiles();

      const tag = 'v1.2.3';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      await bcrRepo.shallowCloneAndCheckout('main');
      mockBcrMetadataExists(bcrRepo, 'fake_ruleset', true);
      mockBcrMetadataFile(bcrRepo, 'fake_ruleset', {
        malformed: true,
      });

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await expectThrownError(
        () =>
          createEntryService.createEntryFiles(
            rulesetRepo.metadataTemplate('.'),
            rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
            rulesetRepo.presubmitPath('.'),
            rulesetRepo.patchesPath('.'),
            bcrRepo.diskPath,
            version
          ),
        MetadataFileError
      );
    });

    test('does not un-yank yanked versions in the bcr', async () => {
      mockRulesetFiles({
        metadataVersions: ['1.0.0'],
        metadataYankedVersions: {},
      });

      const tag = 'v2.0.0';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      await bcrRepo.shallowCloneAndCheckout('main');
      mockBcrMetadataExists(bcrRepo, 'fake_ruleset', true);
      mockBcrMetadataFile(bcrRepo, 'fake_ruleset', {
        versions: ['1.0.0'],
        yankedVersions: { '1.0.0': 'has a bug' },
      });

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeMetadataCall = mocked(fs.writeFileSync).mock.calls.find(
        (call) => (call[0] as string).includes('metadata.json')
      );
      const writtenMetadataContent = writeMetadataCall[1] as string;

      expect(JSON.parse(writtenMetadataContent).yanked_versions).toEqual({
        '1.0.0': 'has a bug',
      });
    });
  });

  describe('MODULE.bazel', () => {
    test('uses the archived module file', async () => {
      const tag = 'v1.2.3';
      const version = RulesetRepository.getVersionFromTag(tag);
      mockRulesetFiles({
        extractedModuleName: 'rules_bar',
        extractedModuleVersion: version,
      });

      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await bcrRepo.shallowCloneAndCheckout('main');
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeModuleCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes('MODULE.bazel')
      );
      const writtenModuleContent = writeModuleCall[1] as string;
      expect(writtenModuleContent).toEqual(
        fakeModuleFile({ moduleName: 'rules_bar', version: version })
      );
    });

    test('overrides the release version when it does not match the archived version', async () => {
      mockRulesetFiles({
        extractedModuleName: 'rules_bar',
        extractedModuleVersion: '1.2.3',
      });

      const tag = 'v4.5.6';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await bcrRepo.shallowCloneAndCheckout('main');
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeModuleCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes('MODULE.bazel')
      );
      const writtenModuleContent = writeModuleCall[1] as string;
      expect(writtenModuleContent).toEqual(
        fakeModuleFile({ moduleName: 'rules_bar', version: version })
      );
    });
  });

  describe('presubmit.yml', () => {
    test('copies the presubmit.yml file', async () => {
      mockRulesetFiles({ extractedModuleName: 'foo_ruleset' });

      const tag = 'v1.2.3';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await bcrRepo.shallowCloneAndCheckout('main');
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        rulesetRepo.presubmitPath('.'),
        path.join(
          bcrRepo.diskPath,
          'modules',
          'foo_ruleset',
          version,
          'presubmit.yml'
        )
      );
    });
  });

  describe('source.json', () => {
    test('stamps an integrity hash', async () => {
      mockRulesetFiles();

      const tag = 'v1.2.3';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      const hash = `sha256-${randomUUID()}`;
      mocked(mockReleaseArchive.artifact.computeIntegrityHash).mockReturnValue(
        hash
      );

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await bcrRepo.shallowCloneAndCheckout('main');
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeSourceCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes('source.json')
      );
      const writtenSourceContent = JSON.parse(writeSourceCall[1] as string);
      expect(writtenSourceContent.integrity).toEqual(hash);
    });

    test('saves with a trailing newline', async () => {
      mockRulesetFiles();

      const tag = 'v1.2.3';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      const hash = `sha256-${randomUUID()}`;
      mocked(mockReleaseArchive.artifact.computeIntegrityHash).mockReturnValue(
        hash
      );

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await bcrRepo.shallowCloneAndCheckout('main');
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeSourceCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes('source.json')
      );
      const writtenSourceContent = writeSourceCall[1] as string;
      expect(writtenSourceContent.endsWith('\n')).toEqual(true);
    });

    test('adds a patch entry when the release version does not match the archived version', async () => {
      mockRulesetFiles({
        extractedModuleName: 'rules_bar',
        extractedModuleVersion: '1.2.3',
      });

      const tag = 'v4.5.6';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      const hash = `sha256-${randomUUID()}`;
      mocked(computeIntegrityHash).mockReturnValue(hash);

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await bcrRepo.shallowCloneAndCheckout('main');
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeSourceCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes('source.json')
      );
      const writtenSourceContent = JSON.parse(writeSourceCall[1] as string);
      expect(
        writtenSourceContent.patches['module_dot_bazel_version.patch']
      ).toEqual(hash);
    });

    test('sets the patch_strip to 1 when a release version patch is added', async () => {
      mockRulesetFiles({
        extractedModuleName: 'rules_bar',
        extractedModuleVersion: '1.2.3',
      });

      const tag = 'v4.5.6';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      const hash = `sha256-${randomUUID()}`;
      mocked(mockReleaseArchive.artifact.computeIntegrityHash).mockReturnValue(
        hash
      );

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await bcrRepo.shallowCloneAndCheckout('main');
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeSourceCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes('source.json')
      );
      const writtenSourceContent = JSON.parse(writeSourceCall[1] as string);
      expect(writtenSourceContent.patch_strip).toEqual(1);
    });

    test('adds a patch entry for each patch in the patches folder', async () => {
      mockRulesetFiles({
        extractedModuleName: 'rules_bar',
        extractedModuleVersion: '1.2.3',
        patches: {
          'patch1.patch': randomUUID(),
          'patch2.patch': randomUUID(),
        },
      });

      const tag = 'v1.2.3';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      const hash1 = `sha256-${randomUUID()}`;
      const hash2 = `sha256-${randomUUID()}`;

      mocked(
        mockReleaseArchive.artifact.computeIntegrityHash
      ).mockReturnValueOnce(`sha256-${randomUUID()}`); // release archive
      mocked(computeIntegrityHash).mockReturnValueOnce(hash1);
      mocked(computeIntegrityHash).mockReturnValueOnce(hash2);

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await bcrRepo.shallowCloneAndCheckout('main');
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeSourceCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes('source.json')
      );
      const writtenSourceContent = JSON.parse(writeSourceCall[1] as string);
      expect(writtenSourceContent.patches['patch1.patch']).toEqual(hash1);
      expect(writtenSourceContent.patches['patch2.patch']).toEqual(hash2);
    });

    test('substitutes the module version into the source template', async () => {
      mockRulesetFiles();

      const tag = 'v1.2.3';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      const hash = `sha256-${randomUUID()}`;
      mocked(mockReleaseArchive.artifact.computeIntegrityHash).mockReturnValue(
        hash
      );

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await bcrRepo.shallowCloneAndCheckout('main');
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const writeSourceCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes('source.json')
      );
      const writtenSourceContent = JSON.parse(writeSourceCall[1] as string);
      expect(writtenSourceContent.strip_prefix).toMatch(
        new RegExp(version.replaceAll('.', '\\.'))
      );
    });
  });

  test('sets the patch_strip to 1 when a patch is added', async () => {
    mockRulesetFiles({
      extractedModuleName: 'rules_bar',
      extractedModuleVersion: '1.2.3',
      patches: {
        'patch.patch': randomUUID(),
      },
    });

    const tag = 'v1.2.3';
    const version = RulesetRepository.getVersionFromTag(tag);
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;

    const hash = `sha256-${randomUUID()}`;
    mocked(
      mockReleaseArchive.artifact.computeIntegrityHash
    ).mockReturnValueOnce(`sha256-${randomUUID()}`); // release archive
    mocked(computeIntegrityHash).mockReturnValueOnce(hash);

    await rulesetRepo.shallowCloneAndCheckout(tag);
    await bcrRepo.shallowCloneAndCheckout('main');
    await createEntryService.createEntryFiles(
      rulesetRepo.metadataTemplate('.'),
      rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
      rulesetRepo.presubmitPath('.'),
      rulesetRepo.patchesPath('.'),
      bcrRepo.diskPath,
      version
    );
    const writeSourceCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
      (call[0] as string).includes('source.json')
    );
    const writtenSourceContent = JSON.parse(writeSourceCall[1] as string);
    expect(writtenSourceContent.patch_strip).toEqual(1);
  });

  describe('patches', () => {
    test('creates a patch file when the release version does not match the archived version', async () => {
      mockRulesetFiles({
        extractedModuleName: 'rules_bar',
        extractedModuleVersion: '1.2.3',
      });

      const tag = 'v4.5.6';
      const version = RulesetRepository.getVersionFromTag(tag);
      const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
      const bcrRepo = CANONICAL_BCR;

      await rulesetRepo.shallowCloneAndCheckout(tag);
      await bcrRepo.shallowCloneAndCheckout('main');
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
      const expectedPatchPath = path.join(
        bcrRepo.diskPath,
        'modules',
        'rules_bar',
        version,
        'patches',
        'module_dot_bazel_version.patch'
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expectedPatchPath,
        expect.any(String)
      );
      const writePatchCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes('module_dot_bazel_version.patch')
      );
      const writtenPatchContent = writePatchCall[1] as string;
      expect(
        writtenPatchContent.includes(`\
--- a/MODULE.bazel
+++ b/MODULE.bazel
@@ -1,5 +1,5 @@
 module(
   name = "rules_bar",
   compatibility_level = 1,
-  version = "1.2.3",
+  version = "${version}",
 )`)
      ).toEqual(true);
    });
  });

  test('includes patches in the patches folder', async () => {
    mockRulesetFiles({
      extractedModuleName: 'rules_bar',
      extractedModuleVersion: '1.2.3',
      patches: {
        'my_patch.patch': randomUUID(),
      },
    });

    const tag = 'v1.2.3';
    const version = RulesetRepository.getVersionFromTag(tag);
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;

    await rulesetRepo.shallowCloneAndCheckout(tag);
    await bcrRepo.shallowCloneAndCheckout('main');
    await createEntryService.createEntryFiles(
      rulesetRepo.metadataTemplate('.'),
      rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
      rulesetRepo.presubmitPath('.'),
      rulesetRepo.patchesPath('.'),
      bcrRepo.diskPath,
      version
    );
    const expectedPatchPath = path.join(
      bcrRepo.diskPath,
      'modules',
      'rules_bar',
      version,
      'patches',
      'my_patch.patch'
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      path.join(rulesetRepo.patchesPath('.'), 'my_patch.patch'),
      expectedPatchPath
    );
  });

  test('includes patches in a different module root', async () => {
    const tag = 'v1.2.3';
    const version = RulesetRepository.getVersionFromTag(tag);

    mockRulesetFiles({
      extractedModuleName: 'rules_bar',
      extractedModuleVersion: version,
      patches: {
        'submodule.patch': randomUUID(),
      },
      moduleRoot: 'submodule',
    });

    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;

    await rulesetRepo.shallowCloneAndCheckout(tag);
    await bcrRepo.shallowCloneAndCheckout('main');
    await createEntryService.createEntryFiles(
      rulesetRepo.metadataTemplate('submodule'),
      rulesetRepo.sourceTemplate('submodule').substitute({ TAG: tag }),
      rulesetRepo.presubmitPath('submodule'),
      rulesetRepo.patchesPath('submodule'),
      bcrRepo.diskPath,
      version
    );
    const expectedPatchPath = path.join(
      bcrRepo.diskPath,
      'modules',
      'rules_bar',
      version,
      'patches',
      'submodule.patch'
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      path.join(rulesetRepo.patchesPath('submodule'), 'submodule.patch'),
      expectedPatchPath
    );
  });

  test("applies a patch to the entry's MODULE.bazel file", async () => {
    const tag = 'v1.2.3';
    const version = RulesetRepository.getVersionFromTag(tag);

    const extractedModule = fakeModuleFile({
      version,
      moduleName: 'rules_bar',
      deps: false,
    });

    const exptectedPatchedModule = fakeModuleFile({
      version,
      moduleName: 'rules_bar',
      deps: true,
    });

    const patch = createTwoFilesPatch(
      'a/MODULE.bazel',
      'b/MODULE.bazel',
      extractedModule,
      exptectedPatchedModule
    );

    mockRulesetFiles({
      extractedModuleContent: extractedModule,
      patches: {
        'patch_deps.patch': patch,
      },
    });

    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;

    await rulesetRepo.shallowCloneAndCheckout(tag);
    await bcrRepo.shallowCloneAndCheckout('main');
    await createEntryService.createEntryFiles(
      rulesetRepo.metadataTemplate('.'),
      rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
      rulesetRepo.presubmitPath('.'),
      rulesetRepo.patchesPath('.'),
      bcrRepo.diskPath,
      version
    );
    const moduleFilePath = path.join(
      bcrRepo.diskPath,
      'modules',
      'rules_bar',
      version,
      'MODULE.bazel'
    );

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      moduleFilePath,
      exptectedPatchedModule
    );
  });

  test('throws when a patch that alters MODULE.bazel cannot be applied', async () => {
    const tag = 'v1.2.3';
    const version = RulesetRepository.getVersionFromTag(tag);

    const patchFrom = fakeModuleFile({
      version: '1.0.0',
      moduleName: 'rules_bar',
      deps: false,
    });

    const patchTo = fakeModuleFile({
      version,
      moduleName: 'rules_bar',
      deps: true,
    });

    const badPatch = createTwoFilesPatch(
      'a/MODULE.bazel',
      'b/MODULE.bazel',
      patchFrom,
      patchTo
    );

    mockRulesetFiles({
      // Different from the patch origin
      extractedModuleContent: fakeModuleFile({
        version,
        moduleName: 'rules_bar',
        deps: false,
      }),
      patches: {
        'patch_deps.patch': badPatch,
      },
    });

    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;

    await rulesetRepo.shallowCloneAndCheckout(tag);
    await bcrRepo.shallowCloneAndCheckout('main');
    let caughtError: any;
    try {
      await createEntryService.createEntryFiles(
        rulesetRepo.metadataTemplate('.'),
        rulesetRepo.sourceTemplate('.').substitute({ TAG: tag }),
        rulesetRepo.presubmitPath('.'),
        rulesetRepo.patchesPath('.'),
        bcrRepo.diskPath,
        version
      );
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError instanceof PatchModuleError);
    const patchPath = path.join(
      rulesetRepo.diskPath,
      RulesetRepository.BCR_TEMPLATE_DIR,
      'patches',
      'patch_deps.patch'
    );
    expect((caughtError as Error).message).toEqual(
      expect.stringContaining(patchPath)
    );
  });
});

export function mockRulesetFiles(
  options: {
    extractedModuleContent?: string;
    extractedModuleName?: string;
    extractedModuleVersion?: string;
    metadataHomepage?: string;
    metadataVersions?: string[];
    metadataYankedVersions?: Record<string, string>;
    sourceUrl?: string;
    sourceStripPrefix?: string;
    moduleRoot?: string;
    patches?: Record<string, string>;
  } = {}
) {
  mockGitClient.shallowClone.mockImplementation(
    async (url: string, diskPath: string, _ref?: string) => {
      const moduleRoot = options?.moduleRoot || '.';
      if (options.extractedModuleContent) {
        mockedFileReads[EXTRACTED_MODULE_PATH] = options.extractedModuleContent;
      } else {
        mockedFileReads[EXTRACTED_MODULE_PATH] = fakeModuleFile({
          version: options.extractedModuleVersion || '1.2.3',
          moduleName: options.extractedModuleName,
        });
      }
      const templatesDir = path.join(
        diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR
      );
      mockedFileReads[path.join(templatesDir, 'config.yml')] =
        `moduleRoots: ["${moduleRoot}"]`;
      mockedFileReads[
        path.join(templatesDir, moduleRoot, 'source.template.json')
      ] = fakeSourceFile({
        url: options.sourceUrl,
        stripPrefix: options.sourceStripPrefix,
      });
      mockedFileReads[path.join(templatesDir, moduleRoot, 'presubmit.yml')] =
        fakePresubmitFile();
      mockedFileReads[
        path.join(templatesDir, moduleRoot, 'metadata.template.json')
      ] = fakeMetadataFile({
        versions: options.metadataVersions,
        yankedVersions: options.metadataYankedVersions,
        homepage: options.metadataHomepage,
      });
      if (options.patches) {
        for (const patch of Object.keys(options.patches)) {
          mockedFileReads[
            path.join(templatesDir, moduleRoot, 'patches', patch)
          ] = options.patches[patch];
        }
      }
    }
  );

  mocked(GitClient).mockImplementation(() => {
    return mockGitClient;
  });
}

function mockBcrMetadataExists(
  bcrRepo: Repository,
  moduleName: string,
  exists: boolean
) {
  mocked(fs.existsSync).mockImplementation(((p: string) => {
    if (
      p == path.join(bcrRepo.diskPath, 'modules', moduleName, 'metadata.json')
    ) {
      return exists;
    }
    return (jest.requireActual('node:fs') as any).existsSync(path);
  }) as any);
}

function mockBcrMetadataFile(
  bcrRepo: Repository,
  moduleName: string,
  options?: {
    versions?: string[];
    yankedVersions?: Record<string, string>;
    homepage?: string;
    malformed?: boolean;
  }
) {
  mockedFileReads[
    path.join(bcrRepo.diskPath, 'modules', moduleName, 'metadata.json')
  ] = fakeMetadataFile(options);
}
