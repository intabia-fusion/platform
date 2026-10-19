import { svelte } from '@sveltejs/vite-plugin-svelte'
import { existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, type Plugin } from 'vitest/config'

const here = dirname(fileURLToPath(import.meta.url))

// Workspace packages point `main` at raw TypeScript, which vite refuses as a package entry.
// Resolved from the importer: the board pulls ui and presentation, which pull packages kanban does not list.
function workspaceSources (): Plugin {
  return {
    name: 'workspace-ts-entry',
    enforce: 'pre',
    resolveId (id: string, importer?: string) {
      if (!id.startsWith('@hcengineering/') || id.split('/').length > 2) return null
      let pkgJson: string
      try {
        pkgJson = createRequire(importer ?? join(here, 'index.js')).resolve(`${id}/package.json`)
      } catch {
        return null
      }
      const main = JSON.parse(readFileSync(pkgJson, 'utf-8')).main
      if (typeof main !== 'string' || !main.endsWith('.ts')) return null
      const entry = join(dirname(pkgJson), main)
      return existsSync(entry) ? entry : null
    }
  }
}

export default defineConfig({
  plugins: [workspaceSources(), svelte({ hot: false })],
  // Without the browser condition svelte resolves to its SSR runtime, where onMount never fires.
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/__test__/setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      experimentalAstAwareRemapping: true,
      reporter: ['text-summary', 'json'],
      include: ['src/**/*.{ts,svelte}'],
      exclude: ['src/__test__/**']
    }
  }
})
