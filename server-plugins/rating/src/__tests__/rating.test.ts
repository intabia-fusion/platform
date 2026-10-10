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
  MeasureMetricsContext,
  TxFactory,
  TxProcessor,
  type Class,
  type Doc,
  type MeasureContext,
  type PersonId,
  type Ref,
  type SessionData,
  type Tx,
  type TxCreateDoc
} from '@hcengineering/core'
import rating, { ReactionKind, type DocReaction } from '@hcengineering/rating'
import { type Middleware } from '@hcengineering/server-core'
import { RatingMiddleware } from '..'

describe('RatingMiddleware', () => {
  const ctx = new MeasureMetricsContext('test', {}) as unknown as MeasureContext<SessionData>
  const issueClass = 'tracker:class:Issue' as Ref<Class<Doc>>
  const issue = 'issue-1' as Ref<Doc>
  let stored: Doc[]
  let middleware: Middleware

  beforeEach(async () => {
    stored = []
    const next = {
      findAll: async (ctx: any, _class: Ref<Class<Doc>>, query: Record<string, any>) =>
        stored.filter((doc) => doc._class === _class && Object.entries(query).every(([k, v]) => (doc as any)[k] === v)),
      tx: async (ctx: any, txes: Tx[]) => {
        for (const tx of txes) stored.push(TxProcessor.createDoc2Doc(tx as TxCreateDoc<Doc>))
        return {}
      }
    }
    middleware = await RatingMiddleware.create(ctx, {} as any, next as any)
  })

  function like (user: string, attachedTo: Ref<Doc>, attachedToClass: Ref<Class<Doc>>): TxCreateDoc<DocReaction> {
    const tx = new TxFactory(user as PersonId).createTxCreateDoc(rating.class.DocReaction, core.space.Workspace, {
      reactionType: ReactionKind.Star,
      value: 1
    } as any)
    return { ...tx, attachedTo, attachedToClass, collection: '_reactions' }
  }

  function reaction (user: string, attributes: Partial<DocReaction>): TxCreateDoc<DocReaction> {
    const tx = new TxFactory(user as PersonId).createTxCreateDoc(
      rating.class.DocReaction,
      core.space.Workspace,
      attributes as any
    )
    return { ...tx, attachedTo: issue, attachedToClass: issueClass, collection: '_reactions' }
  }

  // The web client creates every emoji with value 0, so only the emoji itself tells them apart.
  it('allows different emoji from the same user', async () => {
    await middleware.tx(ctx, [reaction('user1', { reactionType: ReactionKind.Emoji, value: 0, emoji: '👍' })])
    await middleware.tx(ctx, [reaction('user1', { reactionType: ReactionKind.Emoji, value: 0, emoji: '🎉' })])
    expect(stored).toHaveLength(2)
  })

  it('rejects the same emoji from the same user', async () => {
    await middleware.tx(ctx, [reaction('user1', { reactionType: ReactionKind.Emoji, value: 0, emoji: '👍' })])
    await expect(
      middleware.tx(ctx, [reaction('user1', { reactionType: ReactionKind.Emoji, value: 0, emoji: '👍' })])
    ).rejects.toThrow('Duplicate')
  })

  it('rejects a second star whatever its value', async () => {
    await middleware.tx(ctx, [reaction('user1', { reactionType: ReactionKind.Star, value: 0 })])
    await expect(
      middleware.tx(ctx, [reaction('user1', { reactionType: ReactionKind.Star, value: 1 })])
    ).rejects.toThrow('Duplicate')
  })

  it('rejects the same reaction from the same user', async () => {
    await middleware.tx(ctx, [like('user1', issue, issueClass)])
    await expect(middleware.tx(ctx, [like('user1', issue, issueClass)])).rejects.toThrow('Duplicate')
  })

  it('allows the same reaction from another user', async () => {
    await middleware.tx(ctx, [like('user1', issue, issueClass)])
    await middleware.tx(ctx, [like('user2', issue, issueClass)])
    expect(stored).toHaveLength(2)
  })

  it('rejects a repeated reaction to a reaction', async () => {
    const reaction = 'reaction-1' as Ref<Doc>
    await middleware.tx(ctx, [like('user1', reaction, rating.class.DocReaction)])
    await expect(middleware.tx(ctx, [like('user1', reaction, rating.class.DocReaction)])).rejects.toThrow('Duplicate')
  })
})
