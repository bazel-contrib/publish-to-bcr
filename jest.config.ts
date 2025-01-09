/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

export default {
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module
  moduleNameMapper: {
    // We compile TypeScript to ES6 which requires extensions in module specifiers,
    // however adding the extension fails under jest tests. Remove the ".js" extension
    // from module names when running tests.
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  // An array of regexp pattern strings that are matched against all module paths before those paths are to be considered 'visible' to the module loader.
  modulePathIgnorePatterns: ["<rootDir>/dist"],

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: ["./jest.setup.ts"],

  // A map from regular expressions to paths to transformers
  transform: {
    "^.+\\.ts?$": "ts-jest",
  },
};
