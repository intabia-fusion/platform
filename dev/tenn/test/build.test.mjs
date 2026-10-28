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

// Two builds into temp folders give the same bytes; the output passes `tenniarb check` when tenniarb is in PATH.
// Run: node --test dev/tenn/test/build.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const build = join(dirname(fileURLToPath(import.meta.url)), '../build.mjs')

function run (root) {
  const r = spawnSync('node', [build, '--out', join(root, 'dev/design/tenn'), '--root', root, '--no-check'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
}

// Every file under dir, by path relative to it
function files (dir, base = dir) {
  return readdirSync(dir).sort().flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p, base) : [p.slice(base.length + 1)]
  })
}

test('two builds are byte-equal', () => {
  const [a, b] = [mkdtempSync(join(tmpdir(), 'tenn-a-')), mkdtempSync(join(tmpdir(), 'tenn-b-'))]
  try {
    run(a)
    run(b)
    const names = files(a)
    assert.deepEqual(names, files(b))
    assert.ok(names.includes('PlatformDesign.tenn') && names.includes('dev/design/tenn/ui-kit.lib.tenn') && names.includes('dev/design/tenn/apps/tracker.tenn'), names.join(', '))
    for (const n of names) assert.ok(readFileSync(join(a, n)).equals(readFileSync(join(b, n))), n)
    // every part names its entry document, PlatformDesign.tenn is the only file that mounts the libraries
    for (const n of names.filter((n) => n.startsWith('dev/'))) assert.match(readFileSync(join(a, n), 'utf8'), /^entry "[./]*PlatformDesign\.tenn"\n/, n)
  } finally {
    rmSync(a, { recursive: true, force: true })
    rmSync(b, { recursive: true, force: true })
  }
})

test('tenniarb check finds no errors', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'tenn-check-'))
  try {
    run(root)
    const names = files(root).filter((n) => n.endsWith('.tenn'))
    const r = spawnSync('tenniarb', ['check', '-root', root, ...names.map((n) => join(root, n))], { encoding: 'utf8', cwd: root })
    if (r.error?.code === 'ENOENT') return t.skip('tenniarb is not in PATH')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /, 0 errors, 0 warnings/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
