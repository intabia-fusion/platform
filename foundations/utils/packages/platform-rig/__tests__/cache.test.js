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
  collectFormatConfigFiles,
  findRepoRoot,
  SRC_EXTENSIONS,
  CONFIG_FILE_PATTERNS,
  isPhaseCached,
  markPhaseCompleted,
  loadPackageCache
} = require('../bin/libs/cache')

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-build-cache-'))
  fs.writeFileSync(path.join(root, 'rush.json'), '{}')
  fs.mkdirSync(path.join(root, 'common', 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(root, 'common', 'scripts', 'version.txt'), '1.0.0')
  return root
}

function mkPackage(repoRoot, name = 'pkg') {
  const pkg = path.join(repoRoot, 'packages', name)
  fs.mkdirSync(path.join(pkg, 'src'), { recursive: true })
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name }, null, 2))
  fs.writeFileSync(path.join(pkg, 'src', 'index.ts'), 'export const x = 1\n')
  return pkg
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

test('hash is deterministic across calls with no changes', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    const h1 = calculatePackageHash(pkg)
    const h2 = calculatePackageHash(pkg)
    assert.equal(h1, h2)
  } finally { rmrf(root) }
})

test('hash changes when src/ file content changes', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    const before = calculatePackageHash(pkg)
    fs.writeFileSync(path.join(pkg, 'src', 'index.ts'), 'export const x = 2\n')
    assert.notEqual(calculatePackageHash(pkg), before)
  } finally { rmrf(root) }
})

test('hash changes when package-level .prettierrc changes', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    fs.writeFileSync(path.join(pkg, '.prettierrc'), '{"printWidth":120}')
    const before = calculatePackageHash(pkg)
    fs.writeFileSync(path.join(pkg, '.prettierrc'), '{"printWidth":80}')
    assert.notEqual(calculatePackageHash(pkg), before, 'changing .prettierrc must invalidate hash')
  } finally { rmrf(root) }
})

test('hash changes when root-level .prettierrc changes', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    fs.writeFileSync(path.join(root, '.prettierrc'), '{"singleQuote":true}')
    const before = calculatePackageHash(pkg)
    fs.writeFileSync(path.join(root, '.prettierrc'), '{"singleQuote":false}')
    assert.notEqual(calculatePackageHash(pkg), before, 'root .prettierrc change must invalidate package hash')
  } finally { rmrf(root) }
})

test('hash changes when root .eslintrc.js changes', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    fs.writeFileSync(path.join(root, '.eslintrc.js'), 'module.exports = { rules: {} }')
    const before = calculatePackageHash(pkg)
    fs.writeFileSync(path.join(root, '.eslintrc.js'), 'module.exports = { rules: { semi: "error" } }')
    assert.notEqual(calculatePackageHash(pkg), before)
  } finally { rmrf(root) }
})

test('hash changes when .prettierignore appears', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    const before = calculatePackageHash(pkg)
    fs.writeFileSync(path.join(root, '.prettierignore'), 'dist\n')
    assert.notEqual(calculatePackageHash(pkg), before)
  } finally { rmrf(root) }
})

test('hash changes when .cjs file is added under src/', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    const before = calculatePackageHash(pkg)
    fs.writeFileSync(path.join(pkg, 'src', 'helper.cjs'), 'module.exports = {}\n')
    assert.notEqual(calculatePackageHash(pkg), before, 'cjs files must be tracked')
  } finally { rmrf(root) }
})

test('hash changes when .mts file is added under src/', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    const before = calculatePackageHash(pkg)
    fs.writeFileSync(path.join(pkg, 'src', 'helper.mts'), 'export {}\n')
    assert.notEqual(calculatePackageHash(pkg), before)
  } finally { rmrf(root) }
})

test('hash changes when .tsx file content changes', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    fs.writeFileSync(path.join(pkg, 'src', 'C.tsx'), 'export const C = () => null\n')
    const before = calculatePackageHash(pkg)
    fs.writeFileSync(path.join(pkg, 'src', 'C.tsx'), 'export const C = () => 1\n')
    assert.notEqual(calculatePackageHash(pkg), before)
  } finally { rmrf(root) }
})

test('hash changes when version.txt changes', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    const before = calculatePackageHash(pkg)
    fs.writeFileSync(path.join(root, 'common', 'scripts', 'version.txt'), '2.0.0')
    assert.notEqual(calculatePackageHash(pkg), before)
  } finally { rmrf(root) }
})

