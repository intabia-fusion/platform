import { workspaceSources } from '@hcengineering/platform-rig/profiles/ui/vite.mjs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [workspaceSources(), svelte({ hot: false })],
  // Without the browser condition svelte resolves to its SSR runtime, where onMount never fires.
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      experimentalAstAwareRemapping: true,
      reporter: ['text-summary', 'json'],
      include: ['src/**/*.{ts,svelte}'],
      exclude: ['src/__tests__/**']
    }
  }
})
