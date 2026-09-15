import { svelte } from '@sveltejs/vite-plugin-svelte'
import { existsSync, readFileSync, realpathSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, type Plugin } from 'vitest/config'

const here = dirname(fileURLToPath(import.meta.url))

// Workspace packages point `main`/`svelte` at raw TypeScript, which vite refuses as an entry,
// and a built package's `exports` would hand back its stale CJS bundle instead.
function findPkgJson (id: string, fromDir: string): string | undefined {
  let dir = fromDir
  for (;;) {
    const candidate = join(dir, 'node_modules', id, 'package.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function workspaceSources (): Plugin {
  return {
    name: 'workspace-ts-entry',
    enforce: 'pre',
    resolveId (id: string, importer?: string) {
      if (!id.startsWith('@hcengineering/')) return null
      const pkgJson =
        (importer !== undefined ? findPkgJson(id, dirname(importer)) : undefined) ?? findPkgJson(id, here)
      if (pkgJson === undefined) return null
      const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'))
      // `svelte` is a path in most packages but a version range in a few (@hcengineering/theme),
      // so it only wins when it actually names a source file.
      const src = [pkg.svelte, pkg.main].find((it) => typeof it === 'string' && it.endsWith('.ts'))
      if (src === undefined) return null
      const entry = join(dirname(realpathSync(pkgJson)), src)
      return existsSync(entry) ? entry : null
    }
  }
}

export default defineConfig({
  plugins: [workspaceSources(), svelte({ hot: false })],
  // Without the browser condition svelte resolves to its SSR runtime, where onMount never fires.
  resolve: { conditions: ['browser'] },
  test: {
    globals: true,
    environment: 'jsdom',
    // Workspace sources resolve to raw .ts outside this package; without inlining, vite-node
    // treats them as external CJS and `import plugin from ...` yields the namespace object.
    server: { deps: { inline: [/@hcengineering/] } },
    setupFiles: ['src/__test__/setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    // Mounting these components pulls in most of the ui graph - one file at a time keeps the
    // worker under control (a parallel run peaked around 4 Gb).
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } }
  }
})
