import { Injectable } from '@nestjs/common';
import { ArgumentsCamelCase } from 'yargs';

import { CreateEntryArgs } from './yargs.js';

@Injectable()
export class CreateEntryCommand {
  public async handle(_args: ArgumentsCamelCase<CreateEntryArgs>) {
    return Promise.resolve(null);
  }
}
