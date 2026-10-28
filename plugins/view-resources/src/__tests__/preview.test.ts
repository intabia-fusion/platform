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

import type { Client, DocPreview } from '@hcengineering/core'
import { getResource } from '@hcengineering/platform'
import { get } from 'svelte/store'
import { contextPreview, getContextPreview, getPreviewIcon, getPreviewTitle, previewTitle } from '../preview'

const findOne = jest.fn()
jest.mock('@hcengineering/presentation', () => ({ IconWithEmoji: 'IconWithEmoji', getClient: () => ({ findOne }) }))
// As the plugin tests do: the store module is ESM, jest here does not transform it.
jest.mock('svelte/store', () => {
  const readable = (initial: unknown, start?: (set: (value: unknown) => void) => (() => void) | undefined): any => {
    let value = initial
    let stop: (() => void) | undefined
    const subscribers = new Set<(value: unknown) => void>()
    const set = (next: unknown): void => {
      value = next
      for (const fn of subscribers) fn(value)
    }
    return {
      subscribe: (fn: (value: unknown) => void) => {
        if (subscribers.size === 0) stop = start?.(set) ?? undefined
        subscribers.add(fn)
        fn(value)
        return () => {
          subscribers.delete(fn)
          if (subscribers.size === 0) stop?.()
        }
      }
    }
  }
  const get = (store: any): unknown => {
    let value: unknown
    store.subscribe((it: unknown) => {
      value = it
    })()
    return value
  }
  return { readable, get }
})
// Only the class ref is read from core; the module itself would pull the platform runtime in.
jest.mock('@hcengineering/core', () => ({
  __esModule: true,
  default: { class: { DocPreview: 'core:class:DocPreview' } },
  getCurrentAccount: () => ({ uuid: 'me' })
}))
jest.mock('@hcengineering/platform', () => ({
  getResource: jest.fn(),
  translate: jest.fn(async (label: string) => `t:${label}`)
}))
jest.mock('@hcengineering/contact', () => ({
  __esModule: true,
  default: { function: { GetParticipantsName: 'contact:function:GetParticipantsName' } }
}))
jest.mock('@hcengineering/view', () => ({
  __esModule: true,
  default: { mixin: { ObjectIcon: 'view:mixin:ObjectIcon' } }
}))
jest.mock('../utils', () => ({
  classIcon: (_client: unknown, _class: string) => (_class === 'tracker:class:Issue' ? 'issue-icon' : undefined)
}))

const iconComponents: Record<string, string> = { 'chunter:class:Channel': 'ChannelIcon' }

const client = {
  getHierarchy: () => ({
    classHierarchyMixin: (_class: string) =>
      iconComponents[_class] != null ? { component: `component:${_class}` } : undefined,
    findClass: (_class: string) => ({ label: `label:${_class}` })
  })
} as unknown as Client

const preview = (data: Partial<DocPreview>): DocPreview =>
  ({ objectClass: 'tracker:class:Issue', title: '', archived: false, ...data }) as unknown as DocPreview

beforeEach(() => {
  findOne.mockReset()
  ;(getResource as jest.Mock).mockImplementation(async (id: string) =>
    id === 'contact:function:GetParticipantsName'
      ? async (_client: Client, title: string, accounts: string[]) => `names:${title}:${accounts.join('+')}`
      : `resolved:${id}`
  )
})

describe('getPreviewTitle', () => {
  it('takes the shared title', async () => {
    expect(await getPreviewTitle(client, preview({ title: 'Fix login' }), 'en')).toBe('Fix login')
  })

  it('builds a personal title from the members', async () => {
    const res = await getPreviewTitle(client, preview({ props: { members: ['a', 'b'] } }), 'en')
    expect(res).toBe('names::a+b')
  })

  it('builds a direct per viewer from its members and group name, not from the shared title', async () => {
    const direct = preview({
      objectId: 'doc-group' as any,
      title: 'Ann, Bob, Cat',
      props: { members: ['a', 'b', 'c'], name: 'Design' }
    })
    expect(await getPreviewTitle(client, direct, 'en')).toBe('names:Design:a+b+c')
    expect(get(previewTitle(client, direct, 'en'))).toBe('')
  })

  it('falls back to the label when the members are empty', async () => {
    const res = await getPreviewTitle(client, preview({ props: { members: [] } }), 'en')
    expect(res).toBe('t:label:tracker:class:Issue')
  })

  it('leaves a title-less preview empty without the label when asked', async () => {
    expect(await getPreviewTitle(client, preview({}), 'en', false)).toBe('')
  })

  it('falls back to the label of the preview, then of the class', async () => {
    expect(await getPreviewTitle(client, preview({ label: 'chunter:string:Direct' as any }), 'en')).toBe(
      't:chunter:string:Direct'
    )
    expect(await getPreviewTitle(client, preview({}), 'en')).toBe('t:label:tracker:class:Issue')
  })
})

