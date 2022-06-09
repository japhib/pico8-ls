const TS_OVERRIDE = {
  files: [ '**/*.ts', '**/*.tsx' ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: [ './tsconfig.json', './client/tsconfig.json', './server/tsconfig.json' ],
  },
  plugins: [ '@typescript-eslint' ],
  extends: [
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/require-await': 'warn',
    '@typescript-eslint/restrict-plus-operands': 'off',
    '@typescript-eslint/no-this-alias': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/comma-dangle': [ 'error', 'always-multiline' ],
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/object-curly-spacing': [ 'error', 'always' ],
    '@typescript-eslint/quotes': [
      'error',
      'single',
    ],
    '@typescript-eslint/semi': [
      'error',
      'always',
    ],
    '@typescript-eslint/no-unused-vars': [ 'warn', {
      // Unused variables/args/caught errors that start with an underscore are fine
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    }],
  },
};

module.exports = {
  'env': {
    'browser': false,
    'commonjs': true,
    'es2021': true,
  },
  'extends': [ 'eslint:recommended' ],
  'overrides': [ TS_OVERRIDE ],
  'parserOptions': {
    'ecmaVersion': 12,
  },
  'globals': {
    'process': true,
  },
  'ignorePatterns': [ 'built/**/*.js' ],
  'rules': {
    'comma-dangle': [ 'error', 'always-multiline' ],
    'comma-style': [ 'error', 'last' ],
    'indent': [
      'error',
      2,
    ],
    'linebreak-style': [
      'error',
      'unix',
    ],
    'quotes': [ 'error', 'single' ],
    'semi': [
      'error',
      'always',
    ],
    'curly': [ 'error', 'all' ],
    'brace-style': [ 'error', '1tbs' ],
    'no-control-regex': 'off',
    'no-unused-vars': 'warn',
    'no-empty': 'warn',
    'no-trailing-spaces': 'warn',
    'no-constant-condition': 'off',
    'no-case-declarations': 'off',
    'object-curly-spacing': [ 'error', 'always' ],
    'array-bracket-spacing': [ 'error', 'always', { 'objectsInArrays': false, 'arraysInArrays': false }],
    'no-multiple-empty-lines': [ 'error', { max: 1 }],
    'eol-last': [ 'error', 'always' ],
    'comma-spacing': [ 'error', { 'before': false, 'after': true }],
  },
};
