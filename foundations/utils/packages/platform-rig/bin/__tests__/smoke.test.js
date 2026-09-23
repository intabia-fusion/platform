/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/

const { test, describe, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')

const { createMiniRepo } = require('./fixtures/mini-repo')
const { markPhaseCompleted, isPhaseCached } = require('../libs/cache')

const COMPILE_ALL = join(__dirname, '..', 'compile_all.js')
const T = 120_000

let repo = null

afterEach(() => {
  repo?.cleanup()
  repo = null
})

// compile_all.js calls process.exit, so it is driven as a child process.
// Warnings go to stderr, so both streams are folded into `out`.
function compileAll (root, args) {
  const r = spawnSync(process.execPath, [COMPILE_ALL, root, ...args], { encoding: 'utf8' })
  return { code: r.status ?? -1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

const TWO_PACKAGES = {
  '@mini/core': { files: { 'src/index.ts': 'export const answer = 42\n' } },
  '@mini/app': {
    deps: ['@mini/core'],
    files: { 'src/index.ts': "import { answer } from '@mini/core'\nexport const shown = String(answer)\n" }
  }
}

describe('compile_all end to end', () => {
  test('emits JS and declarations in dependency order', { timeout: T }, () => {
    repo = createMiniRepo(TWO_PACKAGES)
    const { code, out } = compileAll(repo.root, ['--validate', '--parallel', '2'])

    assert.equal(code, 0, out)
    assert.ok(fs.existsSync(join(repo.pkgDir('@mini/core'), 'lib', 'index.js')))
    assert.ok(fs.existsSync(join(repo.pkgDir('@mini/core'), 'types', 'index.d.ts')))
    assert.ok(fs.existsSync(join(repo.pkgDir('@mini/app'), 'types', 'index.d.ts')))
  })

  test('a second run serves every package from cache', { timeout: T }, () => {
    repo = createMiniRepo(TWO_PACKAGES)
    assert.equal(compileAll(repo.root, ['--validate', '--parallel', '2']).code, 0)

    const second = compileAll(repo.root, ['--validate', '--parallel', '2'])
    assert.equal(second.code, 0, second.out)
    assert.match(second.out, /\(2 from cache\)/)
  })

  test('a type error fails the run with a non-zero exit code', { timeout: T }, () => {
    repo = createMiniRepo({
      '@mini/core': { files: { 'src/index.ts': 'export const answer: number = "not a number"\n' } }
    })
    const { code, out } = compileAll(repo.root, ['--validate', '--parallel', '1'])
    assert.notEqual(code, 0)
    assert.match(out, /TS2322/)
  })

  // A package sees a dependency only through its emitted .d.ts. Keying on the dependency's
  // sources rebuilt the whole downstream closure for edits that changed no public API —
  // 460 packages rebuilt for a one-line change.
  test('a dependency edit that does not change its .d.ts leaves dependents cached', { timeout: T }, () => {
    repo = createMiniRepo({
      '@mini/core': {
        files: { 'src/index.ts': 'function helper (): number {\n  return 42\n}\nexport function answer (): number {\n  return helper()\n}\n' }
      },
      '@mini/app': {
        deps: ['@mini/core'],
        files: { 'src/index.ts': "import { answer } from '@mini/core'\nexport const shown = String(answer())\n" }
      }
    })
    assert.equal(compileAll(repo.root, ['--validate', '--parallel', '2']).code, 0)

    // Body-only change: the emitted declaration for `answer` is identical.
    fs.writeFileSync(
      join(repo.pkgDir('@mini/core'), 'src', 'index.ts'),
      'function helper (): number {\n  return 43\n}\nexport function answer (): number {\n  return helper()\n}\n'
    )
    const second = compileAll(repo.root, ['--validate', '--parallel', '2'])

    assert.equal(second.code, 0, second.out)
    assert.match(second.out, /\(1 from cache\)/, '@mini/app must come from cache')
  })

  test('changing a dependency rebuilds its dependents', { timeout: T }, () => {
    repo = createMiniRepo(TWO_PACKAGES)
    assert.equal(compileAll(repo.root, ['--validate', '--parallel', '2']).code, 0)

    fs.writeFileSync(join(repo.pkgDir('@mini/core'), 'src', 'index.ts'), 'export const answer = 43\n')
    const second = compileAll(repo.root, ['--validate', '--parallel', '2'])

    assert.equal(second.code, 0, second.out)
    assert.doesNotMatch(second.out, /\(2 from cache\)/)
  })

  // Regression: the build phase called invalidateCache() on any upstream change, deleting the whole
  // .fast-build-cache.json and with it every other phase's entry for the entire downstream closure.
  test('an upstream change keeps unrelated phase cache entries', { timeout: T }, () => {
    repo = createMiniRepo(TWO_PACKAGES)
    assert.equal(compileAll(repo.root, ['--validate', '--parallel', '2']).code, 0)

    const appDir = repo.pkgDir('@mini/app')
    markPhaseCompleted(appDir, 'docker-hash', 'docker-build', null, [])
    assert.equal(isPhaseCached(appDir, 'docker-hash', 'docker-build', null, []), true)

    fs.writeFileSync(join(repo.pkgDir('@mini/core'), 'src', 'index.ts'), 'export const answer = 44\n')
    assert.equal(compileAll(repo.root, ['--validate', '--parallel', '2']).code, 0)

    assert.equal(
      isPhaseCached(appDir, 'docker-hash', 'docker-build', null, []),
      true,
      'build must invalidate only its own phase entry'
    )
  })

  // Regression: strict string equality on phase scripts dropped packages without a word.
  test('warns about a build script it cannot run instead of skipping it silently', { timeout: T }, () => {
    repo = createMiniRepo({
      '@mini/core': { files: { 'src/index.ts': 'export const answer = 42\n' } },
      '@mini/wasm': {
        scripts: { '_phase:build': 'wasm && node esbuild.config.js' },
        files: { 'src/index.ts': 'export const w = 1\n' }
      }
    })
    const { out } = compileAll(repo.root, ['--parallel', '1'])
    assert.match(out, /@mini\/wasm/, 'the skipped package must be named in the output')
    assert.match(out, /unrecognised|unknown|not recognized/i)
  })

  // index <-> utils cycle with a default import, the shape of @hcengineering/setting.
  const CYCLE = {
    '@mini/cycle': {
      compilerOptions: { incremental: true, isolatedModules: true },
      files: {
        'src/index.ts': "export * from './utils'\nconst plugin = { name: 'mini' }\nexport default plugin\n",
        'src/utils.ts': "import plugin from './index'\nexport function pluginName (): string {\n  return plugin.name\n}\n"
      }
    }
  }

  // index.js first: utils.js then sees it half-loaded, which is where a mixed lib breaks.
  function loadPluginName (dir) {
    const r = spawnSync(process.execPath, ['-e', "console.log(require('./lib/index.js').pluginName())"], { cwd: dir, encoding: 'utf8' })
    return (r.stdout ?? '').trim() + (r.stderr ?? '')
  }

  test('lib is written by esbuild only, tsc emits declarations', { timeout: T }, () => {
    repo = createMiniRepo(CYCLE)
    const { code, out } = compileAll(repo.root, ['--parallel', '1'])
    assert.equal(code, 0, out)

    const dir = repo.pkgDir('@mini/cycle')
    for (const f of ['index.js', 'utils.js']) {
      assert.doesNotMatch(fs.readFileSync(join(dir, 'lib', f), 'utf8'), /__createBinding|__importDefault/, `${f} emitted by tsc`)
    }
    assert.ok(fs.existsSync(join(dir, 'types', 'utils.d.ts')))
    assert.equal(loadPluginName(dir), 'mini')
  })

  // Regression: tsc's incremental state re-emitted only index.js over an esbuild lib/, and the
  // esbuild utils.js snapshotted the half-loaded tsc index.js without `default`.
  test('a docker esbuild emit between builds does not leave a mixed lib', { timeout: T }, () => {
    repo = createMiniRepo(CYCLE)
    const dir = repo.pkgDir('@mini/cycle')
    assert.equal(compileAll(repo.root, ['--parallel', '1']).code, 0)
    assert.equal(compileAll(repo.root, ['--parallel', '1', '--esbuild-emit']).code, 0)

    fs.writeFileSync(join(dir, 'src', 'index.ts'), "export * from './utils'\nconst plugin = { name: 'mini' }\nexport const extra = 1\nexport default plugin\n")
    const { code, out } = compileAll(repo.root, ['--parallel', '1'])
    assert.equal(code, 0, out)

    assert.equal(loadPluginName(dir), 'mini')
  })

  // Regression: esbuild read ./src only, so the sanity packages (rootDir ./tests) got no lib/ at all.
  test('esbuild emits from the tsconfig rootDir', { timeout: T }, () => {
    repo = createMiniRepo({
      '@mini/tests': {
        files: {
          'tsconfig.json': JSON.stringify({
            compilerOptions: { module: 'CommonJS', strict: true, declaration: true, skipLibCheck: true, rootDir: './tests', outDir: 'lib', declarationDir: 'types' },
            include: ['tests/**/*.ts']
          }),
          'tests/index.ts': "export * from './model/page'\n",
          'tests/model/page.ts': 'export const page = 1\n'
        }
      }
    })
    const { code, out } = compileAll(repo.root, ['--parallel', '1'])
    assert.equal(code, 0, out)

    const dir = repo.pkgDir('@mini/tests')
    assert.ok(fs.existsSync(join(dir, 'lib', 'index.js')))
    assert.ok(fs.existsSync(join(dir, 'lib', 'model', 'page.js')))
  })

  test('--to restricts the run to a package and its dependencies', { timeout: T }, () => {
    repo = createMiniRepo({
      ...TWO_PACKAGES,
      '@mini/other': { files: { 'src/index.ts': 'export const other = 1\n' } }
    })
    const { code, out } = compileAll(repo.root, ['--validate', '--parallel', '2', '--to', '@mini/app'])

    assert.equal(code, 0, out)
    assert.ok(!fs.existsSync(join(repo.pkgDir('@mini/other'), 'lib')), '@mini/other must not be built')
  })

  test('--list reports counts without building', { timeout: T }, () => {
    repo = createMiniRepo(TWO_PACKAGES)
    const { code, out } = compileAll(repo.root, ['--validate', '--list'])

    assert.equal(code, 0, out)
    assert.match(out, /Build: 2/)
    assert.ok(!fs.existsSync(join(repo.pkgDir('@mini/core'), 'lib')), '--list must not produce output')
  })
})
