import { Argv } from 'yargs';

import { CreateEntryService } from '../../domain/create-entry.js';
import { CreateEntryCommand } from './create-entry-command.js';
import { ApplicationArgs, createParser } from './yargs.js';

jest.mock('./create-entry-command.js');
jest.mock('../../domain/create-entry.js');

describe('createParser', () => {
  let parser: Argv<ApplicationArgs>;

  beforeEach(() => {
    parser = createParser(
      new CreateEntryCommand(
        new CreateEntryService({} as any, { backoffDelayFactor: 2000 })
      )
    );
  });

  test('displays --help', async () => {
    const output = await new Promise((resolve) => {
      parser.parse('--help', (err: any, argv: string[], output: string) => {
        resolve(output);
      });
    });
    expect(output).toEqual(expect.stringContaining('publish-to-bcr'));
    expect(output).toEqual(expect.stringContaining('create-entry'));
    expect(output).toEqual(expect.stringContaining('--help'));
  });

  test('fails with no args', async () => {
    expect(() => parser.parse('')).toThrow(
      'Not enough non-option arguments: got 0, need at least 1'
    );
  });

  describe('create-entry', () => {
    test('missing --templates-dir', async () => {
      expect(() =>
        parser.parse(
          'create-entry --local-registry /path/to/bcr --module-version 1.0.0'
        )
      ).toThrow('Missing required argument: templates-dir');
    });

    test('missing --templates-dir arg', () => {
      expect(() =>
        parser.parse(
          'create-entry --local-registry /path/to/bcr --module-version 1.0.0 --templates-dir'
        )
      ).toThrow('Not enough arguments following: templates-dir');
    });

    test('parses --templates-dir', async () => {
      const args = await parser.parse(
        'create-entry --templates-dir .bcr --local-registry /path/to/bcr --module-version 1.0.0'
      );
      expect(args.templatesDir).toEqual('.bcr');
    });

    test('missing --module-version', () => {
      expect(() =>
        parser.parse(
          'create-entry --templates-dir .bcr --local-registry /path/to/bcr'
        )
      ).toThrow('Missing required argument: module-version');
    });

    test('missing --module-version arg', () => {
      expect(() =>
        parser.parse(
          'create-entry --templates-dir .bcr --local-registry /path/to/bcr --tag v1.0.0 --module-version'
        )
      ).toThrow('Not enough arguments following: module-version');
    });

    test('parses --module-version', async () => {
      const args = await parser.parse(
        'create-entry --templates-dir .bcr --local-registry /path/to/bcr --module-version 1.0.0'
      );
      expect(args.moduleVersion).toEqual('1.0.0');
    });

    test('missing --tag arg', () => {
      expect(() =>
        parser.parse(
          'create-entry --templates-dir .bcr --local-registry /path/to/bcr --tag'
        )
      ).toThrow('Not enough arguments following: tag');
    });

    test('parses --tag', async () => {
      const args = await parser.parse(
        'create-entry --templates-dir .bcr --local-registry /path/to/bcr --module-version 1.0.0 --tag v1.0.0'
      );
      expect(args.tag).toEqual('v1.0.0');
    });

    test('missing --local-registry', () => {
      expect(() =>
        parser.parse(
          'create-entry --templates-dir .bcr --tag v1.0.0 --module-version 1.0.0'
        )
      ).toThrow('Missing required argument: local-registry');
    });

    test('missing --local-registry arg', () => {
      expect(() =>
        parser.parse(
          'create-entry --templates-dir .bcr --tag v1.0.0  --module-version 1.0.0 --local-registry'
        )
      ).toThrow('Not enough arguments following: local-registry');
    });

    test('parses --local-registry', async () => {
      const args = await parser.parse(
        'create-entry --templates-dir .bcr --local-registry /path/to/bcr --module-version 1.0.0'
      );
      expect(args.localRegistry).toEqual('/path/to/bcr');
    });

    test('missing --github-repository arg', () => {
      expect(() =>
        parser.parse(
          'create-entry --templates-dir .bcr --tag v1.0.0 --local-registry /path/to/bcr --github-repository'
        )
      ).toThrow('Not enough arguments following: github-repository');
    });

    test('parses --github-repository', async () => {
      const args = await parser.parse(
        'create-entry --templates-dir .bcr --module-version 1.0.0 --github-repository foo/bar --local-registry /path/to/bcr'
      );
      expect(args.githubRepository).toEqual('foo/bar');
    });
  });
});
