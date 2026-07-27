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
import { type WorkspaceUuid } from '@hcengineering/core'
import PostgresDB from '../db/postgres'

const WS = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' as WorkspaceUuid
const ctx: any = { info: jest.fn(), error: jest.fn(), warn: jest.fn() }

// Integer columns (usage_delta_dedup.amount BIGINT, livekit_egress.duration INTEGER) reject
// fractional binds with 22P02. Producers send fractional seconds, so the db layer must round.
function makeDb (): { db: any, execute: jest.Mock } {
  const execute = jest.fn().mockResolvedValue([])
  const db = Object.create(PostgresDB.prototype)
  db.execute = execute
  db.flavor = 'postgres'
  return { db, execute }
}

describe('PostgresDB integer binds', () => {
  it('rounds a fractional usage delta amount', async () => {
    const { db, execute } = makeDb()

    await db.accumulateUsageDelta(ctx, WS, 'transcript', 29.790000000000006, 'ref-1')

    const params = execute.mock.calls[0][1]
    expect(params[3]).toBe(30)
    expect(Number.isInteger(params[3])).toBe(true)
  })

  it('rounds a fractional egress duration', async () => {
    const { db, execute } = makeDb()

    await db.setLiveKitEgress(ctx, [
      {
        workspace: WS,
        egressId: 'eg-1',
        egressStart: new Date(0).toISOString(),
        egressEnd: new Date(0).toISOString(),
        room: 'room-1',
        duration: 263.2004035644531
      }
    ])

    const params = execute.mock.calls[0][1]
    expect(params[5]).toBe(263)
    expect(Number.isInteger(params[5])).toBe(true)
  })
})
