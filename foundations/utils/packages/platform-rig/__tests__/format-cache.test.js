/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  calculatePackageHash,
  isPhaseCached,
  markPhaseCompleted
} = require('../bin/libs/cache')

const { collectSourceFiles, FORMATTABLE_EXTENSIONS } = require('../bin/format-worker')

function mkPkg() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-build-fmt-'))
  fs.writeFileSync(path.join(root, 'rush.json'), '{}')
  fs.mkdirSync(path.join(root, 'common', 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(root, 'common', 'scripts', 'version.txt'), '1.0.0')
  const pkg = path.join(root, 'packages', 'p')
  fs.mkdirSync(path.join(pkg, 'src'), { recursive: true })
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'p' }))
  return { root, pkg }
}
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true })

test('format cache: hit on identical inputs', () => {
  const { root, pkg } = mkPkg()
  try {
    fs.writeFileSync(path.join(pkg, 'src', 'a.ts'), 'export const a = 1\n')
    const h = calculatePackageHash(pkg)
    markPhaseCompleted(pkg, h, 'format', null, [])
    assert.equal(isPhaseCached(pkg, calculatePackageHash(pkg), 'format', null, []), true)
  } finally { rmrf(root) }
})

test('format cache: miss after editing .prettierrc (the reported bug)', () => {
  const { root, pkg } = mkPkg()
  try {
    fs.writeFileSync(path.join(pkg, 'src', 'a.ts'), 'export const a = 1\n')
    fs.writeFileSync(path.join(root, '.prettierrc'), '{"printWidth":120}')
    const h1 = calculatePackageHash(pkg)
    markPhaseCompleted(pkg, h1, 'format', null, [])
    assert.equal(isPhaseCached(pkg, h1, 'format', null, []), true)

    // User edits root .prettierrc — previously this kept hitting the cache.
    fs.writeFileSync(path.join(root, '.prettierrc'), '{"printWidth":80}')
    const h2 = calculatePackageHash(pkg)
    assert.equal(isPhaseCached(pkg, h2, 'format', null, []), false)
  } finally { rmrf(root) }
})

test('format cache: miss when adding .cjs file (previously invisible to hash)', () => {
  const { root, pkg } = mkPkg()
  try {
    fs.writeFileSync(path.join(pkg, 'src', 'a.ts'), 'export const a = 1\n')
    const h1 = calculatePackageHash(pkg)
    markPhaseCompleted(pkg, h1, 'format', null, [])

    fs.writeFileSync(path.join(pkg, 'src', 'helper.cjs'), 'module.exports = {}\n')
    assert.equal(isPhaseCached(pkg, calculatePackageHash(pkg), 'format', null, []), false)
  } finally { rmrf(root) }
})

test('format cache: miss when editing .mts file', () => {
  const { root, pkg } = mkPkg()
  try {
    fs.writeFileSync(path.join(pkg, 'src', 'a.mts'), 'export const a = 1\n')
    const h1 = calculatePackageHash(pkg)
    markPhaseCompleted(pkg, h1, 'format', null, [])

    fs.writeFileSync(path.join(pkg, 'src', 'a.mts'), 'export const a = 2\n')
    assert.equal(isPhaseCached(pkg, calculatePackageHash(pkg), 'format', null, []), false)
  } finally { rmrf(root) }
})

test('format cache: miss when eslint config changes', () => {
  const { root, pkg } = mkPkg()
  try {
    fs.writeFileSync(path.join(pkg, 'src', 'a.ts'), 'export const a = 1\n')
    fs.writeFileSync(path.join(root, '.eslintrc.js'), 'module.exports = {}')
    const h1 = calculatePackageHash(pkg)
    markPhaseCompleted(pkg, h1, 'format', null, [])

    fs.writeFileSync(path.join(root, '.eslintrc.js'), 'module.exports = { rules: { semi: "error" } }')
    assert.equal(isPhaseCached(pkg, calculatePackageHash(pkg), 'format', null, []), false)
  } finally { rmrf(root) }
})

test('worker collectSourceFiles picks up every formattable extension', () => {
  const { root, pkg } = mkPkg()
  try {
    const src = path.join(pkg, 'src')
    const created = []
    for (const ext of FORMATTABLE_EXTENSIONS) {
      const f = path.join(src, `f${ext}`)
      fs.writeFileSync(f, '// test\n')
      created.push(f)
    }
    // d.ts must be skipped
    fs.writeFileSync(path.join(src, 'types.d.ts'), 'export {}')

    const found = collectSourceFiles(src)
    for (const c of created) assert.ok(found.includes(c), `missing ${c}`)
    assert.ok(!found.some((f) => f.endsWith('.d.ts')), 'd.ts must be excluded')
  } finally { rmrf(root) }
})

test('worker and cache extensions stay in sync (both cover .cjs/.mjs/.cts/.mts/.tsx/.jsx)', () => {
  const { SRC_EXTENSIONS } = require('../bin/libs/cache')
  for (const ext of FORMATTABLE_EXTENSIONS) {
    assert.ok(SRC_EXTENSIONS.has(ext), `worker formats ${ext} but cache.js doesn't hash it — cache will be stale`)
  }
})
