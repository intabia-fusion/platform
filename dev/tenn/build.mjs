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

// Design as code for Tenniarb: runs the screen scripts of dev/design (listed in dev/design/design.json) and the library
// definitions on the kit, and writes the library, the application files, the design task files and PlatformDesign.tenn. See README.md.
// Usage: node dev/tenn/build.mjs [lib|screens] [--file <part of a design.json name or of an application name>] [--out <dir>] [--root <dir>] [--theme light] [--no-check] [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { here, repo, TOKENS, DEMO, buildIcons, kitSource, AsyncFunction, newHost } from './env.mjs'
import { createEmitter } from './emit.mjs'
import { nameArg, printCmd } from './print.mjs'
import { SOURCE, placeFrames, appFile } from './apps.mjs'

const T_START = Date.now()
const THEMES = ['light'] // dark is not emitted until the theme design is decided; emit.mjs resolves colors for any mode

const args = process.argv.slice(2)
const flag = (name) => (args.indexOf(name) >= 0 ? (args.splice(args.indexOf(name), 1), true) : false)
const option = (name) => (args.indexOf(name) >= 0 ? args.splice(args.indexOf(name), 2)[1] : undefined)
const noCheck = flag('--no-check')
const force = flag('--force')
const designPath = resolve(option('--design') ?? join(repo, 'dev/design/design.json'))
const fileArg = option('--file')
const outDir = resolve(option('--out') ?? join(repo, 'dev/design/tenn'))
// PlatformDesign.tenn mounts the library and the screen files by paths relative to itself
const rootDir = resolve(option('--root') ?? repo)
const theme = option('--theme') ?? 'light'
const only = args[0]
if (!THEMES.includes(theme)) throw new Error(`--theme ${theme}: only ${THEMES.join(', ')} is built for now`)
if (only !== undefined && only !== 'lib' && only !== 'screens') throw new Error(`unknown target "${only}", use lib or screens`)

const design = JSON.parse(readFileSync(designPath, 'utf8'))
const designDir = dirname(designPath)
const hasScreens = (f) => (f.build ?? []).some((s) => s.some((p) => p.startsWith('screens/')))
const screenFiles = design.files.filter(hasScreens)
// The source file is placed by application (apps.mjs), every other screen file is a design task and stays a file of its own
const sourceFile = screenFiles.find((f) => f.name === SOURCE)
if (sourceFile === undefined) throw new Error(`No "${SOURCE}" in design.json`)
const taskFiles = screenFiles.filter((f) => f !== sourceFile)
const matches = (name) => fileArg === undefined || name.toLowerCase().includes(fileArg.toLowerCase())
const wanted = taskFiles.filter((f) => matches(f.name))
// The output name is the folder of the screen scripts: screens/fusio-1613 -> fusio-1613.tenn
const tennName = (f) => basename(dirname(f.build[0].find((p) => p.startsWith('screens/'))))

// ---- Scripts: the kit first, then the scripts of one build step (screens) or the library definitions ----
const host = newHost()
const icons = buildIcons()
async function runScripts (files) {
  const body = kitSource + '\n' + files.map((f) => readFileSync(f, 'utf8')).join('\n')
  await new AsyncFunction('TOKENS', 'DEMO', 'ICONS', 'host', body)(TOKENS, DEMO, icons, host)
}
const t0 = Date.now()
// Every screen file runs, whatever --file says: the components and icons its screens use go into the library
const pagesOf = new Map()
for (const f of screenFiles) {
  host.pages = new Map()
  for (const step of f.build) await runScripts(step.map((p) => resolve(designDir, p)))
  pagesOf.set(f, host.pages)
}
await runScripts([join(here, 'library/ui-kit.js')])
const tScripts = Date.now() - t0

const emitter = createEmitter(host, TOKENS, theme)
const written = []
const libs = emitter.libs
// A part (library, application or task file) mounts no library: it names `entry`, the document that does
const entryPath = join(rootDir, 'PlatformDesign.tenn')
const statePath = join(here, '.state.json')
const sha = (data) => createHash('sha1').update(data).digest('hex')
let state = {}
try { state = JSON.parse(readFileSync(statePath, 'utf8')) } catch {}
let stateChanged = false
const write = (dir, rel, text, isEntry = false) => {
  const file = join(dir, rel)
  mkdirSync(dirname(file), { recursive: true })
  const body = isEntry ? text : `entry "${relative(dirname(file), entryPath).split('\\').join('/')}"\n${text}`
  const previous = existsSync(file) ? readFileSync(file) : undefined
  if (!isEntry && !force && previous !== undefined) {
    const rec = state[file]
    if ((rec !== undefined && sha(previous) !== rec.out) || (rec === undefined && !previous.equals(Buffer.from(body)))) {
      written.push(file)
      console.log(`${relative(repo, file)}: skipped, manual changes (use --force to overwrite)`)
      return
    }
  }
  if (previous === undefined || !previous.equals(Buffer.from(body))) writeFileSync(file, body)
  if (!isEntry && !file.startsWith(tmpdir())) {
    state[file] = { out: sha(body) }
    stateChanged = true
  }
  written.push(file)
  console.log(`${relative(repo, file)}: ${(Buffer.byteLength(body) / 1024).toFixed(0)} KB`)
}

