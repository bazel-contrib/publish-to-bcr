import { Injectable } from '@nestjs/common';
import path from 'path';
import { ArgumentsCamelCase } from 'yargs';

import { CreateEntryService } from '../../domain/create-entry.js';
import { MetadataFile } from '../../domain/metadata-file.js';
import { Repository } from '../../domain/repository.js';
import {
  SourceTemplate,
  SubstitutableVar,
} from '../../domain/source-template.js';
import { CreateEntryArgs } from './yargs.js';

@Injectable()
export class CreateEntryCommand {
  constructor(private readonly createEntryService: CreateEntryService) {}

  public async handle(args: ArgumentsCamelCase<CreateEntryArgs>) {
    const metadataTemplate = new MetadataFile(
      path.join(args.templatesDir, 'metadata.template.json')
    );
    const sourceTemplate = new SourceTemplate(
      path.join(args.templatesDir, 'source.template.json')
    );
    const presubmitPath = path.join(args.templatesDir, 'presubmit.yml');
    const patchesPath = path.join(args.templatesDir, 'patches');

    sourceTemplate.substitute({
      ...ghRepoSubstitutions(args.githubRepository),
      ...(args.tag ? { TAG: args.tag } : {}),
      VERSION: args.moduleVersion,
    });

    const { moduleName } = await this.createEntryService.createEntryFiles(
      metadataTemplate,
      sourceTemplate,
      presubmitPath,
      patchesPath,
      args.localRegistry,
      args.moduleVersion
    );

    console.error(
      `Created entry for ${moduleName}@${args.moduleVersion} at ${args.localRegistry}`
    );

    return Promise.resolve(null);
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
