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

// import.meta.glob typings; `types` is empty in this tsconfig
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="vite/client" />

import { addStringsLoader, setMetadata, type Asset, type Metadata, type Plugin } from '@hcengineering/platform'

import kitSprite from '../../../../packages/ui/assets/icons.svg?url'

// Plugin ids that differ from the package name.
const pluginIds: Record<string, string> = { 'test-management': 'testManagement', 'controlled-documents': 'documents' }
const pluginId = (pkg: string): string => pluginIds[pkg] ?? pkg

const sprites = import.meta.glob<string>('../../../../plugins/*-assets/assets/icons.svg', {
  query: '?url',
  import: 'default',
  eager: true
})
const sources = import.meta.glob<string>('../../../../plugins/*-assets/src/index.ts', {
  query: '?raw',
  import: 'default',
  eager: true
})
const langs = import.meta.glob<any>('../../../../plugins/*-assets/lang/*.json', { import: 'default' })

// Sprite fragment -> Asset, keyed 'package/fragment' in lower case: the names the design kit uses for product icons.
export const spriteAssets = new Map<string, Asset>()

const assetsDir = /plugins\/([^/]+)-assets\//

// Same ids the product registers with loadMetadata(plugin.icon, { Name: `${icons}#fragment` }), read from the assets packages.
function registerIcons (): void {
  for (const [file, source] of Object.entries(sources)) {
    const pkg = assetsDir.exec(file)?.[1]
    const sprite = sprites[file.replace('src/index.ts', 'assets/icons.svg')]
    if (pkg == null) continue
    const imports = new Map<string, string>()
    for (const m of source.matchAll(/import (\w+) from '@hcengineering\/([\w-]+)'/g)) imports.set(m[1], m[2])
    // Ids moved to the kit sprite: `const uiIcons = require('@hcengineering/ui/assets/icons.svg')`.
    const kitVars = new Set(
      [...source.matchAll(/const (\w+) = require\('@hcengineering\/ui\/assets\/icons\.svg'\)/g)].map((m) => m[1])
    )
    for (const block of source.matchAll(/loadMetadata\(\s*(\w+)\.icon,\s*\{([\s\S]*?)\n\}\)/g)) {
      const plugin = pluginId(imports.get(block[1]) ?? pkg)
      for (const entry of block[2].matchAll(/(\w+):\s*`\$\{(\w+)\}#([\w-]+)`/g)) {
        const [, name, from, fragment] = entry
        const kit = kitVars.has(from)
        // A package whose ids all moved to the kit has no sprite of its own.
        if (!kit && (from !== 'icons' || sprite == null)) continue
        setMetadata(`${plugin}:icon:${name}` as unknown as Metadata<string>, `${kit ? kitSprite : sprite}#${fragment}`)
        if (!kit) spriteAssets.set(`${pkg}/${fragment}`.toLowerCase(), `${plugin}:icon:${name}` as Asset)
      }
    }
  }
}

function registerStrings (): void {
  const byPackage = new Map<string, Record<string, () => Promise<any>>>()
  for (const [file, load] of Object.entries(langs)) {
    const m = /plugins\/([^/]+)-assets\/lang\/([\w-]+)\.json$/.exec(file)
    if (m === null) continue
    byPackage.set(m[1], { ...byPackage.get(m[1]), [m[2]]: load })
  }
  for (const [pkg, loaders] of byPackage) {
    if (loaders.en === undefined) continue
    addStringsLoader(pluginId(pkg) as Plugin, async (lang: string) => await (loaders[lang] ?? loaders.en)())
  }
}

registerIcons()
registerStrings()
