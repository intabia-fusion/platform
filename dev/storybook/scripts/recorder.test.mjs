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
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createRequire } from 'node:module'

import { createRecorder } from '../src/design/generated/recorder.ts'
import { screenFiles } from '../src/design/generated/entries.ts'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const tokens = read('../../design/kit/00-tokens.generated.js')

test('the board catalog compiles with the production Svelte DOM compiler', async () => {
  const require = createRequire(new URL('../../../plugins/tracker-resources/package.json', import.meta.url))
  const { compile, preprocess } = require('svelte/compiler')
  const sveltePreprocess = require('svelte-preprocess')
  for (const component of ['BoardPage', 'BoardCatalogPresenter']) {
    const filename = fileURLToPath(new URL(`../../../plugins/tracker-resources/src/components/boards/${component}.svelte`, import.meta.url))
    const processed = await preprocess(readFileSync(filename, 'utf8'), sveltePreprocess({
      typescript: { compilerOptions: { verbatimModuleSyntax: true } }
    }), { filename })
    assert.doesNotThrow(() => compile(processed.code, { filename, generate: 'dom', css: 'external' }))
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

test('board settings place the board selector before the title and keep sharing in actions', async () => {
  const recorder = createRecorder(tokens)
  await recorder.run({
    tokens,
    demo: JSON.parse(read('../src/design/demo/demo.generated.json')),
    scripts: [{
      path: 'screens/current/tracker-board-settings.js',
      source: read('../../design/screens/current/tracker-board-settings.js')
    }]
  })
  const pending = recorder.pages.flatMap((page) => page.frames)
  let checked = 0
  while (pending.length > 0) {
    const node = pending.pop()
    pending.push(...node.children)
    if (node.c !== 'SettingsLayout') continue
    const leading = node.children.filter((child) => child.slot === 'titleActions')
    const actions = node.children.filter((child) => child.slot === 'actions')
    assert.equal(leading.length, 1)
    assert.equal(leading[0].props.label, 'Основная доска')
    assert.equal(actions.some((child) => child.props.label === 'Основная доска'), false)
    assert.equal(actions.some((child) => child.props.label === 'Поделиться'), true)
    checked++
  }
  assert.equal(checked, 6)
})

test('current tracker sidebars retain catalog actions beside creation buttons', async () => {
  const demo = JSON.parse(read('../src/design/demo/demo.generated.json'))
  let checked = 0
  for (const file of ['tracker-board-settings.js', 'settings-project.js', 'tracker-boards.js']) {
    const recorder = createRecorder(tokens)
    await recorder.run({
      tokens,
      demo,
      scripts: [{ path: `screens/current/${file}`, source: read(`../../design/screens/current/${file}`) }]
    })
    for (const frame of recorder.pages.flatMap((page) => page.frames)) {
      if (frame.name.startsWith('Стало -')) continue
      const entries = frame.props.nav.entries
      for (const [group, label] of [['Доски', 'Все доски'], ['Проекты', 'Все проекты']]) {
        const section = entries.find((entry) => entry.group === group)
        assert.ok(section, `${frame.name}: ${group}`)
        assert.equal(section.add, true)
        assert.deepEqual(section.catalog, { label, icon: 'kit/BulletList' })
      }
      assert.equal(entries.some((entry) => entry.item === 'Доски'), false)
      checked++
    }
  }
  assert.equal(checked, 18)
})
