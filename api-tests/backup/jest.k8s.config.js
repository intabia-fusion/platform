// The same suites against a local k3d/k3s api stand instead of the compose one:
// `backup-test:k8s` reuses the k8s stand driver compiled with @hcengineering/api-tests.
const config = require('./jest.config')

module.exports = {
  ...config,
  globalSetup: '<rootDir>/node_modules/@hcengineering/api-tests/lib/global-setup-k8s.js',
  globalTeardown: '<rootDir>/node_modules/@hcengineering/api-tests/lib/global-teardown-k8s.js'
}
