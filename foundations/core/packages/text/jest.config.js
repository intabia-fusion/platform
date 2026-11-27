module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testEnvironmentOptions: { customExportConditions: ['node', 'node-addons'] },
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  roots: ['./src'],
  coverageReporters: ['text-summary', 'html', 'lcov']
}
