import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import extractZip from "extract-zip";
import { mocked } from "jest-mock";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import tar from "tar";
import { fakeModuleFile } from "../test/mock-template-files";
import { expectThrownError } from "../test/util";
import { ReleaseArchive, UnsupportedArchiveFormat } from "./release-archive";

jest.mock("node:fs");
jest.mock("node:https");
jest.mock("node:os");
jest.mock("tar");
jest.mock("extract-zip");

const RELEASE_ARCHIVE_URL = "https://foo.bar/rules-foo-v1.2.3.tar.gz";
const STRIP_PREFIX = "rules-foo";
const TEMP_DIR = "/tmp";

beforeEach(() => {
  jest.clearAllMocks();

  mocked(https.get).mockImplementation(((
    url: string,
    fn: (...args: any[]) => {}
  ) => {
    fn({ statusCode: 200, pipe: jest.fn() });
    return {
      on: jest.fn(),
    };
  }) as any);

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

    expect(https.get).toHaveBeenCalledWith(
      RELEASE_ARCHIVE_URL,
      expect.any(Function)
    );
  });

  test("saves the archive to disk", async () => {
    await ReleaseArchive.fetch(RELEASE_ARCHIVE_URL, STRIP_PREFIX);

    const expectedPath = path.join(TEMP_DIR, "rules-foo-v1.2.3.tar.gz");
    expect(fs.createWriteStream).toHaveBeenCalledWith(expectedPath, {
      flags: "w",
    });
  });

  test("returns a ReleaseArchive with the correct diskPath", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      RELEASE_ARCHIVE_URL,
      STRIP_PREFIX
    );

    const expectedPath = path.join(TEMP_DIR, "rules-foo-v1.2.3.tar.gz");
    expect(releaseArchive.diskPath).toEqual(expectedPath);
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

  test("extracts MODULE.bazel file next to the tarball archive", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      "https://foo.bar/rules-foo-v1.2.3.tar.gz",
      STRIP_PREFIX
    );
    await releaseArchive.extractModuleFile();

    expect(tar.x).toHaveBeenCalledWith(
      {
        cwd: path.dirname(releaseArchive.diskPath),
        file: releaseArchive.diskPath,
        strip: 1,
      },
      [path.posix.join(STRIP_PREFIX, "MODULE.bazel")]
    );
  });

  test("extracts the full zip archive next to the zip archive", async () => {
    const releaseArchive = await ReleaseArchive.fetch(
      "https://foo.bar/rules-foo-v1.2.3.zip",
      STRIP_PREFIX
    );
    await releaseArchive.extractModuleFile();

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
    await releaseArchive.extractModuleFile();

    const expectedPath = path.join(
      path.dirname(releaseArchive.diskPath),
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
});
