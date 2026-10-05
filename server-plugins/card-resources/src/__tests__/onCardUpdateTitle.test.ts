/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/
import card from '@hcengineering/card'
import core from '@hcengineering/core'
import plugin from '../index'

describe('OnCardUpdate title', () => {
  it('renames the card in descendants parentInfo at every depth', async () => {
    const a = { _id: 'a', _class: card.class.Card, space: core.space.Workspace, parentInfo: [] }
    const b = {
      _id: 'b',
      parent: 'a',
      _class: card.class.Card,
      space: core.space.Workspace,
      parentInfo: [{ _id: 'a', _class: card.class.Card, title: 'old' }]
    }
    const c = {
      _id: 'c',
      parent: 'b',
      _class: card.class.Card,
      space: core.space.Workspace,
      parentInfo: [
        { _id: 'a', _class: card.class.Card, title: 'old' },
        { _id: 'b', _class: card.class.Card, title: 'B' }
      ]
    }
    const all = [a, b, c]
    const control: any = {
      ctx: {},
      hierarchy: { findAttribute: () => undefined },
      findAll: jest.fn(async (_ctx: any, _class: any, query: any) =>
        all.filter((d: any) => Object.entries(query).every(([k, v]) => d[k] === v))
      ),
      txFactory: {
        createTxUpdateDoc: jest.fn((_class: any, space: any, objectId: any, operations: any) => ({
          objectId,
          operations
        }))
      }
    }
    const trigger = (await plugin()).trigger.OnCardUpdate as any
    const res = await trigger([{ objectId: 'a', operations: { title: 'new' }, modifiedBy: 'u' }], control)

    const byId = Object.fromEntries(res.map((t: any) => [t.objectId, t.operations.parentInfo]))
    expect(byId.c).toEqual([
      { _id: 'a', _class: card.class.Card, title: 'new' },
      { _id: 'b', _class: card.class.Card, title: 'B' }
    ])
  })
})
