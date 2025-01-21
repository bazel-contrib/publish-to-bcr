import fs from 'node:fs';

import { mocked } from 'jest-mock';

import { Configuration, InvalidConfigurationFileError } from './configuration';

jest.mock('node:fs');

describe('Configuration', () => {
  describe('defaults', () => {
    test('sets module roots to single root', () => {
      const config = Configuration.defaults();

      expect(config.moduleRoots).toEqual(['.']);
    });

    test('does not set a fixed releaser', () => {
      const config = Configuration.defaults();

      expect(config.fixedReleaser).toBeUndefined();
    });
  });

  describe('fromFile', () => {
    test('empty file loads defaults', () => {
      mockConfig('config.yml', '');
      const config = Configuration.fromFile('config.yml');
      expect(config).toEqual(Configuration.defaults());
    });

    test('loads a fixedReleaser', () => {
      mockConfig(
        'config.yml',
        `\
fixedReleaser:
  login: jbedard
  email: json@bearded.ca                
`
      );
      const config = Configuration.fromFile('config.yml');
      expect(config.fixedReleaser).toEqual({
        login: 'jbedard',
        email: 'json@bearded.ca',
      });
    });

    test('throws on invalid fixedReleaser', () => {
      mockConfig(
        'config.yml',
        `\
fixedReleaser: foobar             
`
      );

      expect(() => Configuration.fromFile('config.yml')).toThrowWithMessage(
        InvalidConfigurationFileError,
        "Invalid configuration file at config.yml: could not parse 'fixedReleaser'"
      );
    });

    test('loads moduleRoots', () => {
      mockConfig(
        'config.yml',
        `\
moduleRoots: [".", "subdir"]             
`
      );
      const config = Configuration.fromFile('config.yml');
      expect(config.moduleRoots).toEqual(['.', 'subdir']);
    });

    test('throws on invalid moduleRoots', () => {
      mockConfig(
        'config.yml',
        `\
moduleRoots: 123             
`
      );

      expect(() => Configuration.fromFile('config.yml')).toThrowWithMessage(
        InvalidConfigurationFileError,
        "Invalid configuration file at config.yml: could not parse 'moduleRoots'"
      );
    });
  });
});

function mockConfig(filepath: string, content: string) {
  mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
    if (path === filepath) {
      return true;
    }
    return false;
  });

  mocked(fs.readFileSync).mockImplementation(
    (path: fs.PathLike, _options: any): any => {
      if (path === filepath) {
        return content;
      }
      throw new Error(`Unmocked file contents for ${path}`);
    }
  );
}
