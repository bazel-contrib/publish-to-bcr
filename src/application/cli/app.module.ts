import { Module } from '@nestjs/common';

import { CreateEntryService } from '../../domain/create-entry.js';
import { CreateEntryCommand } from './create-entry-command.js';

@Module({
  providers: [CreateEntryCommand, CreateEntryService],
})
export class AppModule {}
