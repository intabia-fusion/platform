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
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const build = join(dirname(fileURLToPath(import.meta.url)), '../build.mjs')

function run (root, ...args) {
  const r = spawnSync('node', [build, '--out', join(root, 'dev/design/tenn'), '--root', root, '--no-check', ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r
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
    const entry = readFileSync(join(a, 'PlatformDesign.tenn'), 'utf8')
    assert.match(entry, /^element Libraries \{\n\telement ui_kit --from-file/m)
    assert.doesNotMatch(entry, /^element ui_kit --from-file/m)
  } finally {
    rmSync(a, { recursive: true, force: true })
    rmSync(b, { recursive: true, force: true })
  }
})

test('manual files are skipped and hand-added mounts survive --force', () => {
  const root = mkdtempSync(join(tmpdir(), 'tenn-manual-'))
  try {
    run(root)
    const part = join(root, 'dev/design/tenn/lib/forms.tenn')
    const entry = join(root, 'PlatformDesign.tenn')
    writeFileSync(part, readFileSync(part, 'utf8') + '\nitem ManualEdit {}\n')
    const mounts = 'element manual_kit --from-file "dev/design/tenn/manual.tenn"\n'
    const taskMount = '\telement "Manual task" --from-file "dev/design/tenn/manual-task.tenn"\n'
    writeFileSync(entry, readFileSync(entry, 'utf8').replace('element Tasks {\n', mounts + 'element Tasks {\n' + taskMount))

    const skipped = run(root)
    assert.match(skipped.stdout, /forms\.tenn: skipped, manual changes/)
    assert.match(readFileSync(part, 'utf8'), /item ManualEdit/)
    assert.match(readFileSync(entry, 'utf8'), /element manual_kit --from-file/)
    assert.match(readFileSync(entry, 'utf8'), /element "Manual task" --from-file/)
    assert.doesNotMatch(readFileSync(entry, 'utf8'), /dev\/design\/tenn\/dev\/design\/tenn/)

    run(root, '--force')
    assert.doesNotMatch(readFileSync(part, 'utf8'), /item ManualEdit/)
    assert.match(readFileSync(entry, 'utf8'), /element manual_kit --from-file/)
    assert.match(readFileSync(entry, 'utf8'), /element "Manual task" --from-file/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('tenniarb check finds no errors', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'tenn-check-'))
  try {
    run(root)
    const names = files(root).filter((n) => n.endsWith('.tenn'))
    const actions = readFileSync(join(root, 'dev/design/tenn/lib/actions.tenn'), 'utf8')
    const forms = readFileSync(join(root, 'dev/design/tenn/lib/forms.tenn'), 'utf8')
    const status = readFileSync(join(root, 'dev/design/tenn/lib/status.tenn'), 'utf8')
    const login = readFileSync(join(root, 'dev/design/tenn/lib/login.tenn'), 'utf8')
    assert.match(actions, /item Button \{[\s\S]*export let state = default[\s\S]*animation spin \{[\s\S]*use Button as loading \{ state loading \}/)
    assert.doesNotMatch(actions, /item "Button\//)
    assert.match(forms, /item Checkbox \{[\s\S]*export let checked = true/)
    assert.doesNotMatch(forms, /item "Checkbox\/empty"/)
    assert.match(status, /item StatusIcon \{[\s\S]*export let category = active/)
    assert.match(login, /item LoginButton \{[\s\S]*export let disabled = false/)
    const r = spawnSync('tenniarb', ['check', '-root', root, ...names.map((n) => join(root, n))], { encoding: 'utf8', cwd: root })
    if (r.error?.code === 'ENOENT') return t.skip('tenniarb is not in PATH')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /, 0 errors, 0 warnings/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
