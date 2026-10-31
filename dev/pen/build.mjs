#!/usr/bin/env node
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

// Design as code for pen.dev: runs the Penpot screen scripts (dev/design/screens, listed in dev/design/design.json; --file picks the file)
// on a pen backend of the kit and feeds the result to `pen interactive` (headless). See README.md.
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { here, repo, TOKENS, DEMO, buildIcons, kitSource, AsyncFunction, newHost } from './env.mjs'

const T_START = Date.now()
const pen = join(here, 'node_modules/.bin/pen')

// ---- Scripts: Penpot kit files plus the pen core and atoms, then the screen scripts ----
const args = process.argv.slice(2)
// --force: overwrite a .pen that was edited by hand and rebuild what looks unchanged
const force = args.includes('--force')
if (force) args.splice(args.indexOf('--force'), 1)
const option = (name) => (args.indexOf(name) >= 0 ? args.splice(args.indexOf(name), 2)[1] : undefined)
// --design <design.json>: another list of screen files, script paths are relative to its folder
const designPath = resolve(option('--design') ?? join(repo, 'dev/design/design.json'))
const penpotDir = dirname(designPath)
const host = newHost()
const icons = buildIcons()

// Same concatenation as `scriptCode` of dev/penpot/penpot.mjs: kit first, then the scripts of one build step
async function runScripts (files) {
  const t0 = Date.now()
  const body = kitSource + '\n' + files.map((f) => readFileSync(f, 'utf8')).join('\n')
  await new AsyncFunction('TOKENS', 'DEMO', 'ICONS', 'host', body)(TOKENS, DEMO, icons, host)
  return Date.now() - t0
}

// Build steps of the screen file: --file <name> (part of the name in design.json), by default the first file with screens
const design = JSON.parse(readFileSync(designPath, 'utf8'))
const fileArg = option('--file')
// The .pen files live in the tasks repository next to this one; PNG files are written only on request
const designs = resolve(option('--out') ?? join(repo, '../foundation-tasks/design'))
const pngArg = option('--png')
// --theme dark: top-level frames get theme {mode: dark}; for PNG checks, needs --out so that the real files stay untouched
const themeArg = option('--theme')
if (themeArg !== undefined && designs === resolve(repo, '../foundation-tasks/design')) throw new Error('--theme needs --out')
const pngRoot = pngArg === undefined ? undefined : resolve(pngArg)
const hasScreens = (f) => (f.build ?? []).some((s) => s.some((p) => p.startsWith('screens/')))
const screenFile = fileArg === undefined
  ? design.files.find(hasScreens)
  : design.files.filter(hasScreens).find((f) => f.name.toLowerCase().includes(fileArg.toLowerCase()))
if (screenFile === undefined) throw new Error(`No screen file "${fileArg}" in design.json: ${design.files.filter(hasScreens).map((f) => f.name).join(', ')}`)
const screensDir = dirname(screenFile.build[0].find((p) => p.startsWith('screens/')))
const steps = screenFile.build.map((s) => s.map((p) => resolve(penpotDir, p)))
const fileName = basename(screensDir)


// ---- pen session ----
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')
const session = readFileSync(join(here, 'session.js'), 'utf8')
const execute = (code) => `execute({ input: ${JSON.stringify(code)} })`
const payload = (trees, extra = {}) => `LIB = ${JSON.stringify(extra.lib ?? null)}\nTREES = ${JSON.stringify(trees.map((t) => JSON.stringify(t)))}\nINTO = ${JSON.stringify(extra.into ?? [])}\nPNG = ${extra.out !== undefined}\nOUT = ${JSON.stringify(extra.out ?? '')}\n`

function variables () {
  const v = {}
  const pair = (light, dark) => ({ type: 'color', value: [{ value: light, theme: { mode: 'light' } }, { value: dark ?? light, theme: { mode: 'dark' } }] })
  for (const n of host.tokens) v[n] = pair(TOKENS.colors.light[n], TOKENS.colors.dark[n])
  for (const n of Object.keys(TOKENS.palette.light)) {
    v['pal-' + n] = pair(TOKENS.palette.light[n], TOKENS.palette.dark[n])
    v['palbg-' + n] = pair(TOKENS.paletteBackground.light[n], TOKENS.paletteBackground.dark[n])
    v['palbge-' + n] = pair(TOKENS.paletteBackgroundEnd.light[n], TOKENS.paletteBackgroundEnd.dark[n])
    v['palt-' + n] = pair(TOKENS.paletteTitle.light[n], TOKENS.paletteTitle.dark[n])
  }
  return v
}

