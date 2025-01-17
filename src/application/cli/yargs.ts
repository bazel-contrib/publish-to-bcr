import yargs, { ArgumentsCamelCase, Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { CreateEntryCommand } from './create-entry-command';

export interface CreateEntryArgs {
  rulesetRepo: string;
}

export type ApplicationArgs = CreateEntryArgs;

export function createParser(
  createEntryCommand: CreateEntryCommand
): Argv<ApplicationArgs> {
  return yargs(hideBin(process.argv))
    .parserConfiguration({
      'camel-case-expansion': true,
    })
    .scriptName('publish-to-bcr')
    .usage('$0 <cmd> [args]')
    .command(
      'create-entry',
      'Create a new module version entry for the BCR',
      (yargs) => {
        yargs.option('ruleset-repo', {
          describe:
            'Ruleset repository containing .bcr folder with templates. Can be a remote git url, e.g. `git@github.com:org/repo.git` or local path e.g. `./path/to/repo`.',
          type: 'string',
          required: true,
          requiresArg: true,
        });
      },
      (args) => {
        createEntryCommand.handle(args as ArgumentsCamelCase<CreateEntryArgs>);
      }
    )
    .demandCommand()
    .strict()
    .fail(false) // Throw instead of killing the process
    .help() as Argv<ApplicationArgs>;
}
