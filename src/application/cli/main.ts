import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { CreateEntryCommand } from './create-entry-command.js';
import { createParser } from './yargs.js';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const createEntryCommand = app.get(CreateEntryCommand);
  const parser = createParser(createEntryCommand);

  try {
    await parser.parse();
  } catch (err) {
    console.error(`${err.message}\n ${await parser.getHelp()}`);
  }

  await app.close();
}

(async () => {
  await main();
})();