// pen gives random node ids, a random import alias and a random file token: renumber them so that a rebuild
// without design changes gives the same bytes. Ids of a library are never touched in a file that imports it.
function canonicalize (file) {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  const prefix = createHash('sha1').update(basename(file)).digest('hex').slice(0, 2)
  // Id from the node's name path, not its position: a component added to the library must not shift the ids
  // that hand-made files reference (ref and descendants keys)
  const aliases = Object.keys(doc.imports ?? {})
  const alias = (v) => aliases.reduce((r, a) => (r.startsWith(a + ':') ? 'F' + r.slice(a.length) : r.startsWith('$' + a + ':') ? '$F' + r.slice(a.length + 1) : r), v)
  const segment = (v) => (v.includes(':') ? alias(v) : own.get(v) ?? v)
  const own = new Map()
  const used = new Set()
  // descendants keys are pen ids, so their nodes get paths only after the ids they point to are renamed
  const later = []
  const idOf = (path) => {
    let id = prefix + createHash('sha1').update(path).digest('hex').slice(0, 8)
    for (let n = 1; used.has(id); n++) id = prefix + createHash('sha1').update(path + '#' + n).digest('hex').slice(0, 8)
    used.add(id)
    return id
  }
  const collect = (o, path) => {
    if (Array.isArray(o)) {
      const seen = new Map()
      for (const c of o) {
        if (c === null || typeof c !== 'object') continue
        const key = `${c.type ?? ''}:${c.name ?? ''}`
        const n = seen.get(key) ?? 0
        seen.set(key, n + 1)
        collect(c, `${path}/${key}#${n}`)
      }
    } else if (o !== null && typeof o === 'object') {
      // A component is keyed by its unique name alone, so moving it on the library canvas keeps its id
      if (o.reusable === true && typeof o.name === 'string') path = 'component:' + o.name
      if (typeof o.id === 'string' && typeof o.type === 'string' && !o.id.includes(':')) own.set(o.id, idOf(path))
      for (const [k, v] of Object.entries(o)) {
        if (k === 'descendants' && v !== null && typeof v === 'object') later.push([v, path])
        else if (v !== null && typeof v === 'object') collect(v, `${path}.${k}`)
      }
    }
  }
  collect(doc.children, '')
  while (later.length > 0) {
    const [map, path] = later.shift()
    for (const [key, v] of Object.entries(map)) collect(v, `${path}.descendants.${key.split('/').map(segment).join('/')}`)
  }
  const walk = (o) => {
    if (Array.isArray(o)) return o.map(walk)
    if (o === null || typeof o !== 'object') return typeof o === 'string' ? alias(o) : o
    const r = {}
    for (const [k, v] of Object.entries(o)) {
      if (k === 'id' && typeof v === 'string' && own.has(v)) r.id = own.get(v)
      else if (k === 'ref' && typeof v === 'string') r.ref = segment(v)
      else if (k === 'descendants') r.descendants = Object.fromEntries(Object.entries(v).map(([key, val]) => [key.split('/').map(segment).join('/'), walk(val)]))
      else if (k === 'imports') r.imports = Object.fromEntries(Object.entries(v).map(([, val]) => ['F', val]))
      else r[k] = walk(v)
    }
    return r
  }
  const out = walk(doc)
  const h = createHash('sha1').update('fileToken:' + basename(file)).digest('hex')
  out.fileToken = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
  writeFileSync(file, JSON.stringify(out, null, 2))
}

