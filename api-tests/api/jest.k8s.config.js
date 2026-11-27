// The same suites against a local k3d/k3s api stand instead of the compose one:
// `api-test:k8s` drives the stand through src/stand-k8s.ts.
const config = require('./jest.config')

module.exports = {
  ...config,
  globalSetup: '<rootDir>/src/global-setup-k8s.ts',
  globalTeardown: '<rootDir>/src/global-teardown-k8s.ts'
}
