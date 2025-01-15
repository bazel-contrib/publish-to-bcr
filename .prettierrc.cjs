/* eslint-env node */

module.exports = {
  trailingComma: 'es5',
  tabWidth: 2,
  semi: true,
  singleQuote: true,
  overrides: [
    {
      files: ['**/*.tf', '**/*.yaml', '**/*.yml', '**/*.json'],
      options: {
        tabWidth: 2,
      },
    },
  ],
};
