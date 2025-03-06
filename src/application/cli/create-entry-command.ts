import fs from 'node:fs';

import { Injectable } from '@nestjs/common';
import chalk from 'chalk';
import path from 'path';
import treeNodeCli from 'tree-node-cli';
import { ArgumentsCamelCase } from 'yargs';

import {
  AttestationDownloadError,
  AttestationsTemplate,
  AttestationsTemplateError,
  UnsubstitutedAttestationVarsError,
} from '../../domain/attestations-template.js';
import {
  Configuration,
  InvalidConfigurationFileError,
  MissingConfigurationFileError,
} from '../../domain/configuration.js';
import {
  CreateEntryService,
  VersionAlreadyPublishedError,
} from '../../domain/create-entry.js';
import { MetadataFile } from '../../domain/metadata-file.js';
import { MetadataFileError } from '../../domain/metadata-file.js';
import {
  ArchiveDownloadError,
  MissingModuleFileError,
  ReleaseArchive,
  UnsupportedArchiveFormat,
} from '../../domain/release-archive.js';
import { Repository } from '../../domain/repository.js';
import {
  SourceTemplate,
  UnsubstitutedVarsError as UnsubstitutedSourceVarsError,
} from '../../domain/source-template.js';
import { SourceTemplateError } from '../../domain/source-template.js';
import { SubstitutableVar } from '../../domain/substitution.js';
import { CreateEntryArgs } from './yargs.js';

export interface CreateEntryCommandOutput {
  modules: {
    name: string;
    entryPath: string;
  }[];
}

@Injectable()
export class CreateEntryCommand {
  constructor(private readonly createEntryService: CreateEntryService) {}

  public async handle(args: ArgumentsCamelCase<CreateEntryArgs>) {
    console.error(chalk.green.bold.underline('Publish to BCR'));

    const configuration = this.loadConfigurationFromDirectoryOrDefault(
      args.templatesDir
    );
    if (configuration.moduleRoots.length > 1) {
      console.error(
        `Detected multiple module roots: ${JSON.stringify(configuration.moduleRoots)}`
      );
    }

    const moduleNames: string[] = [];
    const moduleEntryPaths: string[] = [];
    for (const moduleRoot of configuration.moduleRoots) {
      console.error(
        `\nLoading template files from ${path.normalize(path.join(args.templatesDir, moduleRoot))}`
      );

      const sourceTemplatePath = path.join(
        args.templatesDir,
        moduleRoot,
        'source.template.json'
      );
      const attestationsTemplatePath = path.join(
        args.templatesDir,
        moduleRoot,
        'attestations.template.json'
      );
      try {
        const metadataTemplate = new MetadataFile(
          path.join(args.templatesDir, moduleRoot, 'metadata.template.json')
        );
        const sourceTemplate = new SourceTemplate(sourceTemplatePath);
        const attestationsTemplate = AttestationsTemplate.tryLoad(
          attestationsTemplatePath
        );
        const presubmitPath = path.join(
          args.templatesDir,
          moduleRoot,
          'presubmit.yml'
        );
        const patchesPath = path.join(args.templatesDir, moduleRoot, 'patches');

        const substitutions = {
          ...ghRepoSubstitutions(args.githubRepository),
          ...(args.tag ? { TAG: args.tag } : {}),
        };
        sourceTemplate.substitute(substitutions);
        if (attestationsTemplate) {
          attestationsTemplate.substitute(substitutions);
        }

        console.error(
          `Creating entry for module version ${args.moduleVersion} in ${args.localRegistry}`
        );

        const { moduleName } = await this.createEntryService.createEntryFiles(
          metadataTemplate,
          sourceTemplate,
          presubmitPath,
          patchesPath,
          args.localRegistry,
          args.moduleVersion,
          attestationsTemplate
        );

        console.error(
          `Successfully created entry for ${moduleName}@${args.moduleVersion}`
        );

        moduleNames.push(moduleName);
        moduleEntryPaths.push(
          path.join(
            args.localRegistry,
            'modules',
            moduleName,
            args.moduleVersion
          )
        );
      } catch (e) {
        this.handleErrorAndExit(
          sourceTemplatePath,
          attestationsTemplatePath,
          e
        );
      }
    }

    this.prettyPrintEntryFiles(
      args.localRegistry,
      moduleNames,
      args.moduleVersion
    );

    console.log(
      JSON.stringify(
        {
          modules: moduleNames.map((_, i) => ({
            name: moduleNames[i],
            entryPath: moduleEntryPaths[i],
          })),
        } as CreateEntryCommandOutput,
        undefined,
        2
      )
    );

    return Promise.resolve(null);
  }

