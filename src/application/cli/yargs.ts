import yargs, { ArgumentsCamelCase, Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { CreateEntryCommand } from './create-entry-command';

export interface CreateEntryArgs {
  templatesDir: string;
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
        yargs.option('templates-dir', {
          describe:
            'Directory containing a config file, BCR templates, and other release files: config.yml, source.template.json, metadata.template.json, presubmit.yaml. Equivalent to the .bcr directory required by the legacy GitHub app.',
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
