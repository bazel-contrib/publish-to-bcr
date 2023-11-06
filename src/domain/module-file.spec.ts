import { createTwoFilesPatch, parsePatch } from "diff";
import { mocked } from "jest-mock";
import fs from "node:fs";
import { fakeModuleFile } from "../test/mock-template-files";
import { ModuleFile } from "./module-file";

jest.mock("node:fs");

const MODULE_FILE_CONTENT = fakeModuleFile({
  moduleName: "rules_foo",
  version: "1.2.3",
  deps: false,
});

beforeEach(() => {
  jest.clearAllMocks();

  mocked(fs.readFileSync).mockReturnValue(MODULE_FILE_CONTENT);
});

describe("moduleName", () => {
  test("parses module name", () => {
    const moduleFile = new ModuleFile("MODULE.bazel");
    expect(moduleFile.moduleName).toEqual("rules_foo");
  });

  test("parses a module name containing interesting characters", () => {
    mocked(fs.readFileSync).mockReturnValue(
      fakeModuleFile({
        moduleName: "rules_foo.bar-moo_123_-cow",
      })
    );

    const moduleFile = new ModuleFile("MODULE.bazel");
    expect(moduleFile.moduleName).toEqual("rules_foo.bar-moo_123_-cow");
  });
});

describe("moduleVersion", () => {
  test("parses module version", () => {
    const moduleFile = new ModuleFile("MODULE.bazel");
    expect(moduleFile.version).toEqual("1.2.3");
  });
});

describe("content", () => {
  test("returns the file contents", () => {
    const moduleFile = new ModuleFile("MODULE.bazel");
    expect(moduleFile.content).toEqual(
      fakeModuleFile({ moduleName: "rules_foo", version: "1.2.3" })
    );
  });
});

describe("stampVersion", () => {
  test("alters content to use new version", () => {
    const moduleFile = new ModuleFile("MODULE.bazel");
    moduleFile.stampVersion("4.5.6");
    expect(moduleFile.content).toEqual(
      fakeModuleFile({ moduleName: "rules_foo", version: "4.5.6" })
    );
  });
});

describe("save", () => {
  test("saves content to a file", () => {
    const moduleFile = new ModuleFile("MODULE.bazel");
    moduleFile.save("MODULE_B.bazel");

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "MODULE_B.bazel",
      moduleFile.content
    );
  });
});

describe("patchContent", () => {
  test("applies a diff", () => {
    const patchedModuleFile = fakeModuleFile({
      moduleName: "rules_foo",
      version: "1.2.3",
      deps: true,
    });

    const moduleFile = new ModuleFile("MODULE.bazel");

    expect(moduleFile.content).not.toEqual(patchedModuleFile);

    const patch = parsePatch(
      createTwoFilesPatch(
        "a/MODULE.bazel",
        "b/MODULE.bazel",
        moduleFile.content,
        patchedModuleFile
      )
    );

    expect(patch.length).toEqual(1);

    moduleFile.patchContent(patch[0]);
    expect(moduleFile.content).toEqual(patchedModuleFile);
  });
});
