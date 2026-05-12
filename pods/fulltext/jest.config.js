module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test|bench).[jt]s?(x)'],
  roots: ['./src'],
  coverageReporters: ['text-summary', 'html'],
  testTimeout: 600000
}
