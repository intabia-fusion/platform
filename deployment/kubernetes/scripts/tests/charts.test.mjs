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
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const scripts = resolve('deployment/kubernetes/scripts')

test('chart CLI validates versions and packages all charts with distinct app versions', t => {
  const dir = mkdtempSync(join(tmpdir(), 'chart test '))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bin = join(dir, 'bin'); mkdirSync(bin)
  const log = join(dir, 'calls')
  writeFileSync(join(bin, 'helm'), `#!${process.execPath}\nrequire('fs').appendFileSync(process.env.LOG, JSON.stringify(process.argv.slice(2)) + '\\n')\n`, { mode: 0o755 })
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, LOG: log }
  const cli = (...args) => spawnSync(process.execPath, [join(scripts, 'package-charts.mjs'), ...args], { env, encoding: 'utf8' })
  for (const version of ['s1.2.3', 'v1.2.3+build', '1.2']) assert.equal(cli(version, dir).status, 2)
  const alias = join(dir, 'package alias.mjs')
  symlinkSync(join(scripts, 'package-charts.mjs'), alias)
  const throughLink = spawnSync(process.execPath, [alias, 's1.2.3'], { env, encoding: 'utf8' })
  assert.equal(throughLink.status, 2)
  const result = cli('v1.2.3-rc.1', dir)
  assert.equal(result.status, 0, result.stderr)
  const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(calls.length, 7)
  const packages = calls.filter(call => call[0] === 'package')
  assert.equal(packages.length, 3)
  assert.ok(packages.every(call => call[call.indexOf('--version') + 1] === '1.2.3-rc.1'))
  assert.ok(packages.slice(0, 2).every(call => call.includes('--app-version')))
  assert.ok(!packages[2].includes('--app-version'))
  assert.ok(packages.every(call => call[call.indexOf('--destination') + 1] === dir))
})

