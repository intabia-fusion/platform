const SVELTE_MOCKS_PATH = '<rootDir>/../../packages/presentation/src/__mocks__'

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleNameMapper: {
    '^svelte/store$': `${SVELTE_MOCKS_PATH}/svelte-store.ts`,
    '^svelte/transition$': `${SVELTE_MOCKS_PATH}/svelte-transition.ts`,
    '^svelte/animate$': `${SVELTE_MOCKS_PATH}/svelte-animate.ts`,
    '^svelte$': `${SVELTE_MOCKS_PATH}/svelte.ts`,
    '\\.svelte$': `${SVELTE_MOCKS_PATH}/svelte-component.ts`
  }
}
