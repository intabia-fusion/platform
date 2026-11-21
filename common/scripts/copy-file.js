#!/usr/bin/env node
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

// Copies one file, tolerating the Windows share that keeps a freshly written destination busy.
// `fs.cpSync` reports the collision as `EBUSY`/`EACCES` with an empty code ("The operation
// completed successfully"), which failed `bundle:template` on dev machines whenever a watcher or a
// docker build touched `bundle/` at the same time. Retrying a plain copy is enough: the file is
// small and the lock lives for milliseconds.
//
// Usage: node common/scripts/copy-file.js <source> <destination>

const { copyFileSync, mkdirSync, rmSync } = require('node:fs')
const { dirname } = require('node:path')

const [source, destination] = process.argv.slice(2)
if (source === undefined || destination === undefined) {
  console.error('Usage: copy-file.js <source> <destination>')
  process.exit(1)
}

mkdirSync(dirname(destination), { recursive: true })

const attempts = 10
for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
    copyFileSync(source, destination)
    process.exit(0)
  } catch (err) {
    // A destination we own may be read-only: drop it and retry instead of failing the build.
    try {
      rmSync(destination, { force: true })
    } catch {}
    if (attempt === attempts) {
      console.error(`Failed to copy ${source} -> ${destination}: ${err && err.message}`)
      process.exit(1)
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * attempt)
  }
}