test('publish --init --no-push seeds a separate repository and prunes old charts', t => {
  const dir = mkdtempSync(join(tmpdir(), 'chart publish '))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bin = join(dir, 'bin'); mkdirSync(bin)
  const target = join(dir, 'target'); mkdirSync(join(target, '.git'), { recursive: true })
  const docs = join(target, 'docs'); mkdirSync(docs)
  for (const version of ['1.0.0', '1.1.0', '1.2.0-rc.1']) writeFileSync(join(docs, `platform-${version}.tgz`), '')
  const log = join(dir, 'calls')
  writeFileSync(join(bin, 'git'), `#!${process.execPath}\nrequire('fs').appendFileSync(process.env.LOG, JSON.stringify(['git', ...process.argv.slice(2)]) + '\\n')\nprocess.exit(process.argv.includes('rev-parse') ? 1 : 0)\n`, { mode: 0o755 })
  writeFileSync(join(bin, 'helm'), `#!${process.execPath}\nconst fs = require('fs'); const path = require('path'); const a = process.argv.slice(2); fs.appendFileSync(process.env.LOG, JSON.stringify(['helm', ...a]) + '\\n'); if (a[0] === 'package') fs.writeFileSync(path.join(a[a.indexOf('--destination') + 1], path.basename(a.at(-1)) + '-' + a[a.indexOf('--version') + 1] + '.tgz'), ''); if (a[0] === 'repo') fs.writeFileSync(path.join(a[2], 'index.yaml'), 'version: 1.2.0\\n')\n`, { mode: 0o755 })
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, LOG: log, CHARTS_DIR: target }
  const invalid = spawnSync(process.execPath, [join(scripts, 'publish-charts.mjs'), 'v1.2.0', '--keep', '1e0'], { env, encoding: 'utf8' })
  assert.equal(invalid.status, 2)
  const result = spawnSync(process.execPath, [join(scripts, 'publish-charts.mjs'), 'v1.2.0', '--init', '--no-push', '--prune', '--keep', '2'], { env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(readFileSync(join(target, 'README.md'), 'utf8').length > 0)
  for (const name of ['base', 'platform']) {
    assert.ok(readFileSync(join(target, `values/secrets-${name}.example.yaml`), 'utf8').length > 0)
    assert.throws(() => readFileSync(join(target, `values/secrets-${name}.yaml`)), { code: 'ENOENT' })
  }
  assert.equal(readFileSync(join(docs, 'platform-1.2.0.tgz'), 'utf8'), '')
  assert.equal(readFileSync(join(docs, 'platform-1.2.0-rc.1.tgz'), 'utf8'), '')
  assert.throws(() => readFileSync(join(docs, 'platform-1.1.0.tgz')))
  const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(calls.filter(call => call[0] === 'helm' && call[1] === 'repo').length, 2)
  assert.ok(!calls.some(call => call[0] === 'git' && call.includes('push')))
})

test('published self-hosted CLI uses standalone values, propagates diff failures and rolls back in order', t => {
  const dir = mkdtempSync(join(tmpdir(), 'selfhost test '))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const target = join(dir, 'target'); mkdirSync(target)
  const copy = spawnSync('cp', ['-R', join(scripts, '../selfhost/scripts'), join(target, 'scripts')])
  assert.equal(copy.status, 0)
  assert.equal(spawnSync('cp', ['-R', join(scripts, '../selfhost/values'), join(target, 'values')]).status, 0)
  const bin = join(dir, 'bin'); mkdirSync(bin)
  const log = join(dir, 'calls')
  writeFileSync(join(bin, 'helm'), `#!${process.execPath}\nconst a = process.argv.slice(2); require('fs').appendFileSync(process.env.LOG, JSON.stringify(a) + '\\n'); require('fs').writeFileSync(process.env.CWD_LOG, process.cwd() + '\\n' + process.env.KUBECONFIG); if (a[0] === 'plugin') console.log('diff 1.0'); if (a.includes('diff')) process.exit(3); if (a.includes('history') && a.includes('json')) console.log('[{"revision":4},{"revision":5}]');\n`, { mode: 0o755 })
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, LOG: log, CWD_LOG: join(dir, 'cwd'), KUBECONFIG: 'relative/config', PLATFORM_VERSION: 'v1.2.3', CHARTS_DIR: '/tmp/charts', NS: 'app', SINGLE_NAMESPACE: '1' }
  const cli = (...args) => spawnSync(process.execPath, [join(target, 'scripts/platform.mjs'), ...args], { env, encoding: 'utf8', cwd: dir })
  assert.equal(cli('diff').status, 3)
  assert.equal(cli('rollback').status, 0)
  assert.equal(readFileSync(join(dir, 'cwd'), 'utf8'), `${realpathSync(dir)}\nrelative/config`)
  const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse)
  const rollbacks = calls.filter(call => call.includes('rollback'))
  assert.deepEqual(rollbacks.map(call => call.slice(0, 5)), [['-n', 'app', 'rollback', 'platform', '4'], ['-n', 'app', 'rollback', 'platform-base', '4']])
})

