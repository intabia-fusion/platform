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

// Shared by build.mjs and import.mjs: tokens, demo data, icons and the source of the pen kit
// (the Penpot kit files plus the pen backend), which both run on a pen host. See README.md.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

export const here = dirname(fileURLToPath(import.meta.url))
export const repo = resolve(here, '../..')
// PENPOT_KIT_DIR pins the kit to a copy (tests that must not follow edits in progress)
export const penpotKit = process.env.PENPOT_KIT_DIR ?? join(repo, 'dev/design/kit')

// Tokens and demo data are generated for Penpot as `const X = {json}`; the JSON is reused as is
const loadJson = (file) => { const s = readFileSync(join(penpotKit, file), 'utf8'); return JSON.parse(s.slice(s.indexOf('{'))) }
export const TOKENS = loadJson('00-tokens.generated.js')
export const DEMO = loadJson('05-demo.generated.js')

// ---- Icons: the sources of dev/penpot/penpot.mjs buildIcons, flattened to one path ----
const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
const circle = (cx, cy, r) => `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`
const rect = (x, y, w, h, r) => r > 0
  ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  : `M${x} ${y}H${x + w}V${y + h}H${x}Z`
// Returns { d, sw? }: sw is the stroke width of a line icon
function flatten (body, defaultStroke) {
  let d = ''
  let sw
  for (const m of body.matchAll(/<(path|circle|rect|polygon)\s([^>]*?)\/?>/g)) {
    const a = attrs(m[2])
    if (m[1] === 'path') d += a.d
    else if (m[1] === 'polygon') d += 'M' + a.points.trim().split(/[\s,]+/).reduce((o, v, i) => o + (i % 2 ? ',' : i ? ' L' : '') + v, '') + 'Z'
    else if (m[1] === 'circle') d += circle(+a.cx, +a.cy, +a.r)
    else d += rect(+(a.x ?? 0), +(a.y ?? 0), +a.width, +a.height, +(a.rx ?? 0))
    if (defaultStroke !== undefined || (a.stroke !== undefined && a.fill === 'none')) sw = +(a['stroke-width'] ?? defaultStroke ?? 1)
  }
  return { d, ...(sw !== undefined ? { sw } : {}) }
}
const viewBoxOf = (s) => (s.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 16 16').split(/[\s,]+/).map(Number)
const cleanSvg = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim()

export function buildIcons () {
  const icons = {}
  const plugins = join(repo, 'plugins')
  for (const dir of readdirSync(plugins).filter((it) => it.endsWith('-assets') && existsSync(join(plugins, it, 'assets')))) {
    const ns = dir.slice(0, -'-assets'.length)
    for (const f of readdirSync(join(plugins, dir, 'assets')).filter((it) => it.endsWith('.svg'))) {
      for (const m of readFileSync(join(plugins, dir, 'assets', f), 'utf8').matchAll(/<symbol([^>]*)>([\s\S]*?)<\/symbol>/g)) {
        const id = m[1].match(/id="([^"]+)"/)?.[1]
        // A sprite may repeat an id (tracker `issues`): the browser takes the first symbol
        if (id !== undefined) icons[`${ns}/${id}`] ??= { vb: viewBoxOf(m[1]), ...flatten(cleanSvg(m[2])) }
      }
    }
  }
  const svelteDirs = [['ui', join(repo, 'packages/ui/src/components/icons')], ['ui-internal', join(repo, 'packages/ui/src/components/internal/icons')]]
  for (const dir of readdirSync(plugins).filter((it) => it.endsWith('-resources'))) svelteDirs.push([dir.slice(0, -'-resources'.length), join(plugins, dir, 'src/components/icons')])
  for (const [ns, dir] of svelteDirs) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((it) => it.endsWith('.svelte'))) {
      const svg = readFileSync(join(dir, f), 'utf8').match(/<svg([^>]*)>([\s\S]*?)<\/svg>/)
      if (svg === null || /\{(?!fill\})[^}]*\}/.test(svg[2])) continue
      icons[`${ns}/${f.slice(0, -'.svelte'.length)}`] ??= { vb: viewBoxOf(svg[1]), ...flatten(cleanSvg(svg[2].replace(/\{fill\}/g, 'currentColor'))) }
    }
  }
  // Hand-drawn 16px line icons (chips, tools) live in the Penpot kit as `kit.I`; reuse them
  const core = readFileSync(join(penpotKit, '10-core.js'), 'utf8')
  const lines = vm.runInNewContext('({' + core.match(/kit\.I = \{([\s\S]*?)\n\}/)[1] + '})')
  for (const [name, body] of Object.entries(lines)) icons[name] = { vb: [0, 0, 16, 16], ...flatten(body, 1.3) }
  return icons
}


// ---- Scripts: Penpot kit files plus the pen core and atoms ----
export const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
export const kitFiles = [join(here, 'kit/10-core.js'), ...['20-atoms', '30-workbench', '40-tracker', '45-chat', '50-settings', '55-login'].map((f) => join(penpotKit, f + '.js')), join(here, 'kit/90-pen.js'), join(here, 'kit/95-library.js')]
export const kitSource = kitFiles.map((f) => readFileSync(f, 'utf8')).join('\n')

export const newHost = () => ({ seq: 0, tokens: new Set(), pages: new Map(), page: null, components: [], icons: new Set() })