test('files outside SRC_EXTENSIONS do not affect hash', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    const before = calculatePackageHash(pkg)
    fs.writeFileSync(path.join(pkg, 'src', 'README.md'), 'docs')
    fs.writeFileSync(path.join(pkg, 'src', 'image.png'), Buffer.from([0]))
    assert.equal(calculatePackageHash(pkg), before)
  } finally { rmrf(root) }
})

test('SRC_EXTENSIONS contains all formattable extensions', () => {
  for (const ext of ['.ts', '.tsx', '.cts', '.mts', '.js', '.jsx', '.cjs', '.mjs', '.svelte', '.json']) {
    assert.ok(SRC_EXTENSIONS.has(ext), `missing extension ${ext}`)
  }
})

test('CONFIG_FILE_PATTERNS covers prettier and eslint variants', () => {
  for (const name of ['.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierignore',
                      '.eslintrc', '.eslintrc.js', '.eslintignore']) {
    assert.ok(CONFIG_FILE_PATTERNS.includes(name), `missing config pattern ${name}`)
  }
})

test('collectFormatConfigFiles walks from package up to repo root', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    fs.writeFileSync(path.join(root, '.prettierrc'), '{}')
    fs.writeFileSync(path.join(pkg, '.prettierrc'), '{}')
    const files = collectFormatConfigFiles(pkg, root)
    assert.ok(files.some((f) => f === path.join(pkg, '.prettierrc')))
    assert.ok(files.some((f) => f === path.join(root, '.prettierrc')))
  } finally { rmrf(root) }
})

test('collectFormatConfigFiles stops at repo root and does not escape', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    // Create a file *above* repo root that should never be included.
    const aboveRoot = path.join(root, '..', '.prettierrc-should-not-be-read')
    try { fs.writeFileSync(aboveRoot, '{}') } catch {}
    try {
      const files = collectFormatConfigFiles(pkg, root)
      for (const f of files) {
        assert.ok(f.startsWith(root + path.sep) || f === path.join(root, path.basename(f)),
          `config ${f} must be under repo root ${root}`)
      }
    } finally {
      try { fs.unlinkSync(aboveRoot) } catch {}
    }
  } finally { rmrf(root) }
})

test('findRepoRoot returns the dir containing rush.json', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    assert.equal(findRepoRoot(pkg), root)
  } finally { rmrf(root) }
})

test('isPhaseCached / markPhaseCompleted round-trip with empty outputs', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    const h = calculatePackageHash(pkg)
    assert.equal(isPhaseCached(pkg, h, 'format', null, []), false)
    markPhaseCompleted(pkg, h, 'format', null, [])
    assert.equal(isPhaseCached(pkg, h, 'format', null, []), true)
    // Different hash → miss
    assert.equal(isPhaseCached(pkg, h + 'x', 'format', null, []), false)
  } finally { rmrf(root) }
})

test('isPhaseCached returns false when prettier config changes after mark', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    fs.writeFileSync(path.join(root, '.prettierrc'), '{"semi":false}')
    const h1 = calculatePackageHash(pkg)
    markPhaseCompleted(pkg, h1, 'format', null, [])
    assert.equal(isPhaseCached(pkg, h1, 'format', null, []), true)

    fs.writeFileSync(path.join(root, '.prettierrc'), '{"semi":true}')
    const h2 = calculatePackageHash(pkg)
    assert.notEqual(h1, h2)
    assert.equal(isPhaseCached(pkg, h2, 'format', null, []), false,
      'after prettier config change, cache must miss')
  } finally { rmrf(root) }
})

test('v1 cache migrates to v2 transparently', () => {
  const root = mkRepo()
  try {
    const pkg = mkPackage(root)
    const v1 = {
      hash: 'legacy-hash',
      timestamp: 1,
      phases: { format: { completedAt: 2 } }
    }
    fs.writeFileSync(path.join(pkg, '.fast-build-cache.json'), JSON.stringify(v1))
    const loaded = loadPackageCache(pkg)
    assert.equal(loaded.version, 2)
    assert.equal(loaded.phases.format.hash, 'legacy-hash')
    assert.equal(loaded.phases.format.completedAt, 2)
  } finally { rmrf(root) }
})
