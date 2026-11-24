/*
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, renameSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

test('checks only new third-party dependencies against the base revision', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-catalog-'))
  try {
    const script = 'common/scripts/check-catalog.js'
    const helper = 'foundations/utils/packages/platform-rig/bin/libs/workspace.js'
    for (const path of [script, helper]) {
      mkdirSync(join(root, path, '..'), { recursive: true })
      copyFileSync(join(__dirname, '../..', path), join(root, path))
    }
    mkdirSync(join(root, 'pkg'))
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'pkg*'\ncatalog:\n  known: 1.0.0\n")
    const manifest = { name: 'pkg', dependencies: { old: '1.0.0', local: 'workspace:*' } }
    let directory = 'pkg'
    const save = () => writeFileSync(join(root, directory, 'package.json'), JSON.stringify(manifest))
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
    save()
    git('init', '-q')
    git('add', '.')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'base')
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' })
    manifest.devDependencies = { added: '1.0.0', local: 'workspace:*', linked: 'file:../linked', known: 'catalog:' }
    save()
    let result = run('--base', 'HEAD')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /added = 1\.0\.0/)
    assert.doesNotMatch(result.stderr, /old =|local =|linked =|known =/)
    assert.equal(run().status, 0)
    assert.equal(run('--base', 'HEAD', '--fix').status, 1)
    delete manifest.devDependencies.added
    manifest.devDependencies.old = manifest.dependencies.old
    delete manifest.dependencies.old
    save()
    assert.equal(run('--base', 'HEAD').status, 0)
    manifest.devDependencies.known = '1.0.0'
    save()
    assert.equal(run('--base', 'HEAD').status, 1)
    assert.equal(run('--base', 'HEAD', '--fix').status, 0)
    assert.equal(run('--base', 'HEAD').status, 0)
    manifest.devDependencies.known = 'catalog:'
    manifest.dependencies.local = '1.0.0'
    save()
    result = run('--base', 'HEAD')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /local = 1\.0\.0/)
    manifest.dependencies.local = 'workspace:*'
    save()
    renameSync(join(root, 'pkg'), join(root, 'pkg-renamed'))
    directory = 'pkg-renamed'
    result = run('--base', 'HEAD')
    assert.equal(result.status, 0, result.stderr)
    git('add', '-A')
    assert.equal(run('--base', 'HEAD').status, 0)
    manifest.devDependencies.newExternal = '2.0.0'
    save()
    assert.match(run('--base', 'HEAD').stderr, /newExternal = 2\.0\.0/)
    assert.notEqual(run('--base', 'invalid-revision').status, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
