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

import core, {
  type AccountUuid,
  type PersonId, type Ref, type Tx, TxFactory, TxProcessor, toFindResult, systemAccountUuid
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import tracker, { type Board, type BoardNavigationPreference } from '@hcengineering/tracker'
import { OnBoardMembers } from '../boardNavigation'

const author = 'author' as AccountUuid
const editor = 'editor' as AccountUuid
const authorSocial = 'email:author' as PersonId
const editorSocial = 'email:editor' as PersonId
const factory = new TxFactory(authorSocial)
const preferenceId = (account: AccountUuid): Ref<BoardNavigationPreference> =>
  `tracker:boards-navigation:${account}` as Ref<BoardNavigationPreference>

function setup (): { control: TriggerControl, preferences: Map<string, BoardNavigationPreference> } {
  const preferences = new Map<string, BoardNavigationPreference>()
  const control = {
    workspace: { uuid: 'test-workspace' },
    ctx: { warn: jest.fn(), contextData: { broadcast: { targets: {} } } },
    contextCache: new Map(),
    withScope: async (_scope: string, fn: () => Promise<unknown>) => await fn(),
    findAll: jest.fn(async (_ctx, cls, query) => {
      if (cls === tracker.class.BoardNavigationPreference) {
        return toFindResult([...preferences.values()].filter((p) => p._id === query._id))
      }
      return toFindResult([])
    }),
    apply: jest.fn(async (_ctx, txes: Tx[]) => {
      for (const tx of txes) {
        const cud = tx as any
        if (tx._class === core.class.TxCreateDoc) {
          preferences.set(cud.objectId, TxProcessor.createDoc2Doc(cud))
        } else {
          const before = preferences.get(cud.objectId)
          if (before !== undefined) preferences.set(cud.objectId, TxProcessor.updateDoc2Doc(before, cud))
        }
      }
      return {}
    })
  } as unknown as TriggerControl
  return { control, preferences }
}

jest.mock('@hcengineering/server-contact', () => ({
  getSocialIdsByAccounts: async () => ({ author: ['email:author'], editor: ['email:editor'] })
}))

function board (patch: Partial<Board> = {}): Board {
  return {
    _id: 'board',
    _class: tracker.class.Board,
    space: core.space.Workspace,
    author,
    editors: [],
    visibility: 'all',
    title: 'Board',
    ...patch
  } as unknown as Board
}

function create (b: Board): Tx {
  return factory.createTxCreateDoc(tracker.class.Board, b.space, b, b._id)
}

function update (control: TriggerControl, before: Board, patch: Partial<Board>): Tx {
  const tx = factory.createTxUpdateDoc(tracker.class.Board, before.space, before._id, patch)
  control.contextCache.set(`tracker:board-before:${tx._id}`, before)
  return tx
}

describe('board membership navigation', () => {
  it('adds a new board to its author and editors while they are offline', async () => {
    const { control, preferences } = setup()
    await OnBoardMembers([create(board({ editors: [editor] }))], control)
    expect(preferences.get(preferenceId(author))?.boards).toEqual(['board'])
    expect(preferences.get(preferenceId(editor))?.boards).toEqual(['board'])
    expect(preferences.get(preferenceId(editor))?.createdBy).toBe(editorSocial)
  })

  it('preserves the first-open catalogue snapshot without adding another user personal boards', async () => {
    const { control, preferences } = setup()
    const findAll = control.findAll
    control.findAll = (async (ctx, cls, query) => {
      if (cls === tracker.class.Board) {
        return toFindResult([
          board({ _id: 'shared' as Ref<Board> }),
          board({ _id: 'personal' as Ref<Board>, visibility: 'me' })
        ])
      }
      return await findAll(ctx, cls, query)
    }) as TriggerControl['findAll']
    await OnBoardMembers([create(board({ editors: [editor] }))], control)
    expect(preferences.get(preferenceId(author))?.boards).toEqual(['shared', 'personal', 'board'])
    expect(preferences.get(preferenceId(editor))?.boards).toEqual(['shared', 'board'])
  })

  it('adds only a newly assigned editor and preserves their existing menu', async () => {
    const { control, preferences } = setup()
    preferences.set(preferenceId(editor), { _id: preferenceId(editor), boards: ['other'], createdBy: editorSocial } as any)
    await OnBoardMembers([update(control, board(), { editors: [editor] })], control)
    expect(preferences.get(preferenceId(editor))?.boards).toEqual(['other', 'board'])
    expect(preferences.has(preferenceId(author))).toBe(false)
  })

  it('does not restore manually hidden boards on unrelated updates or an unchanged editor list', async () => {
    const { control, preferences } = setup()
    const before = board({ editors: [editor] })
    await OnBoardMembers([update(control, before, { title: 'Renamed' }),
      update(control, before, { editors: [editor] })], control)
    expect(preferences.size).toBe(0)
    expect(control.apply).not.toHaveBeenCalled()
  })

  it('keeps the board on removal and restores it on a new assignment without duplicates', async () => {
    const { control, preferences } = setup()
    preferences.set(preferenceId(editor), { _id: preferenceId(editor), boards: ['board'], createdBy: editorSocial } as any)
    await OnBoardMembers([update(control, board({ editors: [editor] }), { editors: [] })], control)
    expect(preferences.get(preferenceId(editor))?.boards).toEqual(['board'])
    const saved = preferences.get(preferenceId(editor))
    if (saved === undefined) throw new Error('Missing preference')
    saved.boards = []
    const tx = update(control, board(), { editors: [editor] })
    await OnBoardMembers([tx], control)
    await OnBoardMembers([tx], control)
    expect(preferences.get(preferenceId(editor))?.boards).toEqual(['board'])
  })

  it('never adds editors of a personal board', async () => {
    const { control, preferences } = setup()
    await OnBoardMembers([create(board({ visibility: 'me', editors: [editor] }))], control)
    expect(preferences.has(preferenceId(editor))).toBe(false)
    expect(preferences.get(preferenceId(author))?.boards).toEqual(['board'])
  })

  it('does not write to another account preference reserved under the recipient id', async () => {
    const { control, preferences } = setup()
    preferences.set(preferenceId(editor), {
      _id: preferenceId(editor), boards: [], createdBy: authorSocial
    } as any)
    await OnBoardMembers([update(control, board(), { editors: [editor] })], control)
    expect(control.apply).not.toHaveBeenCalled()
    expect(preferences.get(preferenceId(editor))?.boards).toEqual([])
    expect(control.ctx.warn).toHaveBeenCalled()
  })

  it('serializes concurrent assignments of different boards to one offline user', async () => {
    const { control, preferences } = setup()
    await Promise.all(['one', 'two', 'three', 'four'].map(async (id) =>
      await OnBoardMembers([create(board({ _id: id as Ref<Board>, editors: [editor] }))],
        { ...control, contextCache: new Map() })))
    expect(preferences.get(preferenceId(editor))?.boards.sort()).toEqual(['four', 'one', 'three', 'two'])
  })

  it('does not replace earlier private routing rules for an unrelated transaction', async () => {
    const { control } = setup()
    const unrelated = factory.createTxUpdateDoc(tracker.class.Board, core.space.Workspace, 'other' as Ref<Board>, {})
    control.ctx.contextData.broadcast.targets.previous = async (tx) =>
      tx._id === unrelated._id ? { target: [author] } : undefined
    await OnBoardMembers([create(board())], control)
    const results = await Promise.all(Object.values(control.ctx.contextData.broadcast.targets)
      .map(async (target) => await target(unrelated)))
    expect(results.filter(Boolean)).toEqual([{ target: [author] }])
  })

  it('routes each private change only to the preference owner and system', async () => {
    const { control } = setup()
    await OnBoardMembers([create(board({ editors: [editor] }))], control)
    const txes = (control.apply as jest.Mock).mock.calls.flatMap((c) => c[1])
    expect(txes).toHaveLength(2)
    const targets = Object.values(control.ctx.contextData.broadcast.targets)
    for (const tx of txes) {
      const owner = tx.objectId === preferenceId(author) ? author : editor
      const result = await Promise.all(targets.map(async (target) => await target(tx)))
      expect(result.filter(Boolean)).toEqual([{ target: [owner, systemAccountUuid] }])
    }
  })
})
