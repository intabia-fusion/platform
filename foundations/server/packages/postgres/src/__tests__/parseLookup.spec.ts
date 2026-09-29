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

import { MeasureMetricsContext } from '@hcengineering/core'
import { PostgresAdapter } from '../storage'
import type { JoinProps } from '../utils'

// Postgres hands a bigint/integer column over as a string: a row read with a lookup must still get
// numbers for the columns of its own domain and of the joined one, as a row without a lookup does.
describe('parseLookup', () => {
  const ctx = new MeasureMetricsContext('test', {})
  const adapter = Object.create(PostgresAdapter.prototype)

  const parse = async (rows: any[], joins: JoinProps[]): Promise<any[]> =>
    await adapter.parseLookup(ctx, rows, joins, undefined, undefined, 'activity')

  it('reads the numeric columns of the domain as numbers', async () => {
    const [doc] = await parse(
      [
        {
          _id: 'msg:1',
          _class: 'chunter:class:ChatMessage',
          modifiedOn: '1790671315000',
          createdOn: '1790671300000',
          lastReply: '1790671315240',
          replies: '4',
          data: { message: 'hi' }
        }
      ],
      []
    )

    expect(doc.lastReply).toBe(1790671315240)
    expect(doc.replies).toBe(4)
    expect(doc.modifiedOn).toBe(1790671315000)
    expect(doc.message).toBe('hi')
  })

  it('reads the numeric columns of a joined doc as numbers', async () => {
    const join: JoinProps = {
      table: 'activity',
      path: 'attachedTo',
      fromAlias: 'collaborator',
      fromField: 'attachedTo',
      toAlias: 'lookup_activity_attachedTo',
      toField: '_id',
      isReverse: false
    }
    const [doc] = await parse(
      [
        {
          _id: 'collab:1',
          _class: 'core:class:Collaborator',
          modifiedOn: '1',
          data: {},
          lookup_activity_attachedTo__id: 'msg:1',
          lookup_activity_attachedTo_createdOn: '1790671300000',
          lookup_activity_attachedTo_lastReply: '1790671315240',
          lookup_activity_attachedTo_replies: '4',
          lookup_activity_attachedTo_attachedTo: 'space:general'
        }
      ],
      [join]
    )

    const parent = doc.$lookup.attachedTo
    expect(parent.lastReply).toBe(1790671315240)
    expect(parent.replies).toBe(4)
    expect(parent.createdOn).toBe(1790671300000)
    expect(parent.attachedTo).toBe('space:general')
  })
})
