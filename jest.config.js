/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

export default {
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // The root directory that Jest should scan for tests and modules within.
  rootDir: "build",

  // A list of paths to directories that Jest should use to search for files in.
  roots: ["src", "e2e"],

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: ["./jest.setup.js"],

  // The path to a module that can resolve test<->snapshot path.
  snapshotResolver: "./jest-snapshot-resolver.js",

  // A map from regular expressions to paths to transformers
  transform: {
    "\\.js$": "babel-jest",
  },
};
