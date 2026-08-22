import fs from 'node:fs';

import { mocked } from 'jest-mock';

import { Configuration, InvalidConfigurationFileError } from './configuration';

jest.mock('node:fs');

describe('Configuration', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('defaults', () => {
    test('sets module roots to single root', () => {
      const config = Configuration.defaults();

      expect(config.moduleRoots).toEqual(['.']);
    });
  });

  describe('loadFromDirectory', () => {
    test('loads config.yml from the directory', () => {
      jest
        .spyOn(Configuration, 'fromFile')
        .mockReturnValue(Configuration.defaults());
      mockConfig('dir/config.yml', '');
      Configuration.loadFromDirectory('dir');

      expect(Configuration.fromFile).toHaveBeenCalledWith('dir/config.yml');
    });

    test('loads config.yaml from the directory', () => {
      jest
        .spyOn(Configuration, 'fromFile')
        .mockReturnValue(Configuration.defaults());
      mockConfig('dir/config.yaml', '');
      Configuration.loadFromDirectory('dir');

      expect(Configuration.fromFile).toHaveBeenCalledWith('dir/config.yaml');
    });
  });

  describe('fromFile', () => {
    test('empty file loads defaults', () => {
      mockConfig('config.yml', '');
      const config = Configuration.fromFile('config.yml');
      expect(config.moduleRoots).toEqual(['.']);
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
