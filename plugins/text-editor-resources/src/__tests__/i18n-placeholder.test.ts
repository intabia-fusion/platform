/** @jest-environment jsdom */

//
// Copyright © 2026 TraceX SAS.
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

import { Editor, Node, type AnyExtension } from '@tiptap/core'
import { writable } from 'svelte/store'
import { I18nPlaceholderExtension } from '../components/extension/i18nPlaceholder'

// svelte/store ships as ESM only, which Jest cannot load here, so provide a minimal store
jest.mock('svelte/store', () => {
  function writable<T> (value: T): any {
    const subscribers = new Set<(value: T) => void>()
    return {
      set (next: T): void {
        value = next
        subscribers.forEach((subscriber) => {
          subscriber(value)
        })
      },
      subscribe (subscriber: (value: T) => void): () => void {
        subscribers.add(subscriber)
        subscriber(value)
        return () => subscribers.delete(subscriber)
      }
    }
  }
  function get<T> (store: { subscribe: (subscriber: (value: T) => void) => () => void }): T {
    let current: T | undefined
    store.subscribe((value) => (current = value))()
    return current as T
  }
  return { writable, get }
})

jest.mock('@hcengineering/platform', () => ({
  translate: jest.fn(async (key: string, _params: unknown, language: string) => `${key}:${language}`)
}))

const nodes: AnyExtension[] = [
  Node.create({ name: 'doc', topNode: true, content: 'block+' }),
  Node.create({ name: 'text', group: 'inline' }),
  Node.create({
    name: 'paragraph',
    group: 'block',
    content: 'inline*',
    parseHTML: () => [{ tag: 'p' }],
    renderHTML: () => ['p', 0]
  })
]

async function flush (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function placeholderOf (editor: Editor): string | null {
  return editor.view.dom.querySelector('p')?.getAttribute('data-placeholder') ?? null
}

describe('I18nPlaceholderExtension', () => {
  let editor: Editor | undefined

  afterEach(() => {
    editor?.destroy()
    editor = undefined
  })

  it('renders the translated placeholder on an empty editor', async () => {
    const themeStore = writable({ language: 'en' } as any)
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [...nodes, I18nPlaceholderExtension.configure({ placeholderIntl: 'editor:Start' as any, themeStore })]
    })
    await flush()

    expect(placeholderOf(editor)).toBe('editor:Start:en')
    expect(editor.view.dom.querySelector('p')?.classList.contains('is-editor-empty')).toBe(true)
  })

  it('updates the placeholder when the language changes', async () => {
    const themeStore = writable({ language: 'en' } as any)
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [...nodes, I18nPlaceholderExtension.configure({ placeholderIntl: 'editor:Start' as any, themeStore })]
    })
    await flush()

    themeStore.set({ language: 'fr' } as any)
    await flush()

    expect(placeholderOf(editor)).toBe('editor:Start:fr')
  })
})
