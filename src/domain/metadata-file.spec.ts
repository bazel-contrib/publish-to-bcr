import { mocked } from "jest-mock";
import fs from "node:fs";
import "../../jest.setup";
import { MetadataFile, MetadataFileError } from "./metadata-file";

jest.mock("node:fs");

beforeEach(() => {
  jest.clearAllMocks();
});

function mockMetadataFile(content: string) {
  mocked(fs.readFileSync).mockReturnValue(content);
}

describe("constructor", () => {
  test("complains if the metadata file does not exist", () => {
    mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("Error: ENOENT: no such file or directory");
    });

    expect(() => new MetadataFile("metadata.json")).toThrow(MetadataFileError);
  });

  test("complains if the metadata file has invalid json", () => {
    mockMetadataFile(`\
{
    "homepage: "https://foo.bar"
}
`);
    expect(() => new MetadataFile("metadata.json")).toThrow(MetadataFileError);
  });

  test("complains if the 'versions' field is missing'", () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [
        {
            "email": "json@aspect.dev",
            "github": "json",
            "name": "Jason Bearded"
        }
    ],
    "repository": [
        "github:bar/rules_foo"
    ],
    "yanked_versions": {}
}
`);
    expect(() => new MetadataFile("metadata.json")).toThrowErrorContaining(
      MetadataFileError,
      "versions"
    );
  });

  test("complains if the 'versions' field not an array'", () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [
        {
            "email": "json@aspect.dev",
            "github": "json",
            "name": "Jason Bearded"
        }
    ],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": {},
    "yanked_versions": {}
}
`);
    expect(() => new MetadataFile("metadata.json")).toThrowErrorContaining(
      MetadataFileError,
      "versions"
    );
  });

  test("complains if the 'versions' field contains a non-string'", () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [
        {
            "email": "json@aspect.dev",
            "github": "json",
            "name": "Jason Bearded"
        }
    ],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": ["1", 2, "3"],
    "yanked_versions": {}
}
`);
    expect(() => new MetadataFile("metadata.json")).toThrowErrorContaining(
      MetadataFileError,
      "versions"
    );
  });

  test("complains if the 'yanked_versions' field is missing'", () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [
        {
            "email": "json@aspect.dev",
            "github": "json",
            "name": "Jason Bearded"
        }
    ],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": []
}
`);
    expect(() => new MetadataFile("metadata.json")).toThrowErrorContaining(
      MetadataFileError,
      "yanked_versions"
    );
  });

  test("complains if the 'yanked_versions' field is not an object'", () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [
        {
            "email": "json@aspect.dev",
            "github": "json",
            "name": "Jason Bearded"
        }
    ],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [],
    "yanked_versions": []
}
`);
    expect(() => new MetadataFile("metadata.json")).toThrowErrorContaining(
      MetadataFileError,
      "yanked_versions"
    );
  });

  test("complains if a 'yanked_versions' entry contains a non-string'", () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [
        {
            "email": "json@aspect.dev",
            "github": "json",
            "name": "Jason Bearded"
        }
    ],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [],
    "yanked_versions": {
        "1.2.3": 42
    }
}
`);
    expect(() => new MetadataFile("metadata.json")).toThrowErrorContaining(
      MetadataFileError,
      "yanked_versions"
    );
  });

  test("succeeds if the 'maintainers' field is missing'", () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [],
    "yanked_versions": {}
}
`);
    const metadata = new MetadataFile("metadata.json");
    expect(metadata.maintainers.length).toEqual(0);
  });

  test("succeeds if the list of maintainers is empty'", () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [],
    "yanked_versions": {}
}
`);
    const metadata = new MetadataFile("metadata.json");
    expect(metadata.maintainers.length).toEqual(0);
  });

  test("fails if 'maintainers' is not a list", () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": {},
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [],
    "yanked_versions": {}
}
`);
    expect(() => new MetadataFile("metadata.json")).toThrowErrorContaining(
      MetadataFileError,
      "maintainers"
    );
  });

  test("fails if 'maintainers' contains non-objects", () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [42],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [],
    "yanked_versions": {}
}
`);
    expect(() => new MetadataFile("metadata.json")).toThrowErrorContaining(
      MetadataFileError,
      "maintainers"
    );
  });

  test("succeeds if maintainer doesn't have an email", () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [{
        "name": "Json Bearded",
        "github": "jbedard"
    }],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [],
    "yanked_versions": {}
}
`);
    const metadata = new MetadataFile("metadata.json");
    expect(metadata.maintainers[0].name).toEqual("Json Bearded");
    expect(metadata.maintainers[0].github).toEqual("jbedard");
    expect(metadata.maintainers[0].email).toBeUndefined();
  });

  test("succeeds if maintainer doesn't have a github handle", () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [{
        "name": "Json Bearded",
        "email": "json@bearded.ca"
    }],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [],
    "yanked_versions": {}
}
`);
    const metadata = new MetadataFile("metadata.json");
    expect(metadata.maintainers[0].name).toEqual("Json Bearded");
    expect(metadata.maintainers[0].email).toEqual("json@bearded.ca");
    expect(metadata.maintainers[0].github).toBeUndefined();
  });
});

describe("save", () => {
  test("preserves fields that the app doesn't care about", () => {
    mockMetadataFile(`\
        {
            "homepage": "https://foo.bar",
            "maintainers": [{
                "name": "Json Bearded",
                "email": "json@bearded.ca"
            }],
            "repository": [
                "github:bar/rules_foo"
            ],
            "versions": [],
            "yanked_versions": {}
        }
        `);

    const metadata = new MetadataFile("metadata.json");
    metadata.save("metadata.json");

    const written = mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(JSON.parse(written).homepage).toEqual("https://foo.bar");
  });

  test("preserves maintainer fields that the app doesn't know about", () => {
    mockMetadataFile(`\
        {
            "homepage": "https://foo.bar",
            "maintainers": [{
                "name": "Json Bearded",
                "email": "json@bearded.ca",
                "disposition": "bearded"
            }],
            "repository":   [
                "github:bar/rules_foo"
            ],
            "versions": [],
            "yanked_versions": {}
        }
        `);

    const metadata = new MetadataFile("metadata.json");
    metadata.save("metadata.json");

    const written = mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(JSON.parse(written).maintainers[0].disposition).toEqual("bearded");
  });
});
