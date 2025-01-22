/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

import path from 'path';

export default {
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: [
    path.join(
      process.env.TEST_SRCDIR,
      process.env.TEST_WORKSPACE,
      'jest.setup.js'
    ),
  ],

  // A map from regular expressions to paths to transformers
  transform: {
    '\\.js$': 'babel-jest',
  },
};