const t1 = Date.now()
if (only === undefined || only === 'lib') {
  const lib = emitter.library()
  for (const f of lib.files) write(outDir, f.path, f.text)
  console.log(`canvas: ${Object.entries(lib.canvas).map(([c, v]) => `${c} ${v.w}x${v.h}`).join(', ')}`)
  console.log(`library: ${host.components.length} components in ${emitter.categories.size} categories`)
}
const apps = placeFrames(pagesOf.get(sourceFile))
const wantedApps = apps.filter((a) => matches(a.name))
if (only !== 'lib' && wanted.length === 0 && wantedApps.length === 0) {
  throw new Error(`No screen file or application "${fileArg}": ${[...taskFiles.map((f) => f.name), ...apps.map((a) => a.name)].join(', ')}`)
}
if (only === undefined || only === 'screens') {
  for (const a of wantedApps) {
    write(outDir, appFile(a.name), emitter.app(a.categories))
    console.log(`  ${a.name}: ${a.categories.map((c) => `${c.name} (${c.frames.length})`).join(', ')}`)
  }
  for (const f of wanted) {
    write(outDir, tennName(f) + '.tenn', emitter.screens(pagesOf.get(f)))
    console.log(`  ${f.name}: ${[...pagesOf.get(f)].map(([p, fr]) => `${p} (${fr.length})`).join(', ')}`)
  }
}
// The root document keeps hand-added library and task mounts while the generated mounts are refreshed.
const rel = (file) => relative(rootDir, join(outDir, file)).split('\\').join('/')
const mount = (name, file) => ({ kind: 'mount', name, file: rel(file) })
const mountKey = (m) => m.name + '\0' + m.file
const libraryMounts = libs.map((l) => mount(l.name, l.file))
const appMounts = apps.map((a) => mount(a.name, appFile(a.name)))
const taskMounts = taskFiles.map((f) => mount(f.name, tennName(f) + '.tenn'))
const knownMounts = new Set([...libraryMounts, ...appMounts, ...taskMounts].map(mountKey))
const manual = { root: [], libraries: [], tasks: [] }
let inLibraries = false
let inTasks = false
if (existsSync(entryPath)) {
  for (const line of readFileSync(entryPath, 'utf8').split('\n')) {
    if (line === 'element Libraries {') inLibraries = true
    if (line === 'element Tasks {') inTasks = true
    const m = line.match(/^(\t*)element\s+("[^"]*"|\S+)\s+--from-file\s+"([^"]+)"\s*$/)
    if (m && !knownMounts.has(mountKey({ name: m[2].startsWith('"') ? JSON.parse(m[2]) : m[2], file: m[3] }))) {
      const item = { kind: 'mount', name: m[2].startsWith('"') ? JSON.parse(m[2]) : m[2], file: m[3] }
      if (inTasks) manual.tasks.push(item)
      else if (inLibraries) manual.libraries.push(item)
      else if (m[1].length === 0) manual.root.push(item)
    }
    if (line === '}') {
      inLibraries = false
      inTasks = false
    }
  }
}
const rootCmds = [
  { kind: 'element', name: 'Libraries', kids: [...libraryMounts, ...manual.libraries, ...manual.root] },
  ...appMounts,
  { kind: 'element', name: 'Tasks', kids: [...taskMounts, ...manual.tasks] }
]
const rootText = []
for (const c of rootCmds) printCmd(c, 0, rootText)
write(rootDir, 'PlatformDesign.tenn', rootText.join('\n') + '\n', true)
if (stateChanged) {
  for (const file of Object.keys(state)) if (!existsSync(file)) delete state[file]
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
}
const tEmit = Date.now() - t1

const stat = Object.entries(host.stats ?? {}).map(([k, v]) => `${k} ${v.instances}/${v.drawn}`).join(', ')
console.log(`instances/drawn: ${stat}`)
const lost = Object.entries(emitter.warnings).map(([k, v]) => `${k} ${v}`).join(', ')
if (lost !== '') console.log(`not expressed in .tenn: ${lost}`)

// ---- Check: tenniarb check on every written file; without tenniarb in PATH the step is skipped ----
let failed = false
if (!noCheck) {
  const r = spawnSync('tenniarb', ['check', '-root', rootDir, ...written], { encoding: 'utf8', cwd: rootDir })
  if (r.error?.code === 'ENOENT') console.log('check skipped: tenniarb is not in PATH')
  else {
    process.stdout.write(r.stdout ?? '')
    process.stderr.write(r.stderr ?? '')
    failed = r.status !== 0
  }
}
console.log(`scripts ${tScripts} ms, emit ${tEmit} ms, total ${((Date.now() - T_START) / 1000).toFixed(1)}s`)
if (failed) process.exit(1)
