import fs from 'node:fs';
import path from 'node:path';
import { parse as parseUrl } from 'node:url';

import { mocked } from 'jest-mock';
import tar from 'tar';

import { fakeModuleFile } from '../test/mock-template-files';
import { expectThrownError } from '../test/util';
import { Artifact, ArtifactDownloadError } from './artifact';
import {
  ArchiveDownloadError,
  MissingModuleFileError,
  ReleaseArchive,
  UnsupportedArchiveFormat,
} from './release-archive';

jest.mock('node:fs');
jest.mock('tar');
jest.mock('extract-zip');
jest.mock('./artifact', () => {
  return {
    Artifact: jest.fn().mockImplementation((url) => {
      mockArtifact.url = url;
      return mockArtifact;
    }),
    ArtifactDownloadError:
      jest.requireActual('./artifact').ArtifactDownloadError,
  };
});

const RELEASE_ARCHIVE_URL = 'https://foo.bar/rules-foo-v1.2.3.tar.gz';
const STRIP_PREFIX = 'rules-foo';

const mockArtifact = {
  url: RELEASE_ARCHIVE_URL,
  download: jest.fn(),
  diskPath: null as string,
};

beforeEach(() => {
  mocked(fs.readFileSync).mockReturnValue(
    fakeModuleFile({ moduleName: 'rules_foo', version: '1.2.3' })
  );

  mocked(fs.existsSync).mockReturnValue(true); // Existence check on MODULE.bazel
  mockArtifact.diskPath = null;
  mockArtifact.url = null;
  mockArtifact.download.mockImplementation(() => {
    (mockArtifact as any).diskPath = path.join(
      '/tmp/artifact-1234',
      path.basename(parseUrl(mockArtifact.url).pathname)
    );
    return Promise.resolve(null);
  });
});

describe('fetch', () => {
  test('downloads the archive', async () => {
    const archive = await ReleaseArchive.fetch(
      RELEASE_ARCHIVE_URL,
      STRIP_PREFIX
    );

    expect(Artifact).toHaveBeenCalledWith(RELEASE_ARCHIVE_URL);
    expect(archive.artifact.download).toHaveBeenCalled();
  });

  test('provides suggestions on a 404 error', async () => {
    mockArtifact.download.mockRejectedValue(
      new ArtifactDownloadError(RELEASE_ARCHIVE_URL, 404)
    );

    const thrownError = await expectThrownError(
      () => ReleaseArchive.fetch(RELEASE_ARCHIVE_URL, STRIP_PREFIX),
      ArchiveDownloadError
    );

    expect(thrownError.message.includes(RELEASE_ARCHIVE_URL)).toEqual(true);
    expect(thrownError.message.includes('404')).toEqual(true);
    expect(thrownError.message.includes('source.template.json')).toEqual(true);
    expect(
      thrownError.message.includes(
        'release archive is uploaded as part of publishing the release'
      )
    ).toEqual(true);
  });
});

describe('extractModuleFile', () => {
  test('complains when it encounters an unsupported archive format', async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      'https://foo.bar/rules-foo-v1.2.3.deb',
      STRIP_PREFIX
    );

    await expect(releaseArchive.extractModuleFile()).rejects.toThrow(
      UnsupportedArchiveFormat
    );
  });

  test('extracts contents next to the tarball archive', async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      'https://foo.bar/rules-foo-v1.2.3.tar.gz',
      STRIP_PREFIX
    );
    await releaseArchive.extractModuleFile();

    expect(tar.x).toHaveBeenCalledWith({
      cwd: path.dirname(releaseArchive.artifact.diskPath),
      file: releaseArchive.artifact.diskPath,
    });
  });

  test('loads the extracted MODULE.bazel file', async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      RELEASE_ARCHIVE_URL,
      STRIP_PREFIX
    );
    await releaseArchive.extractModuleFile();

    const expectedPath = path.join(
      path.dirname(releaseArchive.artifact.diskPath),
      STRIP_PREFIX,
      'MODULE.bazel'
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');
  });

  test('returns a module file representation', async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      RELEASE_ARCHIVE_URL,
      STRIP_PREFIX
    );
    const moduleFile = await releaseArchive.extractModuleFile();

    expect(moduleFile.moduleName).toEqual('rules_foo');
    expect(moduleFile.version).toEqual('1.2.3');
  });

  test('throws when MODULE.bazel cannot be found in the release archive', async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      RELEASE_ARCHIVE_URL,
      STRIP_PREFIX
    );

    mocked(fs.existsSync).mockReturnValue(false);

    await expect(releaseArchive.extractModuleFile()).rejects.toThrow(
      MissingModuleFileError
    );
  });
});
