import { Injectable } from '@nestjs/common';
import chalk from 'chalk';
import path from 'path';
import treeNodeCli from 'tree-node-cli';
import { ArgumentsCamelCase } from 'yargs';

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
  SubstitutableVar,
  UnsubstitutedVarsError,
} from '../../domain/source-template.js';
import { SourceTemplateError } from '../../domain/source-template.js';
import { CreateEntryArgs } from './yargs.js';

@Injectable()
export class CreateEntryCommand {
  constructor(private readonly createEntryService: CreateEntryService) {}

  public async handle(args: ArgumentsCamelCase<CreateEntryArgs>) {
    console.error(chalk.green.bold.underline('Publish to BCR'));
    console.error(`Loading template files from ${args.templatesDir}`);

    const sourceTemplatePath = path.join(
      args.templatesDir,
      'source.template.json'
    );
    try {
      const metadataTemplate = new MetadataFile(
        path.join(args.templatesDir, 'metadata.template.json')
      );
      const sourceTemplate = new SourceTemplate(sourceTemplatePath);
      const presubmitPath = path.join(args.templatesDir, 'presubmit.yml');
      const patchesPath = path.join(args.templatesDir, 'patches');

      sourceTemplate.substitute({
        ...ghRepoSubstitutions(args.githubRepository),
        ...(args.tag ? { TAG: args.tag } : {}),
      });

      console.error(
        `Creating entry for module version ${args.moduleVersion} in ${args.localRegistry}`
      );

      const { moduleName } = await this.createEntryService.createEntryFiles(
        metadataTemplate,
        sourceTemplate,
        presubmitPath,
        patchesPath,
        args.localRegistry,
        args.moduleVersion
      );

      console.error(
        `Successfully created entry for ${moduleName}@${args.moduleVersion}`
      );

      this.prettyPrintEntryFiles(
        args.localRegistry,
        moduleName,
        args.moduleVersion
      );
    } catch (e) {
      this.handleErrorAndExit(sourceTemplatePath, e);
    }

    return Promise.resolve(null);
  }

  private handleErrorAndExit(sourceTemplatePath: string, e: Error): void {
    if (e instanceof MetadataFileError) {
      console.error(
        `Failed to read metadata template at ${e.path}: ${e.message}`
      );
    } else if (e instanceof SourceTemplateError) {
      console.error(
        `Failed to read source template at ${e.path}: ${e.message}`
      );
    } else if (e instanceof UnsubstitutedVarsError) {
      console.error(
        `Source template ${e.path} has unsubstituted variables ${Array.from(e.unsubstituted).join(',')}`
      );
      if (e.unsubstituted.has('OWNER') || e.unsubstituted.has('REPO')) {
        console.error(
          'Did you forget to pass --github-repository to substitute the OWNER and REPO variables?'
        );
      }
      if (e.unsubstituted.has('TAG')) {
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
    } else {
      throw e;
    }

    process.exit(1);
  }

  private prettyPrintEntryFiles(
    localRegistry: string,
    moduleName: string,
    moduleVersion: string
  ) {
    const metadata = new MetadataFile(
      path.join(localRegistry, 'modules', moduleName, 'metadata.json')
    );

    const entryTree = treeNodeCli(
      path.join(localRegistry, 'modules', moduleName),
      {
        exclude: metadata.versions
          .filter((v) => v !== moduleVersion)
          .map((v) => new RegExp(v.replaceAll('.', '\\.'))),
      }
    );

    console.error('Entry files created or modified in');
    console.error(
      chalk.blue(
        `${path.join(localRegistry, 'modules')}${path.sep}${entryTree}`
      )
    );
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
