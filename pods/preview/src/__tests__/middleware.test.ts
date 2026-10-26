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

jest.mock('@hcengineering/account-client', () => ({ getClient: jest.fn() }))
jest.mock('@hcengineering/server-client', () => ({ extractToken: jest.fn(), readToken: jest.fn() }))

/* eslint-disable import/first */
import { Analytics } from '@hcengineering/analytics'
import { getClient } from '@hcengineering/account-client'
import { MeasureMetricsContext, systemAccountUuid } from '@hcengineering/core'
import { extractToken, readToken } from '@hcengineering/server-client'
import type { Token } from '@hcengineering/server-token'
import { type Request, type RequestHandler, type Response } from 'express'

import { BadRequestError, ToolError } from '../error'
import { type RequestWithAuth, createWorkspaceAccess, errorHandler, withAuthorization } from '../middleware'
/* eslint-enable import/first */

const ctx = new MeasureMetricsContext('middleware-test', {})

function respond (err: unknown): { status: jest.Mock, json: jest.Mock } {
  const json = jest.fn()
  const status = jest.fn(() => ({ json }))
  errorHandler({ ctx })(err, {} as unknown as Request, { status } as unknown as Response, jest.fn())
  return { status, json }
}

describe('errorHandler', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('keeps the failure detail out of a 500 body but in the log', () => {
    const logged = jest.spyOn(ctx, 'error').mockImplementation(() => undefined)
    const detail = 'ffmpeg exited with code 183: ffmpeg version 7.1 /tmp/preview-aB3dEf/65a1b2c3 moov atom not found'

    const { status, json } = respond(new Error(detail))

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({ message: 'Internal Server Error' })
    expect(logged).toHaveBeenCalledWith(detail, expect.anything())
  })

  it('keeps the message of an http error', () => {
    jest.spyOn(ctx, 'error').mockImplementation(() => undefined)

    const { status, json } = respond(new BadRequestError('Blob is too large for preview'))

    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith({ message: 'Blob is too large for preview' })
  })

  it('answers a tool failure with a 500 and neither logs it nor sends it to Analytics', () => {
    const logged = jest.spyOn(ctx, 'error').mockImplementation(() => undefined)
    const handled = jest.spyOn(Analytics, 'handleError').mockImplementation(() => undefined)

    const { status, json } = respond(new ToolError('ffmpeg exited with code 183'))

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({ message: 'Internal Server Error' })
    expect(logged).not.toHaveBeenCalled()
    expect(handled).not.toHaveBeenCalled()
  })

  it('still sends another error to Analytics', () => {
    jest.spyOn(ctx, 'error').mockImplementation(() => undefined)
    const handled = jest.spyOn(Analytics, 'handleError').mockImplementation(() => undefined)

    respond(new Error('boom'))

    expect(handled).toHaveBeenCalledTimes(1)
  })
})

describe('withAuthorization', () => {
  const account = '59eec4ec-c916-47a2-b19c-1fe156e07c87'

  // Only `next` and the request matter here; the response is never touched.
  const noResponse = {} as unknown as Response

  function check (token: Token | undefined): jest.Mock {
    ;(extractToken as jest.Mock).mockReturnValue(token)
    const next = jest.fn()
    const request = { headers: {} } as unknown as RequestWithAuth
    withAuthorization(request, noResponse, next)
    return next
  }

  it('refuses a request without a token', () => {
    expect(check(undefined)).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
  })

  it('refuses a guest and a readonly token', () => {
    const guest = { account, extra: { guest: 'true' } } as unknown as Token
    expect(check(guest)).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))

    const readonly = { account, extra: { readonly: 'true' } } as unknown as Token
    expect(check(readonly)).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
  })

  it('accepts a regular token', () => {
    const next = check({ account, extra: {} } as unknown as Token)

    expect(next).toHaveBeenCalledWith()
  })
})

describe('createWorkspaceAccess', () => {
  const workspace = '87a386a9-e662-42fa-8b64-89b1c249999a'
  const otherWorkspace = '44f0d558-3261-44bf-936a-114a6a7f31e7'
  const account = '59eec4ec-c916-47a2-b19c-1fe156e07c87'

  const getUserWorkspaces = jest.fn()
  let access: RequestHandler

  function request (token: Token | undefined, ws = workspace): RequestWithAuth {
    return {
      params: { workspace: ws, name: 'blob.png' },
      token,
      headers: { cookie: 'account-metadata-Token=raw' }
    } as unknown as RequestWithAuth
  }

  const userToken = (ws?: string, extra: Record<string, string> = {}): Token => {
    return { account, workspace: ws, extra } as unknown as Token
  }

  // Only `next` and the request matter to this middleware; it never touches the response.
  const noResponse = {} as unknown as Response

  // The membership call is a promise: let its then/catch reach `next`.
  const flush = async (): Promise<void> => {
    await new Promise((resolve) => setImmediate(resolve))
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getClient as jest.Mock).mockReturnValue({ getUserWorkspaces })
    ;(readToken as jest.Mock).mockReturnValue('raw')
    access = createWorkspaceAccess({ accountsUrl: 'http://account', allowTtlMs: 60_000, denyTtlMs: 1_000 })
  })

  it('refuses a request without a token', () => {
    const next = jest.fn()

    access(request(undefined), noResponse, next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
  })

  it('accepts a token carrying the same workspace, without asking account', () => {
    const next = jest.fn()

    access(request(userToken(workspace)), noResponse, next)

    expect(next).toHaveBeenCalledWith()
    expect(getUserWorkspaces).not.toHaveBeenCalled()
  })

  it('refuses a token carrying another workspace', () => {
    const next = jest.fn()

    access(request(userToken(otherWorkspace)), noResponse, next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
    expect(getUserWorkspaces).not.toHaveBeenCalled()
  })

  it('accepts the system account and an admin', () => {
    const system = jest.fn()
    const systemToken = { account: systemAccountUuid, extra: {} } as unknown as Token
    access(request(systemToken), noResponse, system)
    expect(system).toHaveBeenCalledWith()

    const admin = jest.fn()
    access(request(userToken(undefined, { admin: 'true' })), noResponse, admin)
    expect(admin).toHaveBeenCalledWith()
  })

  it('asks account for membership when the token has no workspace', async () => {
    getUserWorkspaces.mockResolvedValue([{ uuid: otherWorkspace }, { uuid: workspace }])
    const next = jest.fn()

    access(request(userToken()), noResponse, next)
    await flush()

    expect(next).toHaveBeenCalledWith()
    expect(getUserWorkspaces).toHaveBeenCalledTimes(1)
  })

  it('refuses an account that is not a member', async () => {
    getUserWorkspaces.mockResolvedValue([{ uuid: otherWorkspace }])
    const next = jest.fn()

    access(request(userToken()), noResponse, next)
    await flush()

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
  })

  it('caches the answer, so a second request skips account', async () => {
    getUserWorkspaces.mockResolvedValue([{ uuid: workspace }])
    access(request(userToken()), noResponse, jest.fn())
    await flush()

    const next = jest.fn()
    access(request(userToken()), noResponse, next)

    expect(next).toHaveBeenCalledWith()
    expect(getUserWorkspaces).toHaveBeenCalledTimes(1)
  })

  it('fails closed when account is unreachable', async () => {
    jest.spyOn(Analytics, 'handleError').mockImplementation(() => undefined)
    getUserWorkspaces.mockRejectedValue(new Error('account is down'))
    const next = jest.fn()

    access(request(userToken()), noResponse, next)
    await flush()

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
  })
})
