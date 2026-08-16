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

import type { WorkspaceClient } from '../workspace/workspaceClient'

// tools.ts pulls in config.ts, which throws without these; set them before requiring it.
process.env.ACCOUNTS_URL = 'http://account:3000'
process.env.SERVER_SECRET = 'secret'
process.env.FIRST_NAME = 'Julia'
process.env.LAST_NAME = 'AI'
process.env.STORAGE_CONFIG = 'minio'
process.env.CHUNK_STORAGE_CONFIG = 'minio'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getTools } = require('../utils/tools') as typeof import('../utils/tools')

const ctx = { objectId: 'o', objectClass: 'c', space: 's', collection: 'replies' } as any
const wsClient = {} as unknown as WorkspaceClient

const names = (features?: { tasks?: boolean }): string[] =>
  getTools(wsClient, 'thread', undefined, ctx, features).map((t: any) => t.function.name)

describe('task tool gating', () => {
  it('offers create_task and split_task when the level allows tasks', () => {
    expect(names()).toEqual(expect.arrayContaining(['propose_task', 'propose_subtasks']))
    expect(names({ tasks: true })).toEqual(expect.arrayContaining(['propose_task', 'propose_subtasks']))
  })

  it('withholds them when the level denies tasks, keeping the rest', () => {
    const withoutTasks = names({ tasks: false })
    expect(withoutTasks).not.toContain('propose_task')
    expect(withoutTasks).not.toContain('propose_subtasks')
    // Feature-less tools stay available.
    expect(withoutTasks).toContain('propose_new_document')
    expect(withoutTasks).toContain('rename_document')
  })
})

describe('subtask parsing', () => {
  // The model passes either plain strings or {title, description}; both must reach the card,
  // and empty titles must not create empty issues.
  const call = async (args: any): Promise<{ subtasks?: Array<{ title: string }> }> => {
    let posted: any
    const client = {
      postTaskProposal: async (_c: unknown, p: any) => {
        posted = p
        return true
      }
    } as unknown as WorkspaceClient
    const tool: any = getTools(client, 'thread', undefined, ctx).find((t: any) => t.function.name === 'propose_task')
    await tool.function.function(args)
    return posted
  }

  it('accepts strings and objects, dropping empty titles', async () => {
    const posted = await call({
      title: 'Root',
      subtasks: ['One', { title: 'Two', description: 'body' }, { title: ' ' }]
    })
    expect(posted.subtasks).toEqual([{ title: 'One' }, { title: 'Two', description: 'body' }])
  })

  it('accumulates across calls so a long list can arrive in batches', async () => {
    const ctxWithState: any = { ...ctx }
    const client = {
      postTaskProposal: async (c: any, p: any) => {
        c.pending = { kind: 'task', ...p }
        return true
      }
    } as unknown as WorkspaceClient
    const tool: any = getTools(client, 'thread', undefined, ctxWithState).find(
      (t: any) => t.function.name === 'propose_task'
    )
    await tool.function.function({ title: 'Root', subtasks: ['One', 'Two'] })
    const reply = await tool.function.function({ subtasks: ['Three'] })
    expect(ctxWithState.pending.subtasks.map((s: any) => s.title)).toEqual(['One', 'Two', 'Three'])
    // The second call keeps the title staged by the first one.
    expect(ctxWithState.pending.title).toBe('Root')
    expect(reply).toContain('holds 3')
  })

  it('refuses an empty title instead of posting a card', async () => {
    const tool: any = getTools(wsClient, 'thread', undefined, ctx).find((t: any) => t.function.name === 'propose_task')
    expect(await tool.function.function({ title: '  ' })).toContain('No title provided')
  })
})
