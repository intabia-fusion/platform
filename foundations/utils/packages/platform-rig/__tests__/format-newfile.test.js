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

const { formatPackage } = require('../bin/format-worker')
const {
  calculatePackageHash,
  isPhaseCached,
  markPhaseCompleted
} = require('../bin/libs/cache')

function mkPkg() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-build-newfile-'))
  fs.writeFileSync(path.join(root, 'rush.json'), '{}')
  fs.mkdirSync(path.join(root, 'common', 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(root, 'common', 'scripts', 'version.txt'), '1.0.0')
  // Repo-level prettier rules — match foundation defaults
  fs.writeFileSync(
    path.join(root, '.prettierrc'),
    JSON.stringify({ printWidth: 120, singleQuote: true, semi: false, trailingComma: 'none' })
  )
  const pkg = path.join(root, 'packages', 'p')
  fs.mkdirSync(path.join(pkg, 'src'), { recursive: true })
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'p' }))
  // Minimal eslint config so worker's eslint --fix step doesn't fail.
  fs.writeFileSync(path.join(root, '.eslintrc.json'), JSON.stringify({ root: true, rules: {} }))
  return { root, pkg }
}
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true })

test('newly added .ts file with bad formatting gets formatted', async () => {
  const { root, pkg } = mkPkg()
  try {
    // First: clean baseline file, format, mark cached
    fs.writeFileSync(path.join(pkg, 'src', 'a.ts'), "export const a = 1\n")
    const h0 = calculatePackageHash(pkg)
    markPhaseCompleted(pkg, h0, 'format', null, [])
    assert.equal(isPhaseCached(pkg, h0, 'format', null, []), true, 'baseline must be cached')

    // Add new file with semicolons + double quotes (violates prettier config)
    const newFile = path.join(pkg, 'src', 'b.ts')
    const ugly = 'export    const   b   =     "hello";\nexport function f(  x:number ):number{return x+1;}\n'
    fs.writeFileSync(newFile, ugly)

    const h1 = calculatePackageHash(pkg)
    assert.notEqual(h1, h0, 'adding new file must invalidate hash')
    assert.equal(isPhaseCached(pkg, h1, 'format', null, []), false, 'cache must miss')

    const result = await formatPackage(pkg, { srcDir: 'src' })
    // success === false here means eslint had errors/warnings on the bad input,
    // but prettier still ran. Only fail on hard errors (read/write/prettier exceptions).
    assert.deepEqual(result.errors, [], `format hard errors: ${JSON.stringify(result.errors)}`)
    assert.ok(result.changed >= 1, `expected at least 1 changed, got ${result.changed}`)

    const formatted = fs.readFileSync(newFile, 'utf8')
    assert.notEqual(formatted, ugly, 'new file content must change')
    assert.ok(!formatted.includes('"hello"'), 'double quotes must be converted to single')
    assert.ok(formatted.includes("'hello'"), 'single quotes expected')
    assert.ok(!/;\s*$/m.test(formatted.split('\n')[0]), 'no trailing semicolons (semi:false)')
  } finally { rmrf(root) }
})

test('newly added .cjs file gets formatted', async () => {
  const { root, pkg } = mkPkg()
  try {
    const newFile = path.join(pkg, 'src', 'helper.cjs')
    const ugly = 'module.exports={a:1,b:    2};\n'
    fs.writeFileSync(newFile, ugly)

    const result = await formatPackage(pkg, { srcDir: 'src' })
    // success === false here means eslint had errors/warnings on the bad input,
    // but prettier still ran. Only fail on hard errors (read/write/prettier exceptions).
    assert.deepEqual(result.errors, [], `format hard errors: ${JSON.stringify(result.errors)}`)
    assert.ok(result.changed >= 1, `cjs file must be formatted, changed=${result.changed}`)

    const formatted = fs.readFileSync(newFile, 'utf8')
    assert.notEqual(formatted, ugly)
    assert.ok(formatted.includes('module.exports'))
  } finally { rmrf(root) }
})

test('newly added .mts file gets formatted', async () => {
  const { root, pkg } = mkPkg()
  try {
    const newFile = path.join(pkg, 'src', 'helper.mts')
    const ugly = 'export    const   x   =     "v";\n'
    fs.writeFileSync(newFile, ugly)

    const result = await formatPackage(pkg, { srcDir: 'src' })
    // success === false here means eslint had errors/warnings on the bad input,
    // but prettier still ran. Only fail on hard errors (read/write/prettier exceptions).
    assert.deepEqual(result.errors, [], `format hard errors: ${JSON.stringify(result.errors)}`)
    assert.ok(result.changed >= 1, 'mts file must be formatted')

    const formatted = fs.readFileSync(newFile, 'utf8')
    assert.ok(formatted.includes("'v'") || formatted.includes('"v"'))
    assert.notEqual(formatted, ugly)
  } finally { rmrf(root) }
})

test('newly added .tsx file gets formatted', async () => {
  const { root, pkg } = mkPkg()
  try {
    const newFile = path.join(pkg, 'src', 'C.tsx')
    const ugly = 'export   const  C  =  ()  =>   "x";\n'
    fs.writeFileSync(newFile, ugly)

    const result = await formatPackage(pkg, { srcDir: 'src' })
    // success === false here means eslint had errors/warnings on the bad input,
    // but prettier still ran. Only fail on hard errors (read/write/prettier exceptions).
    assert.deepEqual(result.errors, [], `format hard errors: ${JSON.stringify(result.errors)}`)
    assert.ok(result.changed >= 1, 'tsx file must be formatted')

    const formatted = fs.readFileSync(newFile, 'utf8')
    assert.notEqual(formatted, ugly)
  } finally { rmrf(root) }
})

test('after format, second run is a cache hit', async () => {
  const { root, pkg } = mkPkg()
  try {
    fs.writeFileSync(path.join(pkg, 'src', 'a.ts'), 'export    const   a   =   1\n')
    const h0 = calculatePackageHash(pkg)
    const r1 = await formatPackage(pkg, { srcDir: 'src' })
    assert.ok(r1.changed >= 1)

    // Mimic what format.js phase does: recompute hash after format and mark
    const h1 = calculatePackageHash(pkg)
    markPhaseCompleted(pkg, h1, 'format', null, [])

    assert.equal(isPhaseCached(pkg, calculatePackageHash(pkg), 'format', null, []), true,
      'second run with no edits must hit cache')

    // Re-running format must produce no changes
    const r2 = await formatPackage(pkg, { srcDir: 'src' })
    assert.equal(r2.changed, 0, 'idempotent: already formatted file must not change again')
  } finally { rmrf(root) }
})
