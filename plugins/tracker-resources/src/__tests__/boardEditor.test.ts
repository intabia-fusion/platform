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

import { setCurrentAccount, type TxOperations } from '@hcengineering/core'
import type { Board } from '@hcengineering/tracker'
import { BoardEditor, canDeleteBoard, StatusCounts } from '../boards'

jest.mock('@hcengineering/contact', () => ({ getCurrentEmployeeSpace: () => undefined }))
jest.mock('@hcengineering/presentation', () => ({ createQuery: jest.fn() }))
jest.mock('@hcengineering/ui', () => ({ getCurrentResolvedLocation: jest.fn(), navigate: jest.fn() }))
jest.mock('@hcengineering/view-resources', () => ({ filtersToQuery: jest.fn(), parseFilters: jest.fn() }))
setCurrentAccount(stub<any>({ uuid: 'anna' }))

function stub<T> (value: object): T {
  return value as T
}

function makeBoard (extra: object = {}): Board {
  return stub<Board>({ _id: 'b1', space: 'core:space:Workspace', title: 't', columns: [], author: 'anna', ...extra })
}

interface Call {
  patch: any
  done: { resolve: () => void, reject: (e: Error) => void }
}

// update() waits until the test settles it
function pendingClient (): { client: TxOperations, calls: Call[] } {
  const calls: Call[] = []
  const client = stub<TxOperations>({
    update: async (_doc: unknown, patch: unknown) => {
      await new Promise<void>((resolve, reject) => {
        calls.push({ patch, done: { resolve, reject } })
      })
    }
  })
  return { client, calls }
}

describe('BoardEditor', () => {
  it('keeps pending edits when the echo of an earlier one arrives', async () => {
    const { client, calls } = pendingClient()
    const base = makeBoard()
    const editor = new BoardEditor(
      base,
      client,
      () => {},
      () => {}
    )
    const a = editor.edit({ title: 'A' })
    const b = editor.edit({ columns: [{ id: 'c', title: 'B', category: 'x', statuses: [] }] as any })
    editor.receive(makeBoard({ title: 'A' }))
    const c = editor.edit({ description: 'C' })
    expect(editor.board.columns).toHaveLength(1)
    expect(editor.board.title).toBe('A')
    expect(editor.board.description).toBe('C')
    calls.forEach((x) => {
      x.done.resolve()
    })
    await Promise.all([a, b, c])
  })

  it('takes the server version after the last edit settles', async () => {
    const { client, calls } = pendingClient()
    const editor = new BoardEditor(
      makeBoard(),
      client,
      () => {},
      () => {}
    )
    const a = editor.edit({ title: 'A' })
    editor.receive(makeBoard({ title: 'server' }))
    calls[0].done.resolve()
    await a
    expect(editor.board.title).toBe('server')
  })

  it('rolls back a failed edit, keeps the later one and reports the error', async () => {
    const { client, calls } = pendingClient()
    const errors: unknown[] = []
    const editor = new BoardEditor(
      makeBoard(),
      client,
      () => {},
      (e) => errors.push(e)
    )
    const a = editor.edit({ title: 'A' })
    const b = editor.edit({ description: 'B' })
    calls[0].done.reject(new Error('Forbidden'))
    await a
    expect(editor.board.title).toBe('t')
    expect(editor.board.description).toBe('B')
    expect(errors).toHaveLength(1)
    calls[1].done.resolve()
    await b
  })

  it('reports an error thrown before the write and changes nothing', async () => {
    const { client, calls } = pendingClient()
    const errors: unknown[] = []
    const editor = new BoardEditor(
      makeBoard(),
      client,
      () => {},
      (e) => errors.push(e)
    )
    await editor.edit({ visibility: 'me' })
    expect(calls).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(editor.board.visibility).toBeUndefined()
  })
})

describe('StatusCounts', () => {
  // The server counts: each query answers with the total of its status
  function issuesClient (statuses: string[]): { client: TxOperations, findAll: jest.Mock } {
    const findAll = jest.fn(async (_class: unknown, query: { status: string }) =>
      Object.assign([], { total: statuses.filter((s) => s === query.status).length })
    )
    return { client: stub<TxOperations>({ findAll }), findAll }
  }

  it('counts each status by the server, without fetching the issues', async () => {
    const { client, findAll } = issuesClient(['s1', 's1', 's2'])
    const counts = new StatusCounts()
    const res = await counts.load(client, ['p1' as any, 'p2' as any], ['s1', 's2', 's3', 's1'] as any)
    expect(res.get('s1' as any)).toBe(2)
    expect(res.get('s2' as any)).toBe(1)
    expect(res.get('s3' as any)).toBe(0)
    expect(findAll).toHaveBeenCalledTimes(3)
    for (const call of findAll.mock.calls) expect(call[2]).toEqual({ limit: 1, total: true })
  })

  it('does not query again for equal inputs', async () => {
    const { client, findAll } = issuesClient(['s1'])
    const counts = new StatusCounts()
    await counts.load(client, ['p1' as any], ['s1', 's2'] as any)
    // A status moved between columns keeps the set: no new queries
    await counts.load(client, ['p1' as any], ['s2', 's1'] as any)
    expect(findAll).toHaveBeenCalledTimes(2)
    await counts.load(client, ['p1' as any, 'p2' as any], ['s1', 's2'] as any)
    expect(findAll).toHaveBeenCalledTimes(4)
  })
})

describe('canDeleteBoard', () => {
  it('lets only the author delete', () => {
    expect(canDeleteBoard(makeBoard({ author: 'anna', editors: ['bob'] }), 'anna' as any)).toBe(true)
    expect(canDeleteBoard(makeBoard({ author: 'anna', editors: ['bob'] }), 'bob' as any)).toBe(false)
  })
})
