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
import { screenFiles } from '../src/design/generated/entries.ts'

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

test('status icons use the complete shared demo order and preserve the half-circle fallback', () => {
  const demo = JSON.parse(read('../src/design/demo/demo.generated.json'))
  const source = read('../../design/kit/20-atoms.js')
  const start = source.indexOf('kit.CATEGORY =')
  const end = source.indexOf('// Priority icon:', start)
  const kit = { svg: (svg) => svg }
  new Function('kit', 'P', 'DEMO', source.slice(start, end))(kit, (color) => color, demo)
  const statuses = demo.en.statuses.filter((status) => status.category === 'active')
  const mock = read('../src/design/kit/Status/StatusIcon.svelte')
  const position = new Function('demo', 'status', [
    ...mock.split('\n').filter((line) => /\$: (projectStatuses|index|count) =/.test(line)).map((line) => line.replace('$:', 'const')),
    'return { index, count }'
  ].join('\n'))
  for (const name of ['In Progress', 'Development', 'Verification', 'Unknown status', undefined]) {
    const { index, count } = position(demo, { name, category: 'active' })
    assert.equal(index, statuses.findIndex((status) => status.name === name) + 1)
    assert.equal(count, statuses.length + 1)
    const angle = index > 0 ? (2 * Math.PI * index) / count : Math.PI
    const large = index > 0 ? Number(index > (count - 1) / 2) : 1
    const svg = kit.StatusIcon('active', 16, undefined, name)
    assert.ok(svg.includes(`M 9 9 L 18 9 A 9 9 0 ${large} 1 ${Math.cos(angle - 0.01) * 9 + 9} ${Math.sin(angle - 0.01) * 9 + 9} Z`))
    assert.ok(!svg.includes('dash'))
  }
})

test('recorder keeps status identity in cards, groups and single-status columns only', async () => {
  const recorder = createRecorder(tokens)
  const nodes = await recorder.run({
    tokens,
    demo: {},
    scripts: [{ path: 'statuses.js', source: `return [
      kit.StatusIcon('active', 16, undefined, 'Verification'),
      kit.IssueCard({ id: 'APP-9', cat: 'active', statusName: 'In Progress' }),
      kit.IssueGroup({ name: 'In Progress', cat: 'active', issues: [] }),
      kit.ColumnHeader('Work', 'active', 0, 300, { statuses: [['Verification', 'active']] }),
      kit.ColumnHeader('In Progress', 'active', 0, 300, { statuses: [['In Progress', 'active'], ['Verification', 'active']] })
    ]` }]
  })
  assert.equal(nodes[0].props.status.name, 'Verification')
  assert.equal(nodes[1].props.issue.status.name, 'In Progress')
  assert.equal(nodes[2].props.status.name, 'In Progress')
  assert.equal(nodes[3].props.column.status.name, 'Verification')
  assert.equal(nodes[4].props.column.status.name, undefined)
})


test('current screens preserve the status of every active demo issue', async () => {
  const demo = JSON.parse(read('../src/design/demo/demo.generated.json'))
  const expected = new Map(demo.en.projects.flatMap((project) => project.issues).map((issue) => [issue.id, issue.status]))
  let checked = 0
  for (const file of screenFiles(read('../../design/design.json'))) {
    const recorder = createRecorder(tokens)
    for (const entry of file.build) {
      await recorder.run({
        tokens,
        demo,
        scripts: entry.map((path) => ({ path, source: read('../../design/' + path) }))
      })
    }
    const remaining = [...recorder.pages]
    while (remaining.length > 0) {
      const value = remaining.pop()
      if (value === null || typeof value !== 'object') continue
      if (value.id !== undefined && value.status?.category === 'active') {
        assert.equal(value.status.name, expected.get(value.id), value.id)
        assert.ok(value.status.name, value.id)
        checked++
      }
      remaining.push(...Object.values(value))
    }
  }
  assert.ok(checked > 0)
})
