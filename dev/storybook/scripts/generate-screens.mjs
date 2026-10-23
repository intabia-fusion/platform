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

// Writes stories into src/design/generated/stories for every screen file of dev/design/design.json that has a "storybook"
// title: one story per frame, a canvas story for a page of several frames, and a canvas of all pages only for "canvas": true.
// Story files must list their exports statically, so the page and frame list is recorded here, in Node.
// Run: node scripts/generate-screens.mjs (Node 24 strips the TypeScript of the recorder itself)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const design = join(here, '../../design')
const generated = join(here, '../src/design/generated')
const { createRecorder } = await import(join(generated, 'recorder.ts'))
const { screenFiles } = await import(join(generated, 'entries.ts'))

const read = (path) => readFileSync(join(design, path), 'utf8')
const tokens = read('kit/00-tokens.generated.js')
const demo = JSON.parse(read('../storybook/src/design/demo/demo.generated.json'))

const q = (value) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
const header = readFileSync(import.meta.filename, 'utf8').split('\n').slice(0, 14).join('\n')
const out = join(generated, 'stories')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

for (const file of screenFiles(read('design.json'))) {
  const rec = createRecorder(tokens)
  for (const entry of file.build) {
    await rec.run({ tokens, demo, scripts: entry.map((path) => ({ path, source: read(path) })) })
  }
  const slug = file.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const group = q(file.title)
  for (const [i, page] of rec.pages.entries()) {
    // A canvas of one frame repeats the frame story
    const canvas = page.frames.length > 1
      ? `export const Canvas: StoryObj = {
  parameters: { controls: { disable: true } },
  render: () => ({ Component: CanvasView, props: { group, page } })
}
`
      : ''
    const frames = page.frames.map((f, n) => `export const Frame${n + 1}: Story = { name: ${q(f.name)}, args: { group, page, frame: ${n} } }`)
    const body = `${header}

import type { Meta, StoryObj } from '@storybook/svelte'

${canvas !== '' ? "import CanvasView from '../Canvas.svelte'\n" : ''}import Screen from '../Screen.svelte'

const group = ${group}
const page = ${q(page.name)}

const meta = {
  title: ${q(file.title + '/' + page.name)},
  component: Screen,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' }
} satisfies Meta<Screen>

export default meta
type Story = StoryObj<typeof meta>

${canvas}${frames.join('\n')}
`
    writeFileSync(join(out, `${slug}-page-${i + 1}.stories.ts`), body)
    console.log(`${file.title} page-${i + 1}: ${page.name} (${page.frames.length} frames)`)
  }

  if (!file.canvas) continue
  writeFileSync(
    join(out, `${slug}-canvas.stories.ts`),
    `${header}

import type { Meta, StoryObj } from '@storybook/svelte'

import CanvasView from '../Canvas.svelte'

const meta = {
  title: ${group},
  component: CanvasView,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' }
} satisfies Meta

export default meta

export const Canvas: StoryObj = { parameters: { controls: { disable: true } }, args: { group: ${group} } }
`
  )
}