  private handleErrorAndExit(
    sourceTemplatePath: string,
    attestationsTemplatePath: string,
    e: Error
  ): void {
    if (e instanceof MetadataFileError) {
      console.error(
        `Failed to read metadata template at ${e.path}: ${e.message}`
      );
    } else if (e instanceof SourceTemplateError) {
      console.error(
        `Failed to read source template at ${e.path}: ${e.message}`
      );
    } else if (e instanceof UnsubstitutedSourceVarsError) {
      console.error(
        `Source template ${e.path} has unsubstituted variables ${Array.from(e.unsubstituted).join(',')}`
      );
      if (
        e.unsubstituted.has(SubstitutableVar.OWNER) ||
        e.unsubstituted.has(SubstitutableVar.REPO)
      ) {
        console.error(
          'Did you forget to pass --github-repository to substitute the OWNER and REPO variables?'
        );
      }
      if (e.unsubstituted.has(SubstitutableVar.TAG)) {
        console.error(
          'Did you forget to pass --tag to substitute the TAG variable?'
        );
      }
    } else if (e instanceof UnsupportedArchiveFormat) {
      console.error(
        `Release archive ${e.url} has unsupported extension ${e.extension}`
      );
      console.error(
        `Supported extensions: ${ReleaseArchive.SUPPORTED_EXTENSIONS.join(',')}`
      );
    } else if (e instanceof ArchiveDownloadError) {
      console.error(
        `Failed to download release archive ${e.url}; received status code ${e.statusCode}`
      );
      console.error(
        `Double check that the url in ${sourceTemplatePath} is correct and that the archive has been uploaded by the time this command is run. `
      );
    } else if (e instanceof MissingModuleFileError) {
      console.error(
        `The release archive is missing a MODULE.bazel file! This file is needed to form a BCR entry.`
      );
    } else if (e instanceof VersionAlreadyPublishedError) {
      console.error(
        `The local registry already has version ${e.version} of module ${e.moduleName}. Aborting.`
      );
    } else if (e instanceof AttestationsTemplateError) {
      console.error(
        `Failed to read attestations template at ${e.path}: ${e.message}`
      );
    } else if (e instanceof UnsubstitutedAttestationVarsError) {
      console.error(
        `Attestations template ${e.path} has unsubstituted variables ${Array.from(e.unsubstituted).join(',')}`
      );
      if (
        e.unsubstituted.has(SubstitutableVar.OWNER) ||
        e.unsubstituted.has(SubstitutableVar.REPO)
      ) {
        console.error(
          'Did you forget to pass --github-repository to substitute the OWNER and REPO variables?'
        );
      }
      if (e.unsubstituted.has(SubstitutableVar.TAG)) {
        console.error(
          'Did you forget to pass --tag to substitute the TAG variable?'
        );
      }
    } else if (e instanceof AttestationDownloadError) {
      console.error(
        `Failed to download attestation ${e.url}; received status code ${e.statusCode}`
      );
      console.error(
        `Double check that the url in ${attestationsTemplatePath} is correct and that the attestation has been uploaded by the time this command is run. `
      );
    } else {
      throw e;
    }

    process.exit(1);
  }

  private prettyPrintEntryFiles(
    localRegistry: string,
    moduleNames: string[],
    moduleVersion: string
  ) {
    const metadata = new MetadataFile(
      path.join(localRegistry, 'modules', moduleNames[0], 'metadata.json')
    );

    const allModules = fs.readdirSync(path.join(localRegistry, 'modules'));

    const entryTree = treeNodeCli(path.join(localRegistry, 'modules'), {
      exclude: [
        ...metadata.versions
          .filter((v) => v !== moduleVersion)
          .map(
            (v) =>
              new RegExp(
                `${moduleNames.join('|')}${path.sep}${v.replaceAll('.', '\\.')}`
              )
          ),
        ...allModules
          .filter((m) => !moduleNames.includes(m))
          .map((m) => new RegExp(m)),
      ],
    });

    console.error('\nEntry files created or modified in');
    console.error(chalk.blue(`${localRegistry}${path.sep}${entryTree}`));
  }

  private loadConfigurationFromDirectoryOrDefault(
    directory: string
  ): Configuration {
    try {
      const configuration = Configuration.loadFromDirectory(directory);
      console.error(`Loaded configuration from ${configuration.filepath}`);
      return configuration;
    } catch (e) {
      if (e instanceof MissingConfigurationFileError) {
        console.error(
          `Did not find configuration file in ${directory}; setting defaults`
        );
        return Configuration.defaults();
      } else if (e instanceof InvalidConfigurationFileError) {
        console.error(
          `Invalid configuration file in ${directory}: ${e.message}`
        );
        process.exit(1);
      }

      throw e;
    }
  }
}

function ghRepoSubstitutions(
  githubRepository?: string
): Partial<Record<SubstitutableVar, string>> {
  if (githubRepository) {
    const repo = Repository.fromCanonicalName(githubRepository);
    return {
      OWNER: repo.owner,
      REPO: repo.name,
    };
  }
  return {};
}
