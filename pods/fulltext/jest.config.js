module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '\\.bench\\.[jt]sx?$'],
  roots: ['./src'],
  coverageReporters: ['text-summary', 'html']
}
