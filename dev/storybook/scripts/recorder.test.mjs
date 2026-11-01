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

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { createRecorder } from '../src/design/generated/recorder.ts'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const tokens = read('../../design/kit/00-tokens.generated.js')

test('recorder measures text like the Penpot kit, including Cyrillic and missing glyphs', async () => {
  const source = read('../../design/kit/40-tracker.js')
  const measurement = source.slice(source.indexOf('const PLEX ='), source.indexOf('// Fixed columns'))
  const kit = {}
  new Function('kit', measurement)(kit)
  const recorder = createRecorder(tokens)
  for (const text of ['', 'In Progress', 'APP-123', 'Статусы', '🙂']) {
    for (const size of [12, 13, 16]) {
      const actual = await recorder.run({
        tokens,
        demo: {},
        scripts: [{ path: 'measurement.js', source: `return kit.textWidth(${JSON.stringify(text)}, ${size})` }]
      })
      assert.equal(actual, kit.textWidth(text, size))
    }
  }
})

test('screen evaluation failure preserves previously generated stories', () => {
  const directory = mkdtempSync(join(tmpdir(), 'storybook-generate-'))
  try {
    const sentinel = join(directory, 'existing.stories.ts')
    writeFileSync(sentinel, 'previous stories')
    const script = read('./generate-screens.mjs')
      .replace('const here = dirname(fileURLToPath(import.meta.url))', `const here = ${JSON.stringify(fileURLToPath(new URL('.', import.meta.url)))}`)
      .replace("const out = join(generated, 'stories')", `const out = ${JSON.stringify(directory)}`)
      .replace('const rec = createRecorder(tokens)', `throw new Error('screen evaluation failed')`)
    const generator = join(directory, 'generate.mjs')
    writeFileSync(generator, script)
    const result = spawnSync(process.execPath, [generator], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /screen evaluation failed/)
    assert.equal(readFileSync(sentinel, 'utf8'), 'previous stories')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
