import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import axios from "axios";
import axiosRetry from "axios-retry";
import extractZip from "extract-zip";
import { mocked } from "jest-mock";
import fs, { WriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import tar from "tar";
import { fakeModuleFile } from "../test/mock-template-files";
import { expectThrownError } from "../test/util";
import {
  ArchiveDownloadError,
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

beforeEach(() => {
  jest.clearAllMocks();

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
});

describe("fetch", () => {
  test("downloads the archive", async () => {
    await ReleaseArchive.fetch(RELEASE_ARCHIVE_URL, STRIP_PREFIX);

    expect(axios.get).toHaveBeenCalledWith(RELEASE_ARCHIVE_URL, {
      responseType: "stream",
    });
  });

  test("retries the request if it fails", async () => {
    await ReleaseArchive.fetch(RELEASE_ARCHIVE_URL, STRIP_PREFIX);

    expect(axiosRetry).toHaveBeenCalledWith(axios, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
    });
  });

  test("saves the archive to disk", async () => {
    await ReleaseArchive.fetch(RELEASE_ARCHIVE_URL, STRIP_PREFIX);

    const expectedPath = path.join(TEMP_DIR, "rules-foo-v1.2.3.tar.gz");
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

    const expectedPath = path.join(TEMP_DIR, "rules-foo-v1.2.3.tar.gz");
    expect(releaseArchive.diskPath).toEqual(expectedPath);
  });

  test("throws on a non 200 status", async () => {
    mocked(axios.get).mockReturnValue(
      Promise.resolve({
        data: {
          pipe: jest.fn(),
        },
        status: 404,
      })
    );

    const thrownError = await expectThrownError(
      () => ReleaseArchive.fetch(RELEASE_ARCHIVE_URL, STRIP_PREFIX),
      ArchiveDownloadError
    );

    expect(thrownError.message.includes(RELEASE_ARCHIVE_URL)).toEqual(true);
    expect(thrownError.message.includes("404")).toEqual(true);
  });
});

describe("extractModuleFile", () => {
  test("complains when it encounters an unsupported archive format", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      "https://foo.bar/rules-foo-v1.2.3.deb",
      STRIP_PREFIX
    );

    const thrownError = await expectThrownError(
      () => releaseArchive.extractModuleFile("."),
      UnsupportedArchiveFormat
    );
    expect(thrownError.message.includes("deb")).toEqual(true);
  });

  test("extracts contents next to the tarball archive", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      "https://foo.bar/rules-foo-v1.2.3.tar.gz",
      STRIP_PREFIX
    );
    await releaseArchive.extractModuleFile(".");

    expect(tar.x).toHaveBeenCalledWith({
      cwd: path.dirname(releaseArchive.diskPath),
      file: releaseArchive.diskPath,
      strip: 1,
    });
  });

  test("extracts a tarball when the strip_prefix is empty", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      "https://foo.bar/rules-foo-v1.2.3.tar.gz",
      ""
    );
    await releaseArchive.extractModuleFile(".");

    expect(tar.x).toHaveBeenCalledWith({
      cwd: path.dirname(releaseArchive.diskPath),
      file: releaseArchive.diskPath,
      strip: 0,
    });
  });

  test("extracts the full zip archive next to the zip archive", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      "https://foo.bar/rules-foo-v1.2.3.zip",
      STRIP_PREFIX
    );
    await releaseArchive.extractModuleFile(".");

    expect(extractZip).toHaveBeenCalledWith(releaseArchive.diskPath, {
      dir: path.dirname(releaseArchive.diskPath),
    });
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      path.join(
        path.dirname(releaseArchive.diskPath),
        STRIP_PREFIX,
        "MODULE.bazel"
      ),
      path.join(path.dirname(releaseArchive.diskPath), "MODULE.bazel")
    );
  });

  test("loads the extracted MODULE.bazel file", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      RELEASE_ARCHIVE_URL,
      STRIP_PREFIX
    );
    await releaseArchive.extractModuleFile(".");

    const expectedPath = path.join(
      path.dirname(releaseArchive.diskPath),
      "MODULE.bazel"
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, "utf8");
  });

  test("loads an extracted MODULE.bazel file in a different module root", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      RELEASE_ARCHIVE_URL,
      STRIP_PREFIX
    );
    await releaseArchive.extractModuleFile("sub/dir");

    const expectedPath = path.join(
      path.dirname(releaseArchive.diskPath),
      "sub",
      "dir",
      "MODULE.bazel"
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, "utf8");
  });

  test("returns a module file representation", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      RELEASE_ARCHIVE_URL,
      STRIP_PREFIX
    );
    const moduleFile = await releaseArchive.extractModuleFile(".");

    expect(moduleFile.moduleName).toEqual("rules_foo");
    expect(moduleFile.version).toEqual("1.2.3");
  });
});
