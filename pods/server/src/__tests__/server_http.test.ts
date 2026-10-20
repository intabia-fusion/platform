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

import { MeasureMetricsContext, systemAccountUuid, toFindResult, type WorkspaceUuid } from '@hcengineering/core'
import { createDummyStorageAdapter } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import { createServer, type AddressInfo } from 'net'
import { startHttpServer } from '../server_http'

const accountClient = {
  ensurePerson: jest.fn()
}

jest.mock('@hcengineering/account-client', () => ({
  ...jest.requireActual('@hcengineering/account-client'),
  getClient: () => accountClient
}))

async function freePort (): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>((resolve) =>
    probe.close(() => {
      resolve()
    })
  )
  return port
}

describe('http handlers', () => {
  const workspace = '123e4567-e89b-12d3-a456-426614174001' as WorkspaceUuid
  const ctx = new MeasureMetricsContext('test', {})
  const sessions = {
    closeWorkspaces: async () => {},
    scheduleMaintenance: jest.fn(),
    addSession: jest.fn(),
    handleRPC: jest.fn()
  }
  let port = 0
  let shutdown: () => Promise<void>

  beforeAll(async () => {
    port = await freePort()
    shutdown = startHttpServer(ctx, sessions as any, port, '', createDummyStorageAdapter())
  })

  afterAll(async () => {
    await shutdown()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  const url = (path: string): string => `http://localhost:${port}${path}`
  const auth = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` })

  describe('PUT /api/v1/manage', () => {
    it('answers 400 to a maintenance request with an unreadable body', async () => {
      const res = await fetch(url('/api/v1/manage?operation=maintenance'), {
        method: 'PUT',
        headers: auth(generateToken(systemAccountUuid, workspace)),
        body: '{not json',
        signal: AbortSignal.timeout(2000)
      })
      expect(res.status).toBe(400)
      expect(sessions.scheduleMaintenance).not.toHaveBeenCalled()
    })
  })

  describe('rpc', () => {
    it('answers 401 without an Authorization header', async () => {
      const res = await fetch(url(`/api/v1/ping/${workspace}`))
      expect(res.status).toBe(401)
    })

    it('ensure-person trusts a successful apply even if the person is not visible yet', async () => {
      const txRaw = jest.fn(async () => ({
        result: { success: true },
        broadcastPromise: Promise.resolve(),
        asyncsPromise: undefined
      }))
      const session = {
        getUser: () => systemAccountUuid,
        getSocialIds: () => [],
        findAllRaw: async () => toFindResult([]),
        txRaw
      }
      sessions.addSession.mockResolvedValue({ session, workspaceId: workspace, context: ctx })
      sessions.handleRPC.mockImplementation(async (ctx, session, method, client, operation) => {
        await operation({ ctx }, undefined)
        return undefined
      })
      accountClient.ensurePerson.mockResolvedValue({ uuid: 'person-uuid', socialId: 'social-id' })

      const res = await fetch(url(`/api/v1/ensure-person/${workspace}`), {
        method: 'POST',
        headers: auth(generateToken(systemAccountUuid, workspace)),
        body: JSON.stringify({ socialType: 'email', socialValue: 'a@b.c', firstName: 'A', lastName: 'B' })
      })

      expect(res.status).toBe(200)
      expect((await res.json()).localPerson).not.toBeNull()
      const personApplies = txRaw.mock.calls.filter(([, tx]: any[]) => tx.scope?.startsWith('ensure-person-') === true)
      expect(personApplies).toHaveLength(1)
    })
  })
})
