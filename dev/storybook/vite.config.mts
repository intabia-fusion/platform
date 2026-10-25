//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { workspaceSources } from '@hcengineering/platform-rig/profiles/ui/vite.mjs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, statSync } from 'node:fs'
import { defineConfig, transformWithEsbuild, type Plugin, type Rollup } from 'vite'

import { platformIcons } from './scripts/platform-icons.mjs'

const emojibaseShim = fileURLToPath(new URL('./src/shims/emojibase.ts', import.meta.url))
const emojibaseReal = join(
  dirname(createRequire(new URL('../../plugins/emoji/package.json', import.meta.url)).resolve('emojibase/package.json')),
  'esm/index.js'
)

// The lexer installed next to vite: this package does not depend on it itself.
interface Lexer {
  init: Promise<void>
  parse: (code: string) => readonly [Array<{ n?: string, ss: number, se: number }>, Array<{ n: string }>]
}
const lexer: Lexer = createRequire(createRequire(import.meta.url).resolve('vite'))('es-module-lexer')

/**
 * Drops imports of names a module does not export: components import types without `type`, which native ESM rejects.
 */
function typeOnlyImports (): Plugin {
  const named = /import\s+(?:([\w$]+)\s*,\s*)?\{([^}]*)\}\s*from\s*(["'])([^"']+)\3;?/g
  const cache = new Map<string, Promise<Set<string> | undefined>>()

  // `undefined` keeps the imports as they are: a file that fails to parse, or a cycle of `export *`.
  async function exportsOf (
    ctx: Rollup.PluginContext,
    file: string,
    visiting: Set<string> = new Set()
  ): Promise<Set<string> | undefined> {
    if (!file.endsWith('.ts') || visiting.has(file)) return undefined
    // By modification time: an edited index gains exports the cached list lacks.
    const key = `${file}:${statSync(file).mtimeMs}`
    let known = cache.get(key)
    if (known == null) {
      const inner = new Set(visiting).add(file)
      known = (async () => {
        try {
          const js = (await transformWithEsbuild(readFileSync(file, 'utf-8'), file, { loader: 'ts' })).code
          await lexer.init
          const [imports, exports] = lexer.parse(js)
          const names = new Set<string>(exports.map((it) => it.n))
          for (const it of imports) {
            if (it.n == null || !/^export\s*\*\s*from/.test(js.slice(it.ss, it.se))) continue
            const target = await ctx.resolve(it.n, file)
            const more = target != null ? await exportsOf(ctx, target.id, inner) : undefined
            if (more == null) return undefined
            more.forEach((name) => names.add(name))
          }
          return names
        } catch {
          return undefined
        }
      })()
      cache.set(key, known)
    }
    return await known
  }

  return {
    name: 'type-only-imports',
    enforce: 'post',
    async transform (code, id) {
      if (!id.endsWith('.svelte')) return null
      const edits: Array<[string, string]> = []
      for (const match of code.matchAll(named)) {
        const [whole, def, names, q, src] = match
        if (!(src.startsWith('@hcengineering/') || src.startsWith('.')) || src.endsWith('.svelte')) continue
        const target = await this.resolve(src, id)
        const exported = target != null ? await exportsOf(this, target.id) : undefined
        if (exported == null) continue
        const specs = names.split(',').map((it) => it.trim()).filter((it) => it !== '')
        const kept = specs.filter((it) => exported.has(it.split(/\s+as\s+/)[0].trim()))
        if (kept.length === specs.length) continue
        const parts = [def, kept.length > 0 ? `{ ${kept.join(', ')} }` : undefined].filter((it) => it != null)
        edits.push([whole, parts.length > 0 ? `import ${parts.join(', ')} from ${q}${src}${q};` : `import ${q}${src}${q};`])
      }
      if (edits.length === 0) return null
      let out = code
      // A function: `$&` in a name would be read as a pattern in a replacement string.
      for (const [from, to] of edits) out = out.replace(from, () => to)
      return { code: out, map: null }
    }
  }
}

/** Requests under /__hang never answer, to show a loading file or picture. */
function hangingRequests (): Plugin {
  return {
    name: 'hanging-requests',
    configureServer (server) {
      server.middlewares.use('/__hang', () => {})
    }
  }
}

export default defineConfig({
  plugins: [
    {
      name: 'emojibase-shim',
      enforce: 'pre',
      resolveId: (id) => (id === 'emojibase' ? emojibaseShim : id === 'emojibase-real' ? emojibaseReal : null)
    },
    workspaceSources(),
    svelte(),
    typeOnlyImports(),
    hangingRequests(),
    platformIcons(fileURLToPath(new URL('../..', import.meta.url)))
  ],
  // Without the browser condition svelte resolves to its SSR runtime, where onMount never fires.
  resolve: { conditions: ['browser'] }
})
