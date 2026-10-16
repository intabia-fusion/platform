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

import { existsSync, readFileSync, realpathSync } from 'fs'
import { dirname, join } from 'path'

function findPackageJson (id, fromDir) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', id, 'package.json')
    if (existsSync(candidate)) return candidate
    if (dirname(dir) === dir) return undefined
  }
}

/**
 * Vite plugin: resolves a bare `@hcengineering/<name>` import to the package's TypeScript sources
 * (`svelte` field, else a TypeScript `main`). Vite refuses raw TypeScript as a package entry, and the
 * CommonJS `lib/` is not converted outside node_modules.
 */
export function workspaceSources () {
  return {
    name: 'workspace-ts-entry',
    enforce: 'pre',
    resolveId (id, importer) {
      if (!id.startsWith('@hcengineering/') || id.split('/').length !== 2) return null
      const pkgJson = findPackageJson(id, importer !== undefined ? dirname(importer) : process.cwd())
      if (pkgJson === undefined) return null
      const { svelte, main } = JSON.parse(readFileSync(pkgJson, 'utf-8'))
      const source = [svelte, main].find((field) => typeof field === 'string' && field.endsWith('.ts'))
      if (source === undefined) return null
      const entry = join(dirname(realpathSync(pkgJson)), source)
      return existsSync(entry) ? entry : null
    }
  }
}
