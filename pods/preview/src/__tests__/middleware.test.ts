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

import { type AccountUuid, systemAccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { extractToken } from '@hcengineering/server-client'
import { type Token } from '@hcengineering/server-token'
import { type NextFunction, type Response } from 'express'

import { type RequestWithAuth, withWorkspaceToken } from '../middleware'

jest.mock('@hcengineering/server-client', () => ({
  extractToken: jest.fn()
}))

const extractTokenMock = extractToken as jest.MockedFunction<typeof extractToken>

const workspaceA = '00000000-0000-4000-8000-00000000000a' as WorkspaceUuid
const workspaceB = '00000000-0000-4000-8000-00000000000b' as WorkspaceUuid
const account = '00000000-0000-4000-8000-0000000000ac' as AccountUuid

function makeToken (token: Partial<Token>): Token {
  return { account, workspace: workspaceA, extra: {}, ...token }
}

function run (workspace: string, name: string, token: Token | undefined): { next: jest.Mock, req: RequestWithAuth } {
  extractTokenMock.mockReturnValue(token)
  const req = { headers: {}, params: { workspace, name } } as unknown as RequestWithAuth
  const next = jest.fn()
  withWorkspaceToken(req, {} as unknown as Response, next as unknown as NextFunction)
  return { next, req }
}

describe('withWorkspaceToken', () => {
  beforeEach(() => {
    extractTokenMock.mockReset()
  })

  it('rejects a request without a token', () => {
    const { next } = run(workspaceA, 'blob', undefined)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
  })

  it('rejects a token of another workspace', () => {
    const { next } = run(workspaceB, 'blob', makeToken({}))
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
  })

  it('rejects a token without a workspace', () => {
    const { next } = run(workspaceA, 'blob', makeToken({ workspace: undefined as unknown as WorkspaceUuid }))
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
  })

  it('lets guest and readonly tokens read their own workspace', () => {
    for (const extra of [{ guest: 'true' }, { readonly: 'true' }]) {
      const { next, req } = run(workspaceA, 'blob', makeToken({ extra }))
      expect(next).toHaveBeenCalledWith()
      expect(req.token?.extra).toEqual(extra)
    }
  })

  it('lets the system account and admins read any workspace', () => {
    for (const token of [makeToken({ account: systemAccountUuid }), makeToken({ extra: { admin: 'true' } })]) {
      const { next } = run(workspaceB, 'blob', token)
      expect(next).toHaveBeenCalledWith()
    }
  })

  it('rejects missing route params', () => {
    const { next } = run('', 'blob', makeToken({}))
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 400 }))
  })
})
