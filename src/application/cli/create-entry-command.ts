import { Injectable } from '@nestjs/common';
import path from 'path';
import { ArgumentsCamelCase } from 'yargs';

import {
  Configuration,
  MissingConfigurationFileError,
} from '../../domain/configuration.js';
import { CreateEntryArgs } from './yargs.js';

@Injectable()
export class CreateEntryCommand {
  public async handle(_args: ArgumentsCamelCase<CreateEntryArgs>) {
    this.loadConfiguration(_args.templatesDir);

    return Promise.resolve(null);
  }

  private loadConfiguration(templatesDir: string): Configuration {
    const filepaths = [
      path.join(templatesDir, 'config.yml'),
      path.join(templatesDir, 'config.yaml'),
    ];
    for (const filepath of filepaths) {
      try {
        return Configuration.fromFile(filepath);
      } catch (e) {
        if (e instanceof MissingConfigurationFileError) {
          continue;
        }
        throw e;
      }
    }

    // No configuration files at the expected paths. Load the defaults.
    console.error('No configuration file found; using defaults');
    return Configuration.defaults();
  }
}
