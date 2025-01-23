import yargs, { ArgumentsCamelCase, Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { CreateEntryCommand } from './create-entry-command';

export interface CreateEntryArgs {
  githubRepository?: string;
  moduleVersion: string;
  localRegistry: string;
  tag: string;
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
        yargs.option('github-repository', {
          describe:
            'GitHub repository for the module being published. Used to substititue the OWNER and REPO vars into the source template.',
          type: 'string',
          required: false,
          requiresArg: true,
        });
        yargs.option('local-registry', {
          describe:
            'Path to a locally checked out registry where the entry files will be created.',
          type: 'string',
          required: true,
          requiresArg: true,
        });
        yargs.option('module-version', {
          describe: 'The module version to publish to the registry.',
          type: 'string',
          required: true,
          requiresArg: true,
        });
        yargs.option('tag', {
          describe:
            "Tag of the the module repository's release. Used for substitution in the source template.",
          type: 'string',
          required: false,
          requiresArg: true,
        });
        yargs.option('templates-dir', {
          describe:
            'Directory containing BCR release template files: metadata.template.json, source.template.json, presubmit.yaml, patches/. Equivalent to the .bcr directory required by the legacy GitHub app.',
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
