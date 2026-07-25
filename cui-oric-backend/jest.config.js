/**
 * Jest Configuration
 */

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  maxWorkers: 1,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/app.js',
    '!src/server.js',
    '!src/utils/seed.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 60000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleFileExtensions: ['js', 'json'],
  transform: {},
  moduleNameMapper: {
    '^text-readability$': '<rootDir>/tests/__mocks__/text-readability.js',
    '^unified$': '<rootDir>/tests/__mocks__/unified.js',
    '^retext-english$': '<rootDir>/tests/__mocks__/retext-english.js',
    '^retext-passive$': '<rootDir>/tests/__mocks__/retext-passive.js',
    '^retext-stringify$': '<rootDir>/tests/__mocks__/retext-stringify.js',
    '^pdf-parse$': '<rootDir>/tests/__mocks__/pdf-parse.js',
    '^write-good$': '<rootDir>/tests/__mocks__/write-good.js',
  },
};