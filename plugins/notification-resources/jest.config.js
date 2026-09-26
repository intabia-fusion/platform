const SVELTE_MOCKS_PATH = '<rootDir>/../../packages/presentation/src/__mocks__'

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  roots: ['./src'],
  // Svelte ships ESM, which jest does not transform - the shared mocks stand in for it.
  moduleNameMapper: {
    '^svelte/store$': `${SVELTE_MOCKS_PATH}/svelte-store.ts`,
    '^svelte/transition$': `${SVELTE_MOCKS_PATH}/svelte-transition.ts`,
    '^svelte/animate$': `${SVELTE_MOCKS_PATH}/svelte-animate.ts`,
    '^svelte$': `${SVELTE_MOCKS_PATH}/svelte.ts`,
    '\\.svelte$': `${SVELTE_MOCKS_PATH}/svelte-component.ts`
  },
  coverageReporters: ['text-summary', 'html']
}
