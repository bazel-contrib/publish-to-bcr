import { mocked } from "jest-mock";
import fs from "node:fs";
import {
  fakeSourceFile,
  FakeSourceFileOptions,
} from "../test/mock-template-files";
import { expectThrownError } from "../test/util";
import { InvalidSourceTemplateError, SourceTemplate } from "./source-template";

jest.mock("node:fs");

let sourceTemplateContent: string;

beforeEach(() => {
  mockSourceFile();
});

function mockSourceFile(
  options: FakeSourceFileOptions & { missing?: boolean } = {}
) {
  sourceTemplateContent = fakeSourceFile(options);
  if (options.missing) {
    mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("Error: ENOENT: no such file or directory");
    });
  } else {
    mocked(fs.readFileSync).mockReturnValue(sourceTemplateContent);
  }
}

describe("constructor", () => {
  test("complains if the source template does not exist", async () => {
    mockSourceFile({ missing: true });

    await expectThrownError(
      () => new SourceTemplate("source.template.json"),
      InvalidSourceTemplateError
    );
  });

  test("complains if the source template is not valid json", async () => {
    mockSourceFile({ malformed: true });

    await expectThrownError(
      () => new SourceTemplate("source.template.json"),
      InvalidSourceTemplateError
    );
  });

  test("does not complain if the 'strip_prefix' is empty", () => {
    mockSourceFile({ stripPrefix: "" });

    new SourceTemplate("source.template.json");
  });

  test("does not complain if there is no 'strip_prefix'", () => {
    mockSourceFile({ missingStripPrefix: true });

    new SourceTemplate("source.template.json");
  });

  test("complains if the source template is missing 'url'", async () => {
    mockSourceFile({ missingUrl: true });

    await expectThrownError(
      () => new SourceTemplate("source.template.json"),
      InvalidSourceTemplateError
    );
  });
});

describe("substitute", () => {
  test("substitutes owner, name, tag, and version", () => {
    const sourceTemplate = new SourceTemplate("source.template.json");

    expect(sourceTemplate.url).toEqual(
      "https://github.com/{OWNER}/{REPO}/archive/refs/tags/{TAG}.tar.gz"
    );
    expect(sourceTemplate.stripPrefix).toEqual("{REPO}-{VERSION}");

    sourceTemplate.substitute("foo", "bar", "v1.2.3", "1.2.3");

    sourceTemplate.save("source.json");

    const jsonContent = JSON.parse(
      mocked(fs.writeFileSync).mock.calls[0][1] as string
    );
    expect(jsonContent.url).toEqual(
      "https://github.com/foo/bar/archive/refs/tags/v1.2.3.tar.gz"
    );
    expect(jsonContent.strip_prefix).toEqual("bar-1.2.3");
  });
});

describe("setIntegrityHash", () => {
  test("sets the integrity field", () => {
    const sourceTemplate = new SourceTemplate("source.template.json");
    sourceTemplate.setIntegrityHash("abcd");

    sourceTemplate.save("source.json");

    const jsonContent = JSON.parse(
      mocked(fs.writeFileSync).mock.calls[0][1] as string
    );
    expect(jsonContent.integrity).toEqual("abcd");
  });
});

describe("addPatch", () => {
  test("adds a patch entry", () => {
    const sourceTemplate = new SourceTemplate("source.template.json");
    sourceTemplate.addPatch("foo.patch", "1234", 0);

    sourceTemplate.save("source.json");

    const jsonContent = JSON.parse(
      mocked(fs.writeFileSync).mock.calls[0][1] as string
    );
    expect(jsonContent.patches["foo.patch"]).toEqual("1234");
  });

  test("sets the patch strip", () => {
    const sourceTemplate = new SourceTemplate("source.template.json");
    sourceTemplate.addPatch("foo.patch", "1234", 0);

    sourceTemplate.save("source.json");

    const jsonContent = JSON.parse(
      mocked(fs.writeFileSync).mock.calls[0][1] as string
    );
    expect(jsonContent.patch_strip).toEqual(0);
  });
});

describe("save", () => {
  test("saves the file", () => {
    const sourceTemplate = new SourceTemplate("source.template.json");

    sourceTemplate.save("source.json");

    const expectedOutput = JSON.parse(fakeSourceFile());
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "source.json",
      expect.any(String)
    );
    expect(
      JSON.parse(mocked(fs.writeFileSync).mock.calls[0][1] as string)
    ).toEqual(expectedOutput);
    expect(
      (mocked(fs.writeFileSync).mock.calls[0][1] as string).endsWith("\n")
    ).toEqual(true);
  });

  test("saves a file that ends with a newline", () => {
    const sourceTemplate = new SourceTemplate("source.template.json");

    sourceTemplate.save("source.json");

    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(
      (mocked(fs.writeFileSync).mock.calls[0][1] as string).endsWith("\n")
    ).toEqual(true);
  });

  test("saves a file when there's no 'strip_prefix'", () => {
    mockSourceFile({ missingStripPrefix: true });

    const sourceTemplate = new SourceTemplate("source.template.json");

    sourceTemplate.save("source.json");

    expect(
      "strip_prefix" in
        JSON.parse(mocked(fs.writeFileSync).mock.calls[0][1] as string)
    ).toEqual(false);
  });
});

describe("url", () => {
  test("gets the substituted url", () => {
    const sourceTemplate = new SourceTemplate("source.template.json");

    expect(sourceTemplate.url).toEqual(
      "https://github.com/{OWNER}/{REPO}/archive/refs/tags/{TAG}.tar.gz"
    );

    sourceTemplate.substitute("foo", "bar", "v1.2.3", "1.2.3");

    expect(sourceTemplate.url).toEqual(
      "https://github.com/foo/bar/archive/refs/tags/v1.2.3.tar.gz"
    );
  });
});

describe("stripPrefix", () => {
  test("gets the substituted strip prefix", () => {
    const sourceTemplate = new SourceTemplate("source.template.json");

    expect(sourceTemplate.stripPrefix).toEqual("{REPO}-{VERSION}");

    sourceTemplate.substitute("foo", "bar", "v1.2.3", "1.2.3");

    expect(sourceTemplate.stripPrefix).toEqual("bar-1.2.3");
  });

  test("returns an empty string if there is no strip_prefix", () => {
    mockSourceFile({ missingStripPrefix: true });
    const sourceTemplate = new SourceTemplate("source.template.json");

    expect(sourceTemplate.stripPrefix).toEqual("");

    sourceTemplate.substitute("foo", "bar", "v1.2.3", "1.2.3");

    expect(sourceTemplate.stripPrefix).toEqual("");
  });
});
