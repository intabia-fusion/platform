module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)bench.[jt]s?(x)'],
  roots: ['./src'],
  coverageReporters: ['text-summary', 'html'],
  testTimeout: 600000
}