test('ordinary publish preserves legacy entry points and user files', t => {
  const dir = mkdtempSync(join(tmpdir(), 'existing charts '))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const target = join(dir, 'repo'); const bin = join(dir, 'bin')
  mkdirSync(join(target, '.git'), { recursive: true }); mkdirSync(join(target, 'scripts')); mkdirSync(join(target, 'values')); mkdirSync(bin)
  const legacy = '#!/bin/sh\nexit 0\n'
  writeFileSync(join(target, 'scripts/install.sh'), legacy, { mode: 0o755 })
  writeFileSync(join(target, 'scripts/diff.sh'), 'custom script')
  writeFileSync(join(target, 'README.md'), 'custom readme')
  writeFileSync(join(target, 'values/base-bundled.yaml'), 'custom values')
  writeFileSync(join(bin, 'git'), `#!${process.execPath}\nprocess.exit(1)\n`, { mode: 0o755 })
  writeFileSync(join(bin, 'helm'), `#!${process.execPath}\nconst fs = require('fs'); const path = require('path'); const a = process.argv.slice(2); if (a[0] === 'repo') fs.writeFileSync(path.join(a[2], 'index.yaml'), 'version: 1.2.0\\n')\n`, { mode: 0o755 })
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CHARTS_DIR: target }
  const cli = (...args) => spawnSync(process.execPath, [join(scripts, 'publish-charts.mjs'), 'v1.2.0', '--no-push', ...args], { env, encoding: 'utf8' })
  assert.equal(cli().status, 0)
  assert.equal(readFileSync(join(target, 'scripts/install.sh'), 'utf8'), legacy)
  assert.ok(readFileSync(join(target, 'scripts/platform.mjs'), 'utf8').length > 0)
  assert.equal(readFileSync(join(target, 'scripts/diff.sh'), 'utf8'), 'custom script')
  assert.equal(cli('--init').status, 0)
  assert.equal(readFileSync(join(target, 'scripts/install.sh'), 'utf8'), legacy)
  assert.equal(readFileSync(join(target, 'README.md'), 'utf8'), 'custom readme')
  assert.equal(readFileSync(join(target, 'values/base-bundled.yaml'), 'utf8'), 'custom values')
})

test('token clone uses the fixed repository and adds a scoped Git config entry', t => {
  const dir = mkdtempSync(join(tmpdir(), 'chart token '))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bin = join(dir, 'bin'); mkdirSync(bin)
  const target = join(dir, 'repo'); const log = join(dir, 'git.json')
  writeFileSync(join(bin, 'git'), `#!${process.execPath}\nconst fs = require('fs'); const a = process.argv.slice(2); fs.writeFileSync(process.env.LOG, JSON.stringify({a, count: process.env.GIT_CONFIG_COUNT, first: process.env.GIT_CONFIG_KEY_0, second: process.env.GIT_CONFIG_KEY_1})); if (a[0] === 'clone') fs.mkdirSync(a.at(-1), {recursive:true});\n`, { mode: 0o755 })
  writeFileSync(join(bin, 'helm'), `#!${process.execPath}\nconst fs = require('fs'); const path = require('path'); const a = process.argv.slice(2); if (a[0] === 'repo') fs.writeFileSync(path.join(a[2], 'index.yaml'), 'version: 1.2.0\\n')\n`, { mode: 0o755 })
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CHARTS_DIR: target, CHARTS_TOKEN: 'secret', CHARTS_REPO_URL: 'https://example.com/other.git', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'test.key', GIT_CONFIG_VALUE_0: 'value', LOG: log }
  const result = spawnSync(process.execPath, [join(scripts, 'publish-charts.mjs'), 'v1.2.0', '--no-push'], { env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const call = JSON.parse(readFileSync(log, 'utf8'))
  assert.equal(call.a[3], 'https://github.com/intabia-fusion/platform-charts.git')
  assert.equal(call.count, '2')
  assert.equal(call.first, 'test.key')
  assert.equal(call.second, 'http.https://github.com/intabia-fusion/platform-charts.git.extraheader')
  assert.ok(!result.stdout.includes('secret') && !result.stderr.includes('secret'))
})


test('self-hosted dry run does not print repository credentials', () => {
  const env = { ...process.env, PLATFORM_VERSION: 'v1.2.3', DRY_RUN: '1', CHARTS_URL: 'https://user:secret@example.test/charts' }
  delete env.CHARTS_DIR
  const cli = resolve('deployment/kubernetes/selfhost/scripts/platform.mjs')
  const result = spawnSync(process.execPath, [cli, 'install'], { env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(!result.stdout.includes('user:secret@example.test'))
  assert.ok(!result.stdout.includes('repo add'))
  assert.match(result.stdout, /helm upgrade/)
})
