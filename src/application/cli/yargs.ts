import yargs, { ArgumentsCamelCase, Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { CreateEntryCommand } from './create-entry-command';

export interface CreateEntryArgs {
  githubRepository?: string;
  moduleRoots?: string[];
  moduleVersion: string;
  localRegistry: string;
  tag: string;
  templatesDir: string;
  localArtifactPath: string[];
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
        yargs.option('local-artifact-path', {
          describe: `\
            A list of local directories to search for artifacts locally instead of
            downloading them from their url in source.json or attestations.json.

            For example, if a release archive that would normally be downloaded from

              https://github.com/foo/bar/releases/download/v1.0.0/bar-v1.0.0.tar.gz

            exists locally under /tmp/release/bar-v1.0.0.tar.gz, then setting

              --local-artifact-path /tmp/release

            will allow Publish to BCR to find the file, bypass the download, and
            compute the integrity check from the local file. The name of the file
            must match the basename in the url.

            Multiple instances of --local-artifact-path may be passed. The paths
            will be searched in order until a matching file is found.
            `,
          type: 'array',
          required: false,
          default: [],
        });
        yargs.option('local-registry', {
          describe:
            'Path to a locally checked out registry where the entry files will be created.',
          type: 'string',
          required: true,
          requiresArg: true,
        });
        yargs.option('module-roots', {
          describe: `\
            A list of of relative paths of modules to publish. This option overrides
            moduleRoots in the configuration file.

            Multiple roots may be passed as a single space-delimited option or over
            multiple --module-roots arguments:
    
              --module-roots . a b/c
              --module-roots . --module-roots a --module-roots b/c
          `,
          type: 'array',
          required: false,
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
            'Directory containing BCR release template files: metadata.template.json, source.template.json, presubmit.yaml, patches/.',
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