const stats = { executes: 0, sessions: [] }
function run (out, commands, label) {
  const t0 = Date.now()
  const r = spawnSync(pen, ['interactive', '--out', out], { input: [...commands, 'save()', 'exit()'].join('\n') + '\n', encoding: 'utf8', timeout: 170000, maxBuffer: 1 << 28, cwd: here })
  const text = strip(r.stdout ?? '') + (r.stderr ?? '')
  stats.executes += commands.filter((c) => c.startsWith('execute(')).length
  if (process.env.PEN_LOG) writeFileSync(process.env.PEN_LOG, text)
  if (r.error !== undefined || /\[ERROR\]|Failure during|Error:/.test(text)) {
    console.error(text.split('\n').filter((l) => /ERROR|Error|rolled back|^- |Invalid|\bat .*\//.test(l) && !/^\s+at /.test(l)).slice(0, 14).join('\n'))
    throw new Error(`${label}: pen failed${r.error !== undefined ? ' (' + r.error.message + ')' : ''}`)
  }
  for (const m of text.matchAll(/## issues detected\n([\s\S]*?)\n\n/g)) console.log(`${label} warnings:\n${m[1].split('\n').slice(0, 6).join('\n')}`)
  canonicalize(out)
  const ms = Date.now() - t0
  const size = statSync(out).size
  stats.sessions.push({ label, ms, kb: Math.round(size / 1024) })
  console.log(`${label}: ${(ms / 1000).toFixed(1)}s, ${(size / 1024).toFixed(0)} KB`)
  return text
}

// PNG files come named by node id, in the order of the exported frames
function collect (text, dir, names) {
  const files = [...text.matchAll(/Exported (\S+\.png)/g)].map((m) => m[1])
  if (files.length !== names.length) throw new Error(`exported ${files.length} png, expected ${names.length}`)
  mkdirSync(dir, { recursive: true })
  files.forEach((f, i) => renameSync(f, join(dir, names[i] + '.png')))
}
const slug = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')

mkdirSync(designs, { recursive: true })
const only = args[0]

// ---- Overwrite guard: .state.json keeps, per .pen, the hash of the bytes this script wrote and of its inputs ----
const statePath = join(here, '.state.json')
const sha = (data) => createHash('sha1').update(data).digest('hex')
const fileSha = (f) => sha(readFileSync(f))
let state = {}
try { state = JSON.parse(readFileSync(statePath, 'utf8')) } catch {}
// A file edited since the last build is somebody's work: stop before anything is removed
function guard (file) {
  const rec = state[file]
  if (force || rec === undefined || !existsSync(file) || fileSha(file) === rec.out) return
  console.error(`${file} was changed after the last build (hash differs from .state.json). Not overwriting; use --force to replace it.`)
  process.exit(1)
}
const unchanged = (file, inputs) => !force && pngRoot === undefined && state[file]?.inputs === inputs && existsSync(file) && fileSha(file) === state[file].out
function remember (file, inputs) {
  // Builds of the tests go to a temp folder and are not tracked
  if (file.startsWith(tmpdir())) return
  state[file] = { out: fileSha(file), inputs }
  for (const k of Object.keys(state)) if (!existsSync(k)) delete state[k]
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
}
const targets = [...(only === undefined || only === 'lib' ? [join(designs, 'ui-kit.lib.pen')] : []), ...(only === undefined || only === 'screens' ? [join(designs, fileName + '.pen')] : [])]
targets.forEach(guard)
const times = []

// Scripts always run: the tokens and icons they use decide the variables and components of the library
for (const s of steps) times.push([s.at(-1).replace(penpotDir + '/', ''), await runScripts(s)])
// The other screen files add their tokens and icons to the library; their pages are dropped
const pages = host.pages
for (const f of design.files.filter((it) => it !== screenFile && hasScreens(it))) {
  host.pages = new Map()
  for (const s of f.build) await runScripts(s.map((p) => resolve(penpotDir, p)))
}
host.pages = pages
times.push(['library/ui-kit.js', await runScripts([join(here, 'library/ui-kit.js')])])
console.log(times.map(([n, ms]) => `  script ${n}: ${ms} ms`).join('\n'))

// The components a component draws on come first
function ordered (comps, jsons) {
  const byName = new Map(comps.map((c, i) => [c.name, i]))
  const seen = new Set()
  const out = []
  const visit = (i) => {
    if (seen.has(i)) return
    seen.add(i)
    for (const m of JSON.stringify(jsons[i]).matchAll(/§K:([^"]+)"/g)) visit(byName.get(m[1]))
    out.push(i)
  }
  comps.forEach((_, i) => visit(i))
  return out
}

const comps = host.components
const jsons = comps.map((c) => c.toLib(false))
// A frame per category, a section per group (the first two parts of the name)
const categories = []
for (const c of comps) {
  const [cat, sub] = c.name.split('/')
  let k = categories.find((it) => it.name === cat)
  if (k === undefined) categories.push(k = { name: cat, groups: [] })
  const gname = cat + '/' + (sub ?? '')
  let g = k.groups.find((it) => it.name === gname)
  if (g === undefined) k.groups.push(g = { name: gname, uikit: cat === 'Icon' ? undefined : (host.uikit?.[gname] ?? ''), names: [] })
  g.names.push(c.name)
}
const order = ordered(comps, jsons)
const penVersion = spawnSync(pen, ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? ''
const libInputs = sha(JSON.stringify([jsons, variables(), categories, order, penVersion]))

if (only === undefined || only === 'lib') {
  const lib = join(designs, 'ui-kit.lib.pen')
  if (unchanged(lib, libInputs)) console.log('library: unchanged')
  else {
    rmSync(lib, { force: true })
    const out = pngRoot === undefined ? undefined : join(pngRoot, '.export')
    if (out) rmSync(out, { recursive: true, force: true })
    const text = run(lib, [
      execute(`SetVariables(${JSON.stringify(variables())})\n` + payload([], { lib: categories }) + session),
      execute(payload(order.map((i) => jsons[i]), { into: order.map((i) => comps[i].name), out }) + session)
    ], 'ui-kit.lib.pen')
    if (out) { collect(text, pngRoot, categories.map((k) => 'ui-kit-' + k.name)); rmSync(out, { recursive: true, force: true }) }
    remember(lib, libInputs)
    console.log(`library: ${comps.length} components in ${categories.length} categories`)
  }
}

if (only === undefined || only === 'screens') {
  const out = join(designs, fileName + '.pen')
  const pngDir = pngRoot === undefined ? undefined : join(pngRoot, fileName)
  const exportDir = pngRoot === undefined ? undefined : join(pngRoot, '.export')
  // Pages are stacked on the one canvas, each under its title
  let y = 0
  const commands = [`import_library({ path: ${JSON.stringify(join(designs, 'ui-kit.lib.pen'))} })`]
  const names = []
  let n = 0
  for (const [page, frames] of host.pages) {
    const trees = [{ type: 'frame', name: 'Page: ' + page, x: 0, y, layout: 'horizontal', children: [{ type: 'text', name: 'title', content: page, fontFamily: 'IBM Plex Sans', fontSize: 56, fontWeight: '700', fill: '#1A1A1A' }] }]
    let bottom = 0
    for (const f of frames) {
      f.y += y + 140
      bottom = Math.max(bottom, f.y + f.h)
      trees.push(themeArg === undefined ? f.toPen('none', true) : { ...f.toPen('none', true), theme: { '§T:mode': themeArg } })
      names.push(`${String(++n).padStart(2, '0')}-${slug(f.name)}`)
    }
    commands.push(execute(payload(trees, { out: exportDir }) + session))
    y = bottom + 240
  }
  const inputs = sha(JSON.stringify([commands, libInputs]))
  if (unchanged(out, inputs)) console.log(`${fileName}.pen: unchanged`)
  else {
    rmSync(out, { force: true })
    if (pngDir) rmSync(pngDir, { recursive: true, force: true })
    if (exportDir) rmSync(exportDir, { recursive: true, force: true })
    const text = run(out, commands, fileName + '.pen')
    if (pngDir) { collect(text, pngDir, names); rmSync(exportDir, { recursive: true, force: true }) }
    remember(out, inputs)
    for (const m of text.matchAll(/(INSERT|EXPORT) (\d+)(?: wrapped (\d+))?/g)) console.log(`  pen ${m[1]} ${m[2]} ms${m[3] ? ', wrapped rows ' + m[3] : ''}`)
  }
}
const stat = Object.entries(host.stats).map(([k, v]) => `${k} ${v.instances}/${v.drawn}`).join(', ')
console.log(`instances/drawn: ${stat}`)
console.log(`total ${((Date.now() - T_START) / 1000).toFixed(1)}s, executes ${stats.executes}`)
