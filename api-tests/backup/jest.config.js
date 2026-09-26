module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  roots: ["./src"],
  coverageReporters: ["text-summary", "html"],
  // The api-tests stand; compiled with @hcengineering/api-tests
  globalSetup: '<rootDir>/node_modules/@hcengineering/api-tests/lib/global-setup.js',
  globalTeardown: '<rootDir>/node_modules/@hcengineering/api-tests/lib/global-teardown.js'
}
