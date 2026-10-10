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

import {
  MeasureMetricsContext,
  systemAccountUuid,
  toFindResult,
  type PersonUuid,
  type WorkspaceUuid
} from '@hcengineering/core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import { generateToken } from '@hcengineering/server-token'
import { createServer, type AddressInfo } from 'net'
import { type Readable } from 'stream'
import { startHttpServer } from '../server_http'

const accountClient = {
  getLoginInfoByToken: jest.fn(),
  ensurePerson: jest.fn()
}
const isWorkspaceLoginInfo = jest.fn()

jest.mock('@hcengineering/account-client', () => ({
  ...jest.requireActual('@hcengineering/account-client'),
  getClient: () => accountClient,
  isWorkspaceLoginInfo: (info: any) => isWorkspaceLoginInfo(info)
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

async function drain (stream: Readable): Promise<number> {
  let size = 0
  for await (const chunk of stream) {
    size += chunk.length
  }
  return size
}

describe('http handlers', () => {
  const workspace = '123e4567-e89b-12d3-a456-426614174001' as WorkspaceUuid
  const userToken = generateToken('123e4567-e89b-12d3-a456-426614174000' as PersonUuid, workspace)
  const ctx = new MeasureMetricsContext('test', {})
  const storage = {
    stat: jest.fn(async () => undefined),
    put: jest.fn(async (ctx: any, wsIds: any, name: string, data: Readable | string) => {
      if (typeof data !== 'string') await drain(data)
    })
  }
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
    shutdown = startHttpServer(ctx, sessions as any, port, '', storage as any)
  })

  afterAll(async () => {
    await shutdown()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    isWorkspaceLoginInfo.mockImplementation(jest.requireActual('@hcengineering/account-client').isWorkspaceLoginInfo)
    accountClient.getLoginInfoByToken.mockResolvedValue({ workspace, workspaceDataId: undefined, workspaceUrl: 'ws' })
  })

  const url = (path: string): string => `http://localhost:${port}${path}`
  const auth = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` })

  describe('GET /api/v1/blob', () => {
    it('answers 401 when the token is rejected by the account service', async () => {
      accountClient.getLoginInfoByToken.mockRejectedValue(new Error('Unauthorized'))
      const res = await fetch(url('/api/v1/blob?name=b1'), {
        headers: auth(userToken),
        signal: AbortSignal.timeout(2000)
      })
      expect(res.status).toBe(401)
    })

    it('answers 503 when the account service is unavailable', async () => {
      accountClient.getLoginInfoByToken.mockRejectedValue(
        new PlatformError(new Status(Severity.ERROR, platform.status.ServiceUnavailable, {}))
      )
      const res = await fetch(url('/api/v1/blob?name=b1'), {
        headers: auth(userToken),
        signal: AbortSignal.timeout(2000)
      })
      expect(res.status).toBe(503)
    })

    it('does not read the blob when no workspace is found', async () => {
      accountClient.getLoginInfoByToken.mockResolvedValue({})
      isWorkspaceLoginInfo.mockReturnValue(true)
      const res = await fetch(url('/api/v1/blob?name=b1'), { headers: auth(userToken) })
      expect(res.status).toBe(403)
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(storage.stat).not.toHaveBeenCalled()
    })
  })

  describe('PUT /api/v1/blob', () => {
    const tooLarge = 100 * 1024 * 1024 + 1

    it('rejects a body over the limit sent without a size', async () => {
      const res = await fetch(url('/api/v1/blob?name=b1&contentType=application/octet-stream'), {
        method: 'PUT',
        headers: auth(userToken),
        body: Buffer.alloc(tooLarge)
      })
      expect(res.status).toBe(413)
    })

    it('rejects a body over the limit with an understated size', async () => {
      const res = await fetch(url('/api/v1/blob?name=b1&contentType=application/octet-stream&size=10'), {
        method: 'PUT',
        headers: auth(userToken),
        body: Buffer.alloc(tooLarge)
      })
      expect(res.status).toBe(413)
    })

    it('stores a body within the limit', async () => {
      const res = await fetch(url('/api/v1/blob?name=b1&contentType=text/plain'), {
        method: 'PUT',
        headers: auth(userToken),
        body: 'hello'
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: true })
    })
  })

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
