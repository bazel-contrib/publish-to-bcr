import axios from "axios";
import axiosRetry from "axios-retry";
import { mocked } from "jest-mock";
import fs, { WriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import tar from "tar";
import "../../jest.setup";
import { fakeModuleFile } from "../test/mock-template-files";
import { expectThrownError } from "../test/util";
import {
  ArchiveDownloadError,
  MissingModuleFileError,
  ReleaseArchive,
  UnsupportedArchiveFormat,
} from "./release-archive";

jest.mock("node:fs");
jest.mock("axios");
jest.mock("axios-retry");
jest.mock("node:os");
jest.mock("tar");
jest.mock("extract-zip");

const RELEASE_ARCHIVE_URL = "https://foo.bar/rules-foo-v1.2.3.tar.gz";
const STRIP_PREFIX = "rules-foo";
const TEMP_DIR = "/tmp";
const EXTRACT_DIR = `${TEMP_DIR}/archive-1234`;

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
    on: jest.fn((event: string, func: (...args: any[]) => {}) => {
      if (event === "finish") {
        func();
      }
    }),
  } as any);

  mocked(fs.readFileSync).mockReturnValue(
    fakeModuleFile({ moduleName: "rules_foo", version: "1.2.3" })
  );

  mocked(os.tmpdir).mockReturnValue(TEMP_DIR);
  mocked(fs.mkdtempSync).mockReturnValue(EXTRACT_DIR);

  mocked(fs.existsSync).mockReturnValue(true); // Existence check on MODULE.bazel
});

describe("fetch", () => {
  test("downloads the archive", async () => {
    await ReleaseArchive.fetch(RELEASE_ARCHIVE_URL, STRIP_PREFIX);

    expect(axios.get).toHaveBeenCalledWith(RELEASE_ARCHIVE_URL, {
      responseType: "stream",
    });
  });

  test("retries the request if it fails", async () => {
    // Restore the original behavior of exponentialDelay.
    mocked(axiosRetry.exponentialDelay).mockImplementation(
      jest.requireActual("axios-retry").exponentialDelay
    );

    await ReleaseArchive.fetch(RELEASE_ARCHIVE_URL, STRIP_PREFIX);

    expect(axiosRetry).toHaveBeenCalledWith(axios, {
      retries: 3,
      retryCondition: expect.matchesPredicate((retryConditionFn: Function) => {
        // Make sure HTTP 404 errors are retried.
        let notFoundError = { response: { status: 404 } };
        return retryConditionFn.call(this, notFoundError);
      }),
      retryDelay: expect.matchesPredicate((retryDelayFn: Function) => {
        // Make sure the retry delays follow exponential backoff
        // and the final retry happens after at least 1 minute total
        // (in this case, at least 70 seconds).
        // Axios randomly adds an extra 0-20% of jitter to each delay.
        // Test upper bounds as well to ensure the workflow completes reasonably quickly
        // (in this case, no more than 84 seconds total).
        let firstRetryDelay = retryDelayFn.call(this, 0);
        let secondRetryDelay = retryDelayFn.call(this, 1);
        let thirdRetryDelay = retryDelayFn.call(this, 2);
        return (
          10000 <= firstRetryDelay &&
          firstRetryDelay <= 12000 &&
          20000 <= secondRetryDelay &&
          secondRetryDelay <= 24000 &&
          40000 <= thirdRetryDelay &&
          thirdRetryDelay <= 48000
        );
      }),
      shouldResetTimeout: true,
    });
  });

  test("saves the archive to disk", async () => {
    await ReleaseArchive.fetch(RELEASE_ARCHIVE_URL, STRIP_PREFIX);

    const expectedPath = path.join(EXTRACT_DIR, "rules-foo-v1.2.3.tar.gz");
    expect(fs.createWriteStream).toHaveBeenCalledWith(expectedPath, {
      flags: "w",
    });

    const mockedAxiosResponse = await (mocked(axios.get).mock.results[0]
      .value as Promise<{ data: { pipe: Function } }>);
    const mockedWriteStream = mocked(fs.createWriteStream).mock.results[0]
      .value as WriteStream;

    expect(mockedAxiosResponse.data.pipe).toHaveBeenCalledWith(
      mockedWriteStream
    );
  });

  test("returns a ReleaseArchive with the correct diskPath", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      RELEASE_ARCHIVE_URL,
      STRIP_PREFIX
    );

    const expectedPath = path.join(EXTRACT_DIR, "rules-foo-v1.2.3.tar.gz");
    expect(releaseArchive.diskPath).toEqual(expectedPath);
  });

  test("throws on a non 200 status", async () => {
    mocked(axios.get).mockRejectedValue({
      response: {
        status: 401,
      },
    });

    const thrownError = await expectThrownError(
      () => ReleaseArchive.fetch(RELEASE_ARCHIVE_URL, STRIP_PREFIX),
      ArchiveDownloadError
    );

    expect(thrownError.message.includes(RELEASE_ARCHIVE_URL)).toEqual(true);
    expect(thrownError.message.includes("401")).toEqual(true);
  });

  test("provides suggestions on a 404 error", async () => {
    mocked(axios.get).mockRejectedValue({
      response: {
        status: 404,
      },
    });

    const thrownError = await expectThrownError(
      () => ReleaseArchive.fetch(RELEASE_ARCHIVE_URL, STRIP_PREFIX),
      ArchiveDownloadError
    );

    expect(thrownError.message.includes(RELEASE_ARCHIVE_URL)).toEqual(true);
    expect(thrownError.message.includes("404")).toEqual(true);
    expect(thrownError.message.includes("source.template.json")).toEqual(true);
    expect(
      thrownError.message.includes(
        "release archive is uploaded as part of publishing the release"
      )
    ).toEqual(true);
  });
});

describe("extractModuleFile", () => {
  test("complains when it encounters an unsupported archive format", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      "https://foo.bar/rules-foo-v1.2.3.deb",
      STRIP_PREFIX
    );

    const thrownError = await expectThrownError(
      () => releaseArchive.extractModuleFile(),
      UnsupportedArchiveFormat
    );
    expect(thrownError.message.includes("deb")).toEqual(true);
  });

  test("extracts contents next to the tarball archive", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      "https://foo.bar/rules-foo-v1.2.3.tar.gz",
      STRIP_PREFIX
    );
    await releaseArchive.extractModuleFile();

    expect(tar.x).toHaveBeenCalledWith({
      cwd: path.dirname(releaseArchive.diskPath),
      file: releaseArchive.diskPath,
    });
  });

  test("loads the extracted MODULE.bazel file", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      RELEASE_ARCHIVE_URL,
      STRIP_PREFIX
    );
    await releaseArchive.extractModuleFile();

    const expectedPath = path.join(
      path.dirname(releaseArchive.diskPath),
      STRIP_PREFIX,
      "MODULE.bazel"
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, "utf8");
  });

  test("returns a module file representation", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      RELEASE_ARCHIVE_URL,
      STRIP_PREFIX
    );
    const moduleFile = await releaseArchive.extractModuleFile();

    expect(moduleFile.moduleName).toEqual("rules_foo");
    expect(moduleFile.version).toEqual("1.2.3");
  });

  test("throws when MODULE.bazel cannot be found in the release archive", async () => {
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
