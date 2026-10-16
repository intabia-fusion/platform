import { workspaceSources } from '@hcengineering/platform-rig/profiles/ui/vite.mjs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [workspaceSources(), svelte({ hot: false })],
  // Without the browser condition svelte resolves to its SSR runtime, where onMount never fires.
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/__test__/setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      // v8 is ~3.5x cheaper than istanbul here; AST-aware remapping keeps .svelte numbers honest
      // (without it, components that were only imported show up as covered).
      provider: 'v8',
      experimentalAstAwareRemapping: true,
      reporter: ['text-summary', 'json'],
      include: ['src/**/*.{ts,svelte}'],
      exclude: ['src/__test__/**']
    }
  }
})
