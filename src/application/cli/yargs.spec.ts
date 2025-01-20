import { Argv } from 'yargs';

import { CreateEntryCommand } from './create-entry-command.js';
import { ApplicationArgs, createParser } from './yargs.js';

jest.mock('./create-entry-command.js');

describe('createParser', () => {
  let parser: Argv<ApplicationArgs>;

  beforeEach(() => {
    parser = createParser(new CreateEntryCommand());
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
      expect(() => parser.parse('create-entry')).toThrow(
        'Missing required argument: templates-dir'
      );
    });

    test('missing --templates-dir arg', () => {
      expect(() => parser.parse('create-entry --templates-dir')).toThrow(
        'Not enough arguments following: templates-dir'
      );
    });

    test('parses --templates-dir', async () => {
      const args = await parser.parse('create-entry --templates-dir .bcr');
      expect(args.templatesDir).toEqual('.bcr');
    });
  });
});
