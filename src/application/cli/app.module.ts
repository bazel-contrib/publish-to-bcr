import { Module } from '@nestjs/common';

import { CreateEntryCommand } from './create-entry-command.js';

@Module({
  providers: [CreateEntryCommand],
})
export class AppModule {}
