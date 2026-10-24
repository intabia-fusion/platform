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

// Round trip: screens -> .pen (build.mjs) -> import.mjs -> script -> .pen -> compare with the first .pen.
// Run: node dev/pen/test/import.test.mjs [--keep <dir>] (needs `pen` signed in, about 1.5 minutes).
// The reference is built from the current screens in the same run, so edits of the kit do not break the comparison.
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { importPen } from '../import.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const build = join(here, '../build.mjs')
// PEN_TEST_DESIGN: another design.json for the reference build (a snapshot while the screens are being edited)
const designArg = process.env.PEN_TEST_DESIGN ? ['--design', process.env.PEN_TEST_DESIGN] : []
const keep = process.argv.indexOf('--keep') >= 0 ? process.argv[process.argv.indexOf('--keep') + 1] : undefined
const root = keep ?? mkdtempSync(join(tmpdir(), 'pen-import-'))
mkdirSync(root, { recursive: true })

const node = (args) => {
  const r = spawnSync('node', [build, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 })
  if (r.status !== 0) throw new Error(`build.mjs ${args.join(' ')} failed:\n${(r.stdout + r.stderr).split('\n').slice(-15).join('\n')}`)
}

// Node ids and the file token follow the file name: they are not part of the design
function strip (o) {
  if (Array.isArray(o)) return o.map(strip)
  if (o === null || typeof o !== 'object') return o
  return Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id' && k !== 'fileToken').map(([k, v]) => [k, strip(v)]))
}
// Differences as "path: before => after"
function diff (a, b, path, out) {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || a === null || b === null || typeof a !== 'object') {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path}: ${JSON.stringify(a)?.slice(0, 80)} => ${JSON.stringify(b)?.slice(0, 80)}`)
    return
  }
  if (Array.isArray(a) && a.length !== b.length) out.push(`${path}: length ${a.length} => ${b.length}`)
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${path}/${k}`, out)
}

// file: part of the name of a screen file in design.json, pen: name of the .pen it makes
async function roundTrip (label, file, pen) {
  const dir = join(root, label)
  const ref = join(dir, 'ref')
  mkdirSync(ref, { recursive: true })
  node([...designArg, '--out', ref, '--file', file, '--png', join(ref, 'png')])
  const first = join(ref, pen + '.pen')
  const { script, todos } = await importPen(first)
  mkdirSync(join(dir, 'rt/screens/rt'), { recursive: true })
  mkdirSync(join(dir, 'rt/out'), { recursive: true })
  writeFileSync(join(dir, 'rt/screens/rt/script.js'), script)
  writeFileSync(join(dir, 'rt/design.json'), JSON.stringify({ project: 'rt', files: [{ name: 'RT', build: [['screens/rt/script.js']] }] }))
  copyFileSync(join(ref, 'ui-kit.lib.pen'), join(dir, 'rt/out/ui-kit.lib.pen'))
  node(['--design', join(dir, 'rt/design.json'), '--out', join(dir, 'rt/out'), 'screens', '--png', join(dir, 'rt/png')])

  const a = strip(JSON.parse(readFileSync(first, 'utf8')))
  const b = strip(JSON.parse(readFileSync(join(dir, 'rt/out/rt.pen'), 'utf8')))
  const diffs = []
  diff(a, b, '', diffs)
  // Layer names of texts the kit cuts at 40 characters and uppercases are the one thing a script cannot give back
  const real = diffs.filter((d) => !/\/name: /.test(d))
  const pngA = join(ref, 'png', pen === 'current' ? 'current' : pen)
  const pngB = join(dir, 'rt/png/rt')
  const unequal = readdirSync(pngA).filter((f) => f.endsWith('.png') && !readFileSync(join(pngA, f)).equals(readFileSync(join(pngB, f))))
  console.log(`${label}: ${readdirSync(pngA).length} screens, ${diffs.length} differences (${real.length} besides layer names), ${unequal.length} PNG differ, ${todos.length} TODO(import)`)
  assert.deepEqual(real, [], `${label}: the rebuilt file differs`)
  assert.deepEqual(unequal, [], `${label}: PNG differ`)
  return script
}

await roundTrip('current', 'screens', 'current')
const board = await roundTrip('fusio-1613', '1613', 'fusio-1613')

// One page of a file: the other pages are left out
const only = await importPen(join(root, 'fusio-1613/ref/fusio-1613.pen'), { page: '3. Настройка доски (to-be)' })
assert.ok(only.script.includes("await kit.page('3. Настройка доски (to-be)')") && !only.script.includes("await kit.page('Tracker')"))
assert.ok(only.script.split('\n').filter((l) => l.startsWith('  const { main } = kit.Workbench(')).length === 6, 'board settings screens')
assert.ok(board.includes('kit.SettingsLayout('))
console.log('ok: import.mjs round trip')
