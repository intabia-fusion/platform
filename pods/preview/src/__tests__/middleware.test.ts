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
jest.mock('@hcengineering/server-client', () => ({
  extractToken: jest.fn(),
  extractTokenWithRaw: jest.fn(),
  readToken: jest.fn()
}))

/* eslint-disable import/first */
import { Analytics } from '@hcengineering/analytics'
import { getClient } from '@hcengineering/account-client'
import { MeasureMetricsContext, systemAccountUuid } from '@hcengineering/core'
import { extractToken, extractTokenWithRaw } from '@hcengineering/server-client'
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

  function check (token: Token | undefined, cookie: string): jest.Mock {
    ;(extractToken as jest.Mock).mockReturnValue(token)
    ;(extractTokenWithRaw as jest.Mock).mockReturnValue(
      token === undefined ? undefined : { token, raw: 'raw-' + (token.extra?.guest ?? 'user') }
    )
    const next = jest.fn()
    const request = { headers: { cookie } } as unknown as RequestWithAuth
    withAuthorization(request, noResponse, next)
    return next
  }

  it('refuses a request without a token', () => {
    expect(check(undefined, 'no-token=a')).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
  })

  // a preview only reads, so a guest of a public link and a readonly account are served
  it('accepts a guest, a readonly and a regular token', () => {
    const guest = { account, extra: { guest: 'true' } } as unknown as Token
    expect(check(guest, 'guest-token=g')).toHaveBeenCalledWith()

    const readonly = { account, extra: { readonly: 'true' } } as unknown as Token
    expect(check(readonly, 'readonly-token=r')).toHaveBeenCalledWith()

    const regular = check({ account, extra: {} } as unknown as Token, 'regular-token=u')
    expect(regular).toHaveBeenCalledWith()
  })

  // a browser with two accounts carries two cookies; the raw kept must be the decoded one's
  it('keeps the raw token the decoded one came from', () => {
    ;(extractTokenWithRaw as jest.Mock).mockReturnValue({
      token: { account, extra: {} } as unknown as Token,
      raw: 'token-of-a'
    })
    const request = { headers: { cookie: 'a=token-of-a; b=token-of-b' } } as unknown as RequestWithAuth

    withAuthorization(request, noResponse, jest.fn())

    expect(request.tokenRaw).toBe('token-of-a')
  })
})

describe('createWorkspaceAccess', () => {
  const workspace = '87a386a9-e662-42fa-8b64-89b1c249999a'
  const otherWorkspace = '44f0d558-3261-44bf-936a-114a6a7f31e7'
  const account = '59eec4ec-c916-47a2-b19c-1fe156e07c87'

  const getUserWorkspaces = jest.fn()
  let access: RequestHandler

  function request (token: Token | undefined, ws = workspace, raw = 'raw'): RequestWithAuth {
    return {
      params: { workspace: ws, name: 'blob.png' },
      token,
      tokenRaw: raw,
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
    access = createWorkspaceAccess({ accountsUrl: 'http://account', allowTtlMs: 60_000, denyTtlMs: 1_000 })
  })

  it('refuses a request without a token', () => {
    const next = jest.fn()

    access(request(undefined), noResponse, next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
  })

  // two accounts in one browser: the decoded token names one account, the first cookie another
  it('asks account with the token it decoded, not with the first cookie', async () => {
    getUserWorkspaces.mockResolvedValue([{ uuid: workspace }])
    const next = jest.fn()

    access(request(userToken(), workspace, 'token-of-a'), noResponse, next)
    await flush()

    // only the url and the token matter here, the timeouts are the client's business
    expect((getClient as jest.Mock).mock.calls[0][0]).toBe('http://account')
    expect((getClient as jest.Mock).mock.calls[0][1]).toBe('token-of-a')
    expect(next).toHaveBeenCalledWith()
  })

  it('accepts a token carrying the same workspace, without asking account', () => {
    const next = jest.fn()

    access(request(userToken(workspace)), noResponse, next)

    expect(next).toHaveBeenCalledWith()
    expect(getUserWorkspaces).not.toHaveBeenCalled()
  })

  it('refuses a guest token of another workspace without asking account', () => {
    const next = jest.fn()

    access(request(userToken(otherWorkspace, { guest: 'true' })), noResponse, next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
    expect(getUserWorkspaces).not.toHaveBeenCalled()
  })

  // a regular token of another workspace still proves who the account is, so the list decides
  it('asks account for a token of another workspace', async () => {
    getUserWorkspaces.mockResolvedValue([{ uuid: otherWorkspace }])
    const next = jest.fn()

    access(request(userToken(otherWorkspace)), noResponse, next)
    await flush()

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
    expect(getUserWorkspaces).toHaveBeenCalledTimes(1)
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

  // one feed is 40 images, three srcset steps each, and a restarted pod has no cache at all
  it('asks account once for the images of one feed', async () => {
    getUserWorkspaces.mockResolvedValue([{ uuid: workspace }])
    const answers = [jest.fn(), jest.fn(), jest.fn()]

    for (const next of answers) {
      access(request(userToken()), noResponse, next)
    }
    await flush()

    for (const next of answers) {
      expect(next).toHaveBeenCalledWith()
    }
    expect(getUserWorkspaces).toHaveBeenCalledTimes(1)
  })

  // the list holds every workspace of the account, so the next one costs nothing
  it('serves a second workspace of the same account from the same answer', async () => {
    getUserWorkspaces.mockResolvedValue([{ uuid: workspace }, { uuid: otherWorkspace }])

    const first = jest.fn()
    access(request(userToken()), noResponse, first)
    await flush()

    const second = jest.fn()
    access(request(userToken(), otherWorkspace), noResponse, second)

    expect(first).toHaveBeenCalledWith()
    expect(second).toHaveBeenCalledWith()
    expect(getUserWorkspaces).toHaveBeenCalledTimes(1)
  })

  // a refusal is trusted only for a moment: the account may have been added since
  it('asks account again once a refusal is older than the deny ttl', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
    getUserWorkspaces.mockResolvedValueOnce([{ uuid: otherWorkspace }])

    access(request(userToken()), noResponse, jest.fn())
    await flush()
    expect(getUserWorkspaces).toHaveBeenCalledTimes(1)

    getUserWorkspaces.mockResolvedValueOnce([{ uuid: workspace }])
    clock.mockReturnValue(1_000_000 + 1_000)

    const next = jest.fn()
    access(request(userToken()), noResponse, next)
    await flush()

    expect(next).toHaveBeenCalledWith()
    expect(getUserWorkspaces).toHaveBeenCalledTimes(2)
    clock.mockRestore()
  })

  it('fails closed when account is unreachable, reporting the failure once', async () => {
    const handled = jest.spyOn(Analytics, 'handleError').mockImplementation(() => undefined)
    getUserWorkspaces.mockRejectedValue(new Error('account is down'))
    const answers = [jest.fn(), jest.fn(), jest.fn()]

    for (const next of answers) {
      access(request(userToken()), noResponse, next)
    }
    await flush()

    for (const next of answers) {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
    }
    expect(handled).toHaveBeenCalledTimes(1)
  })
})
