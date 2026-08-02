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

import { type MeasureContext, type WorkspaceUuid } from '@hcengineering/core'
import platform, { PlatformError, Status, Severity } from '@hcengineering/platform'
import { decodeTokenVerbose } from '@hcengineering/server-token'

import { type AccountDB } from '../types'
import * as utils from '../utils'
import {
  listWorkspaces,
  listWorkspacesPaged,
  getWorkspacesSummary,
  listAccounts,
  getPaymentOperations,
  getPaymentMonthlyStats,
  performWorkspaceOperation
} from '../serviceOperations'

jest.mock('@hcengineering/platform', () => {
  const actual = jest.requireActual('@hcengineering/platform')
  return {
    ...actual,
    ...actual.default,
    getMetadata: jest.fn(),
    translate: jest.fn((id, params) => `${id} << ${JSON.stringify(params)}`)
  }
})

jest.mock('@hcengineering/server-token', () => ({
  decodeTokenVerbose: jest.fn(),
  generateToken: jest.fn()
}))

const forbidden = new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))

const mockCtx = { error: jest.fn(), info: jest.fn() } as unknown as MeasureContext
const mockBranding = null
const mockToken = 'test-token'

const ADMIN = { extra: { admin: 'true' } }
const BILLING = { extra: { billingAdmin: 'true' } }
const REGULAR = { account: 'acc', workspace: 'ws', extra: {} }

function setToken (payload: object): void {
  ;(decodeTokenVerbose as jest.Mock).mockReturnValue(payload)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('billing read-only admin - read access', () => {
  const getWorkspacesSpy = jest.spyOn(utils, 'getWorkspaces')

  afterAll(() => {
    getWorkspacesSpy.mockRestore()
  })

  test('listWorkspaces: billing allowed, regular forbidden', async () => {
    getWorkspacesSpy.mockResolvedValue([] as any)
    const db = {} as unknown as AccountDB

    setToken(BILLING)
    await expect(listWorkspaces(mockCtx, db, mockBranding, mockToken, {})).resolves.toEqual([])

    setToken(ADMIN)
    await expect(listWorkspaces(mockCtx, db, mockBranding, mockToken, {})).resolves.toEqual([])

    setToken(REGULAR)
    await expect(listWorkspaces(mockCtx, db, mockBranding, mockToken, {})).rejects.toThrow(forbidden)
  })

  test('listWorkspacesPaged: billing allowed, regular forbidden', async () => {
    const db = {
      listWorkspacesPaged: jest.fn().mockResolvedValue({ workspaces: [], total: 0 })
    } as unknown as AccountDB

    setToken(BILLING)
    await expect(listWorkspacesPaged(mockCtx, db, mockBranding, mockToken, {} as any)).resolves.toEqual({
      workspaces: [],
      total: 0
    })
    expect(db.listWorkspacesPaged).toHaveBeenCalled()

    setToken(REGULAR)
    await expect(listWorkspacesPaged(mockCtx, db, mockBranding, mockToken, {} as any)).rejects.toThrow(forbidden)
  })

  test('getWorkspacesSummary: billing allowed, regular forbidden', async () => {
    const db = { getWorkspacesSummary: jest.fn().mockResolvedValue({}) } as unknown as AccountDB

    setToken(BILLING)
    await expect(getWorkspacesSummary(mockCtx, db, mockBranding, mockToken, {})).resolves.toEqual({})

    setToken(REGULAR)
    await expect(getWorkspacesSummary(mockCtx, db, mockBranding, mockToken, {})).rejects.toThrow(forbidden)
  })

  test('listAccounts: billing allowed, regular forbidden', async () => {
    const db = { listAccounts: jest.fn().mockResolvedValue([]) } as unknown as AccountDB

    setToken(BILLING)
    await expect(listAccounts(mockCtx, db, mockBranding, mockToken, {})).resolves.toEqual([])

    setToken(REGULAR)
    await expect(listAccounts(mockCtx, db, mockBranding, mockToken, {})).rejects.toThrow(forbidden)
  })

  test('getPaymentOperations: billing allowed, regular forbidden', async () => {
    const db = { getPaymentOperations: jest.fn().mockResolvedValue([]) } as unknown as AccountDB

    setToken(BILLING)
    await expect(getPaymentOperations(mockCtx, db, mockBranding, mockToken, {} as any)).resolves.toEqual([])

    setToken(REGULAR)
    await expect(getPaymentOperations(mockCtx, db, mockBranding, mockToken, {} as any)).rejects.toThrow(forbidden)
  })

  test('getPaymentMonthlyStats: billing allowed, regular forbidden', async () => {
    const db = { getPaymentMonthlyStats: jest.fn().mockResolvedValue([]) } as unknown as AccountDB

    setToken(BILLING)
    await expect(getPaymentMonthlyStats(mockCtx, db, mockBranding, mockToken, { from: 0, to: 1 })).resolves.toEqual([])

    setToken(REGULAR)
    await expect(getPaymentMonthlyStats(mockCtx, db, mockBranding, mockToken, { from: 0, to: 1 })).rejects.toThrow(
      forbidden
    )
  })
})

describe('billing read-only admin - write denied', () => {
  const params = {
    workspaceId: 'ws-1' as WorkspaceUuid,
    event: 'archive' as const,
    params: [] as any[]
  }

  test('performWorkspaceOperation: billing cannot mutate', async () => {
    const db = {} as unknown as AccountDB

    setToken(BILLING)
    await expect(performWorkspaceOperation(mockCtx, db, mockBranding, mockToken, params)).rejects.toThrow(forbidden)

    setToken(REGULAR)
    await expect(performWorkspaceOperation(mockCtx, db, mockBranding, mockToken, params)).rejects.toThrow(forbidden)
  })
})
