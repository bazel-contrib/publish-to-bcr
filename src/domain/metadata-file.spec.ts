import 'jest-extended';
import { mocked } from 'jest-mock';
import fs from 'node:fs';
import { MetadataFile, MetadataFileError } from './metadata-file';

jest.mock('node:fs');

function mockMetadataFile(content: string) {
  mocked(fs.readFileSync).mockReturnValue(content);
}

describe('constructor', () => {
  test('complains if the metadata file does not exist', () => {
    mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Error: ENOENT: no such file or directory');
    });

    expect(() => new MetadataFile('metadata.json')).toThrow(MetadataFileError);
  });

  test('complains if the metadata file has invalid json', () => {
    mockMetadataFile(`\
{
    "homepage: "https://foo.bar"
}
`);
    expect(() => new MetadataFile('metadata.json')).toThrow(MetadataFileError);
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
    expect(() => new MetadataFile('metadata.json')).toThrowWithMessage(
      MetadataFileError,
      /versions/
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
    expect(() => new MetadataFile('metadata.json')).toThrowWithMessage(
      MetadataFileError,
      /versions/
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
    expect(() => new MetadataFile('metadata.json')).toThrowWithMessage(
      MetadataFileError,
      /versions/
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
    expect(() => new MetadataFile('metadata.json')).toThrowWithMessage(
      MetadataFileError,
      /yanked_versions/
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
    expect(() => new MetadataFile('metadata.json')).toThrowWithMessage(
      MetadataFileError,
      /yanked_versions/
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
    expect(() => new MetadataFile('metadata.json')).toThrowWithMessage(
      MetadataFileError,
      /yanked_versions/
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
    const metadata = new MetadataFile('metadata.json');
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
    const metadata = new MetadataFile('metadata.json');
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
    expect(() => new MetadataFile('metadata.json')).toThrowWithMessage(
      MetadataFileError,
      /maintainers/
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
    expect(() => new MetadataFile('metadata.json')).toThrowWithMessage(
      MetadataFileError,
      /maintainers/
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
    const metadata = new MetadataFile('metadata.json');
    expect(metadata.maintainers[0].name).toEqual('Json Bearded');
    expect(metadata.maintainers[0].github).toEqual('jbedard');
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
    const metadata = new MetadataFile('metadata.json');
    expect(metadata.maintainers[0].name).toEqual('Json Bearded');
    expect(metadata.maintainers[0].email).toEqual('json@bearded.ca');
    expect(metadata.maintainers[0].github).toBeUndefined();
  });

  test('sorts semver versions', () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [
      "1.2.1",
      "5.2.3",
      "1.2.3",
      "0.5.0"
    ],
    "yanked_versions": {}
}
`);
    const metadata = new MetadataFile('metadata.json');

    expect(metadata.versions).toEqual(['0.5.0', '1.2.1', '1.2.3', '5.2.3']);
  });

  test('sorts release candidate versions', () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [
      "1.0.0-rc0",
      "1.0.0-rc1",
      "0.0.1",
      "2.0.0-rc5"
    ],
    "yanked_versions": {}
}
`);
    const metadata = new MetadataFile('metadata.json');

    expect(metadata.versions).toEqual([
      '0.0.1',
      '1.0.0-rc0',
      '1.0.0-rc1',
      '2.0.0-rc5',
    ]);
  });

  test('sorts versions with a different number of identifiers', () => {
    // See: https://bazel.build/external/module#version_format
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [
      "2.0.0",
      "20210324.2",
      "1.0.0"
    ],
    "yanked_versions": {}
}
`);
    const metadata = new MetadataFile('metadata.json');

    expect(metadata.versions).toEqual(['1.0.0', '2.0.0', '20210324.2']);
  });

  test('sorts non-numeric versions lexicographically', () => {
    // See: https://bazel.build/external/module#version_format
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [
      "xyz",
      "abc.e",
      "abc.d"
    ],
    "yanked_versions": {}
}
`);
    const metadata = new MetadataFile('metadata.json');

    expect(metadata.versions).toEqual(['abc.d', 'abc.e', 'xyz']);
  });
});

describe('save', () => {
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

    const metadata = new MetadataFile('metadata.json');
    metadata.save('metadata.json');

    const written = mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(JSON.parse(written).homepage).toEqual('https://foo.bar');
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

    const metadata = new MetadataFile('metadata.json');
    metadata.save('metadata.json');

    const written = mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(JSON.parse(written).maintainers[0].disposition).toEqual('bearded');
  });

  test('saves versions sorted by semver', () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [],
    "repository": [
        "github:bar/rules_foo"
    ],
    "versions": [
      "1.0.0",
      "2.0.0"
    ],
    "yanked_versions": {}
}
`);
    const metadata = new MetadataFile('metadata.json');

    metadata.addVersions('0.5.0', '1.2.3', '5.3.1');

    metadata.save('metadata.json');

    const written = mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(JSON.parse(written).versions).toEqual([
      '0.5.0',
      '1.0.0',
      '1.2.3',
      '2.0.0',
      '5.3.1',
    ]);
  });
});

describe('emergencyParseMaintainers', () => {
  test('parses maintainers from a valid metadata file', () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [
        {
            "name": "M1",
            "email": "m1@foo-maintainer.ca"
        },
        {
            "name": "M2"
        },
        {
            "name": "M3",
            "github": "m3"
        },
        {
            "name": "M4",
            "email": "m4@foo-maintainer.ca",
            "github": "m4"
        }
    ],
    "repository":   [
        "github:bar/rules_foo"
    ],
    "versions": [],
    "yanked_versions": {}
}
`);
    const maintainers = MetadataFile.emergencyParseMaintainers('metadata.json');

    expect(maintainers).toEqual([
      {
        name: 'M1',
        email: 'm1@foo-maintainer.ca',
      },
      {
        name: 'M2',
      },
      {
        name: 'M3',
        github: 'm3',
      },
      {
        name: 'M4',
        email: 'm4@foo-maintainer.ca',
        github: 'm4',
      },
    ]);
  });

  test('parses valid maintainers from an invalid metadata file', () => {
    mockMetadataFile(`\
{
    "versions": 42,
    "maintainers": [
        {
            "name": "M1",
            "email": "m1@foo-maintainer.ca"
        },
        {
            "name": "M2"
        }
    ]
}
`);
    const maintainers = MetadataFile.emergencyParseMaintainers('metadata.json');

    expect(maintainers).toEqual([
      {
        name: 'M1',
        email: 'm1@foo-maintainer.ca',
      },
      {
        name: 'M2',
      },
    ]);
  });

  test('ignores invalid maintainers', () => {
    mockMetadataFile(`\
{
    "homepage": "https://foo.bar",
    "maintainers": [
        {
            "name": "M1",
            "email": "m1@foo-maintainer.ca"
        },
        {
            "email": "m2@foo-maintainer.ca"
        },
        {
            "name": "M3",
            "github": "m3"
        },
        {
            "foo": "bar"
        }
    ],
    "repository":   [
        "github:bar/rules_foo"
    ],
    "versions": [],
    "yanked_versions": {}
}
`);
    const maintainers = MetadataFile.emergencyParseMaintainers('metadata.json');

    expect(maintainers).toEqual([
      {
        name: 'M1',
        email: 'm1@foo-maintainer.ca',
      },
      {
        name: 'M3',
        github: 'm3',
      },
    ]);
  });
});
