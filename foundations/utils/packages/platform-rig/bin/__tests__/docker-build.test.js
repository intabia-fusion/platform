/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { hashBundleDir } = require('../phases/docker-build')

// An image built from a truncated bundle.js carried the same label as a good one, so the cache never rebuilt it.
test('hashBundleDir follows bundle content, ignores source maps', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-build-'))
  assert.equal(hashBundleDir(cwd), '')
  fs.mkdirSync(path.join(cwd, 'bundle'))
  fs.writeFileSync(path.join(cwd, 'bundle', 'bundle.js'), 'function parseIPv6Section(add')
  const truncated = hashBundleDir(cwd)
  fs.writeFileSync(path.join(cwd, 'bundle', 'bundle.js.map'), '{}')
  assert.equal(hashBundleDir(cwd), truncated)
  fs.writeFileSync(path.join(cwd, 'bundle', 'bundle.js'), 'function parseIPv6Section(address) {}')
  assert.notEqual(hashBundleDir(cwd), truncated)
  fs.rmSync(cwd, { recursive: true })
})
