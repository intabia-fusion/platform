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

import type { LoginInfoWithWorkspaces } from '@hcengineering/account-client'
import core, { WorkspaceEvent, type Account, type WorkspaceIds } from '@hcengineering/core'
import type { ClientSessionCtx, OneSecondCounters } from '@hcengineering/server-core'
import type { Token } from '@hcengineering/server-token'

import { ClientSession } from '../client'

function makeToken (extra?: Record<string, string>): Token {
  return { account: 'acc-1', workspace: 'ws-1', extra } as unknown as Token
}

describe('ClientSession.includeSessionContext', () => {
  it('a plain RPC does not inherit opsApi', () => {
    const workspace = {} as unknown as WorkspaceIds
    const account = {} as unknown as Account
    const info = {} as unknown as LoginInfoWithWorkspaces
    const counters = {} as unknown as OneSecondCounters
    const session = new ClientSession(makeToken(), workspace, account, info, false, counters)

    // /api/v1/ops is the only place that sets opsApi on contextData, after this call returns.
    const ctx = {
      ctx: {},
      pipeline: { context: { modelDb: {} } },
      socialStringsToUsers: new Map()
    } as unknown as ClientSessionCtx

    session.includeSessionContext(ctx)

    expect((ctx.ctx as any).contextData.opsApi).toBeUndefined()
  })
})

describe('ClientSession upload/clean without allowUpload', () => {
  const make = (): { session: ClientSession, ctx: ClientSessionCtx, ops: any } => {
    const counters = {} as unknown as OneSecondCounters
    const session = new ClientSession(
      makeToken(),
      {} as unknown as WorkspaceIds,
      {} as unknown as Account,
      {} as unknown as LoginInfoWithWorkspaces,
      false,
      counters
    )
    const ops = { upload: jest.fn(), clean: jest.fn() }
    jest.spyOn(session, 'getOps').mockReturnValue(ops as any)
    const ctx = {
      ctx: { error: jest.fn() },
      pipeline: {},
      requestId: 1,
      sendResponse: jest.fn(),
      sendError: jest.fn()
    } as unknown as ClientSessionCtx
    return { session, ctx, ops }
  }

  it('upload is rejected once and does not run', async () => {
    const { session, ctx, ops } = make()
    await session.upload(ctx, 'tx' as any, [])
    expect(ops.upload).not.toHaveBeenCalled()
    expect(ctx.sendResponse).toHaveBeenCalledTimes(1)
    expect(ctx.sendResponse).toHaveBeenCalledWith(1, { error: 'Upload not allowed' })
  })

  it('clean is rejected once and does not run', async () => {
    const { session, ctx, ops } = make()
    await session.clean(ctx, 'tx' as any, [])
    expect(ops.clean).not.toHaveBeenCalled()
    expect(ctx.sendResponse).toHaveBeenCalledTimes(1)
    expect(ctx.sendResponse).toHaveBeenCalledWith(1, { error: 'Clean not allowed' })
  })
})

describe('ClientSession.broadcast', () => {
  const make = (): { session: ClientSession, socket: any } => {
    const session = new ClientSession(
      makeToken(),
      {} as unknown as WorkspaceIds,
      {} as unknown as Account,
      {} as unknown as LoginInfoWithWorkspaces,
      false,
      {} as unknown as OneSecondCounters
    )
    return { session, socket: { send: jest.fn() } }
  }
  const txes = (n: number): any[] =>
    Array.from({ length: n }, (_, i) => ({
      _id: `tx${i}`,
      _class: core.class.TxCreateDoc,
      objectClass: core.class.Space
    }))

  it('sends a small batch as is', () => {
    const { session, socket } = make()
    const batch = txes(3)
    session.broadcast({} as any, socket, batch)
    expect(socket.send.mock.calls[0][1]).toEqual({ result: batch })
  })

  it('collapses a batch over 10000 txes into one bulk update event', () => {
    const { session, socket } = make()
    session.broadcast({} as any, socket, txes(10001))
    const result = socket.send.mock.calls[0][1].result
    expect(result).toHaveLength(1)
    expect(result[0].event).toBe(WorkspaceEvent.BulkUpdate)
    expect(result[0].params._class).toEqual([core.class.Space])
  })
})
