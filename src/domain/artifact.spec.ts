import { randomUUID } from 'node:crypto';
import fs, { WriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import axios from 'axios';
import axiosRetry from 'axios-retry';
import { mocked } from 'jest-mock';

import { expectThrownError } from '../test/util';
import { Artifact, ArtifactDownloadError, DownloadOptions } from './artifact';
import { computeIntegrityHash } from './integrity-hash';

jest.mock('node:fs');
jest.mock('node:os');
jest.mock('axios');
jest.mock('axios-retry');
jest.mock('./integrity-hash');

const ARTIFACT_URL = 'https://foo.bar/artifact.baz';
const TEMP_DIR = '/tmp';
const TEMP_FOLDER = 'artifact-1234';

beforeEach(() => {
  mocked(axios.get).mockReturnValue(
    Promise.resolve({
      data: {
        pipe: jest.fn(),
      },
      status: 200,
    })
  );

  mocked(fs.createWriteStream).mockReturnValue({
    on: jest.fn((event: string, func: (...args: any[]) => unknown) => {
      if (event === 'finish') {
        func();
      }
    }),
  } as any);

  mocked(os.tmpdir).mockReturnValue(TEMP_DIR);
  mocked(fs.mkdtempSync).mockReturnValue(path.join(TEMP_DIR, TEMP_FOLDER));
  mocked(computeIntegrityHash).mockReturnValue(`sha256-${randomUUID()}`);
});

describe('Artifact', () => {
  const options: DownloadOptions = {
    backoffDelayFactor: 2000,
  };

  describe('download', () => {
    test('downloads the artifact', async () => {
      const artifact = new Artifact(ARTIFACT_URL);
      await artifact.download(options);

      expect(axios.get).toHaveBeenCalledWith(ARTIFACT_URL, {
        responseType: 'stream',
      });
    });

    test('retries the request if it fails', async () => {
      const artifact = new Artifact(ARTIFACT_URL);

      // Restore the original behavior of exponentialDelay.
      mocked(axiosRetry.exponentialDelay).mockImplementation(
        jest.requireActual('axios-retry').exponentialDelay
      );

      await artifact.download(options);

      expect(axiosRetry).toHaveBeenCalledWith(axios, {
        retries: 3,
        onRetry: expect.any(Function),
        retryCondition: expect.matchesPredicate(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
          (retryConditionFn: Function) => {
            // Make sure HTTP 404 errors are retried.
            const notFoundError = { response: { status: 404 } };
            return retryConditionFn.call(this, notFoundError);
          }
        ),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        retryDelay: expect.matchesPredicate((retryDelayFn: Function) => {
          // Make sure the retry delays follow exponential backoff
          // Axios randomly adds an extra 0-20% of jitter to each delay:
          // https://github.com/softonic/axios-retry/blob/3f9557920b816ec4f692870d89939ae739d7f8ed/src/index.ts#L169
          const firstRetryDelay = retryDelayFn.call(this, 0);
          const secondRetryDelay = retryDelayFn.call(this, 1);
          const thirdRetryDelay = retryDelayFn.call(this, 2);
          return (
            2 ** 0 * options.backoffDelayFactor <= firstRetryDelay &&
            firstRetryDelay <= 2 ** 0 * 1.2 * options.backoffDelayFactor &&
            2 ** 1 * options.backoffDelayFactor <= secondRetryDelay &&
            secondRetryDelay <= 2 ** 1 * 1.2 * options.backoffDelayFactor &&
            2 ** 2 * options.backoffDelayFactor <= thirdRetryDelay &&
            thirdRetryDelay <= 2 ** 2 * 1.2 * options.backoffDelayFactor
          );
        }),
        shouldResetTimeout: true,
      });
    });

    test('saves the artifact to disk', async () => {
      const artifact = new Artifact(ARTIFACT_URL);

      await artifact.download(options);

      const expectedPath = path.join(TEMP_DIR, TEMP_FOLDER, 'artifact.baz');
      expect(fs.createWriteStream).toHaveBeenCalledWith(expectedPath, {
        flags: 'w',
      });

      const mockedAxiosResponse = await (mocked(axios.get).mock.results[0]
        .value as Promise<{ data: { pipe: Function } }>); // eslint-disable-line @typescript-eslint/no-unsafe-function-type
      const mockedWriteStream = mocked(fs.createWriteStream).mock.results[0]
        .value as WriteStream;

      expect(mockedAxiosResponse.data.pipe).toHaveBeenCalledWith(
        mockedWriteStream
      );
    });

    test('sets the diskPath', async () => {
      const artifact = new Artifact(ARTIFACT_URL);

      await artifact.download(options);

      const expectedPath = path.join(TEMP_DIR, TEMP_FOLDER, 'artifact.baz');
      expect(artifact.diskPath).toEqual(expectedPath);
    });

    test('throws on a non 200 status', async () => {
      const artifact = new Artifact(ARTIFACT_URL);

      mocked(axios.get).mockRejectedValue({
        response: {
          status: 401,
        },
      });

      const thrownError = await expectThrownError(
        () => artifact.download(options),
        ArtifactDownloadError
      );

      expect(thrownError.message.includes(ARTIFACT_URL)).toEqual(true);
      expect(thrownError.message.includes('401')).toEqual(true);
    });
  });

  describe('computeIntegrityHash', () => {
    test('throws when artifact has not yet been downloaded', () => {
      const artifact = new Artifact(ARTIFACT_URL);

      expect(() => artifact.computeIntegrityHash()).toThrowWithMessage(
        Error,
        `The artifact ${ARTIFACT_URL} must be downloaded before an integrity hash can be calculated`
      );
    });

    test('computes the integrity of the file', async () => {
      const artifact = new Artifact(ARTIFACT_URL);
      await artifact.download(options);

      const expected = `sha256-${randomUUID()}`;
      mocked(computeIntegrityHash).mockReturnValue(expected);

      const actual = await artifact.computeIntegrityHash();

      expect(expected).toEqual(actual);
      expect(computeIntegrityHash).toHaveBeenCalledWith(artifact.diskPath);
    });
  });

  describe('cleanup', () => {
    test('removed the stored file', async () => {
      const artifact = new Artifact(ARTIFACT_URL);
      await artifact.download(options);
      const diskPath = artifact.diskPath;
      artifact.cleanup();

      expect(fs.rmSync).toHaveBeenCalledWith(diskPath, { force: true });
    });

    test('removes the diskPath', async () => {
      const artifact = new Artifact(ARTIFACT_URL);
      await artifact.download(options);
      artifact.cleanup();

      expect(() => artifact.diskPath).toThrowWithMessage(
        Error,
        `The artifact ${ARTIFACT_URL} has not been downloaded yet`
      );
    });
  });
});
