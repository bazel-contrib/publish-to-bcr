import fs from 'node:fs';

import { createTwoFilesPatch, parsePatch } from 'diff';
import { mocked } from 'jest-mock';

import { fakeModuleFile } from '../test/mock-template-files';
import { ModuleFile, PatchModuleError } from './module-file';

jest.mock('node:fs');

const MODULE_FILE_CONTENT = fakeModuleFile({
  moduleName: 'rules_foo',
  version: '1.2.3',
  deps: false,
});

beforeEach(() => {
  mocked(fs.readFileSync).mockReturnValue(MODULE_FILE_CONTENT);
});

describe('moduleName', () => {
  test('parses module name', () => {
    const moduleFile = new ModuleFile('MODULE.bazel');
    expect(moduleFile.moduleName).toEqual('rules_foo');
  });

  test('parses a module name containing interesting characters', () => {
    mocked(fs.readFileSync).mockReturnValue(
      fakeModuleFile({
        moduleName: 'rules_foo.bar-moo_123_-cow',
      })
    );

    const moduleFile = new ModuleFile('MODULE.bazel');
    expect(moduleFile.moduleName).toEqual('rules_foo.bar-moo_123_-cow');
  });
});

describe('version', () => {
  test('parses module version', () => {
    const moduleFile = new ModuleFile('MODULE.bazel');
    expect(moduleFile.version).toEqual('1.2.3');
  });

  test('returns undefined when the version is missing', () => {
    mocked(fs.readFileSync).mockReturnValue(`\
module(name = "rules_foo")
`);
    const moduleFile = new ModuleFile('MODULE.bazel');
    expect(moduleFile.version).toBeUndefined();
  });
});

describe('content', () => {
  test('returns the file contents', () => {
    const moduleFile = new ModuleFile('MODULE.bazel');
    expect(moduleFile.content).toEqual(
      fakeModuleFile({ moduleName: 'rules_foo', version: '1.2.3' })
    );
  });
});

describe('stampVersion', () => {
  test('alters content to use new version', () => {
    const moduleFile = new ModuleFile('MODULE.bazel');
    moduleFile.stampVersion('4.5.6');
    expect(moduleFile.content).toEqual(
      fakeModuleFile({ moduleName: 'rules_foo', version: '4.5.6' })
    );
  });

  test('stamps the version when the version field was originally missing', () => {
    mocked(fs.readFileSync).mockReturnValue(`\
module(
    name = "rules_foo"
)`);
    const moduleFile = new ModuleFile('MODULE.bazel');
    moduleFile.stampVersion('4.5.6');

    expect(moduleFile.content).toEqual(`\
module(
    name = "rules_foo",
    version = "4.5.6",
)`);
  });

  test('stamps the version when the version field was originally missing and the last field is comma-trailed', () => {
    mocked(fs.readFileSync).mockReturnValue(`\
module(
    name = "rules_foo",
    compatibility_level = 1,
)`);
    const moduleFile = new ModuleFile('MODULE.bazel');
    moduleFile.stampVersion('4.5.6');

    expect(moduleFile.content).toEqual(`\
module(
    name = "rules_foo",
    compatibility_level = 1,
    version = "4.5.6",
)`);
  });

  test('stamps the version when the version field was set to the empty string', () => {
    mocked(fs.readFileSync).mockReturnValue(`\
module(
    name = "gazelle",
    # Updated by the Publish to BCR app.
    version = "",
    repo_name = "bazel_gazelle",
)

bazel_dep(name = "bazel_features", version = "1.9.1")`);
    const moduleFile = new ModuleFile('MODULE.bazel');
    moduleFile.stampVersion('4.5.6');

    expect(moduleFile.content).toEqual(`\
module(
    name = "gazelle",
    # Updated by the Publish to BCR app.
    version = "4.5.6",
    repo_name = "bazel_gazelle",
)

bazel_dep(name = "bazel_features", version = "1.9.1")`);
  });

  test('stamps the version when the version field was missing but the module call ends with a comment', () => {
    mocked(fs.readFileSync).mockReturnValue(`\
module(
    name = "gazelle",
    repo_name = "bazel_gazelle",
    # version is set by the Publish to BCR app.
)

bazel_dep(name = "bazel_features", version = "1.9.1")
bazel_dep(name = "bazel_skylib", version = "1.5.0")`);
    const moduleFile = new ModuleFile('MODULE.bazel');
    moduleFile.stampVersion('4.5.6');

    expect(moduleFile.content).toEqual(`\
module(
    name = "gazelle",
    repo_name = "bazel_gazelle",
    # version is set by the Publish to BCR app.,
    version = "4.5.6",
)

bazel_dep(name = "bazel_features", version = "1.9.1")
bazel_dep(name = "bazel_skylib", version = "1.5.0")`);
  });
});

describe('save', () => {
  test('saves content to a file', () => {
    const moduleFile = new ModuleFile('MODULE.bazel');
    moduleFile.save('MODULE_B.bazel');

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'MODULE_B.bazel',
      moduleFile.content
    );
  });
});

describe('patchContent', () => {
  test('applies a diff', () => {
    const patchedModuleFile = fakeModuleFile({
      moduleName: 'rules_foo',
      version: '1.2.3',
      deps: true,
    });

    const moduleFile = new ModuleFile('MODULE.bazel');

    expect(moduleFile.content).not.toEqual(patchedModuleFile);

    const patch = parsePatch(
      createTwoFilesPatch(
        'a/MODULE.bazel',
        'b/MODULE.bazel',
        moduleFile.content,
        patchedModuleFile
      )
    );

    expect(patch.length).toEqual(1);

    moduleFile.patchContent(patch[0]);
    expect(moduleFile.content).toEqual(patchedModuleFile);
  });

  test('throws when the patch could not be applied', () => {
    const patchedModuleFile = fakeModuleFile({
      moduleName: 'rules_foo',
      version: '1.2.3',
      deps: true,
    });

    const moduleFile = new ModuleFile('MODULE.bazel');

    const patch = parsePatch(
      createTwoFilesPatch(
        'a/MODULE.bazel',
        'b/MODULE.bazel',
        moduleFile.content,
        patchedModuleFile
      )
    );

    // Change the module file's version so that the generated patch
    // will no longer apply correctly.
    moduleFile.stampVersion('10.20.30');
    expect(() => moduleFile.patchContent(patch[0])).toThrow(PatchModuleError);
  });
});
