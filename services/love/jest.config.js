module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  roots: ['./src'],
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  coverageReporters: ['text-summary', 'html']
}