describe('previewTitle', () => {
  const tick = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('gives the shared title at once, without waiting', () => {
    expect(get(previewTitle(client, preview({ title: 'Fix login' }), 'en'))).toBe('Fix login')
    expect(get(previewTitle(client, undefined, 'en'))).toBe('')
  })

  it('gives a personal title when it is built', async () => {
    const seen: unknown[] = []
    const unsubscribe = previewTitle(client, preview({ props: { members: ['a'] } }), 'en').subscribe((it) =>
      seen.push(it)
    )
    await tick()
    expect(seen).toEqual(['', 'names::a'])
    unsubscribe()
  })

  it('drops an answer that comes after the store is left', async () => {
    const seen: unknown[] = []
    const left = preview({ objectId: 'doc-left' as any, props: { members: ['a'] } })
    const unsubscribe = previewTitle(client, left, 'en').subscribe((it) => seen.push(it))
    unsubscribe()
    await tick()
    expect(seen).toEqual([''])
  })

  it('starts a re-created store from the title built last, not empty', async () => {
    const direct = preview({ objectId: 'doc-again' as any, props: { members: ['b'] } })
    previewTitle(client, direct, 'en').subscribe(() => {})()
    await tick()
    const seen: unknown[] = []
    const unsubscribe = previewTitle(client, direct, 'en').subscribe((it) => seen.push(it))
    await tick()
    expect(seen).toEqual(['names::b', 'names::b'])
    unsubscribe()
  })
})

describe('getPreviewIcon', () => {
  it('gives the icon component only the props the preview has', async () => {
    const res = await getPreviewIcon(
      client,
      preview({ objectClass: 'chunter:class:Channel' as any, icon: { props: { a: 1 } } })
    )
    expect(res.iconProps).toEqual({ a: 1 })
  })

  it('gives the icon component of the class its props from the preview', async () => {
    const res = await getPreviewIcon(
      client,
      preview({ objectClass: 'chunter:class:Channel' as any, icon: { asset: 'hash' as any, emoji: 128512 } }),
      { showStatus: true }
    )
    expect(res).toEqual({
      icon: 'resolved:component:chunter:class:Channel',
      iconProps: { asset: 'hash', emoji: 128512, showStatus: true }
    })
  })

  it('draws an emoji without a component', async () => {
    const res = await getPreviewIcon(client, preview({ icon: { emoji: 128512 } }))
    expect(res).toEqual({ icon: 'IconWithEmoji', iconProps: { icon: 128512 } })
  })

  it('falls back to the asset, then to the icon of the class', async () => {
    expect(await getPreviewIcon(client, preview({ icon: { asset: 'custom' as any } }))).toEqual({
      icon: 'custom',
      iconProps: {}
    })
    expect(await getPreviewIcon(client, preview({}))).toEqual({ icon: 'issue-icon', iconProps: {} })
  })
})

describe('the preview of an inbox context', () => {
  const joined = preview({ title: 'Joined' })
  const loaded = preview({ title: 'Loaded' })
  const context = (data: Record<string, unknown>): any => ({ _id: 'ctx-1', objectId: 'doc-1', ...data })

  it('takes the joined preview without a request', async () => {
    expect(await getContextPreview(context({ preview: 'preview-1', $lookup: { preview: joined } }))).toBe(joined)
    expect(findOne).not.toHaveBeenCalled()
  })

  it('loads the preview by its ref for a context that came without the join', async () => {
    findOne.mockResolvedValue(loaded)
    expect(await getContextPreview(context({ preview: 'preview-1' }))).toBe(loaded)
    expect(findOne).toHaveBeenCalledWith('core:class:DocPreview', { _id: 'preview-1' }, { showArchived: true })
  })

  it('draws the snapshot of a preview the user can no longer read, without a request', async () => {
    const snapshot = { objectId: 'doc-1', objectClass: 'class:Issue', title: 'Was', modifiedOn: 1 }
    expect(await getContextPreview(context({ preview: 'preview-1', previewSnapshot: snapshot }))).toBe(snapshot)
    expect(get(contextPreview(context({ preview: 'preview-1', previewSnapshot: snapshot })))).toBe(snapshot)
    expect(findOne).not.toHaveBeenCalled()
  })

  it('prefers the joined preview to a snapshot', async () => {
    const snapshot = { objectId: 'doc-1', objectClass: 'class:Issue', title: 'Was', modifiedOn: 1 }
    expect(
      await getContextPreview(
        context({ preview: 'preview-1', previewSnapshot: snapshot, $lookup: { preview: joined } })
      )
    ).toBe(joined)
  })

  it('gives nothing and asks nothing for a context without a ref', async () => {
    expect(await getContextPreview(context({}))).toBeUndefined()
    expect(findOne).not.toHaveBeenCalled()
  })

  it('as a store: the joined preview at once, a loaded one when it arrives, none without a ref', async () => {
    expect(get(contextPreview(context({ preview: 'preview-1', $lookup: { preview: joined } })))).toBe(joined)

    findOne.mockResolvedValue(loaded)
    const store = contextPreview(context({ preview: 'preview-1' }))
    const seen: unknown[] = []
    const unsubscribe = store.subscribe((it) => seen.push(it))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(seen).toEqual([undefined, loaded])
    unsubscribe()

    expect(get(contextPreview(context({})))).toBeUndefined()
    expect(findOne).toHaveBeenCalledTimes(1)
  })
})
