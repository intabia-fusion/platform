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

import { type MeasureContext, type WorkspaceUuid, SocialIdType } from '@hcengineering/core'
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
  performWorkspaceOperation,
  listAdminActions,
  adminReleaseSocialId,
  adminDeletePerson
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

  test('listAccounts: filter is passed through to db', async () => {
    const listFn = jest.fn().mockResolvedValue([])
    const db = { listAccounts: listFn } as unknown as AccountDB

    setToken(BILLING)
    const filter = { noWorkspaces: true, inactiveDays: 7 }
    await listAccounts(mockCtx, db, mockBranding, mockToken, { search: 'a@b.c', limit: 10, filter })

    expect(listFn).toHaveBeenCalledWith('a@b.c', undefined, 10, undefined, filter)
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

describe('admin account actions', () => {
  const verifyOtpSpy = jest.spyOn(utils, 'verifyAdminOtp')
  const logSpy = jest.spyOn(utils, 'logAdminAction')
  const releaseSpy = jest.spyOn(utils, 'doReleaseSocialId')

  beforeEach(() => {
    verifyOtpSpy.mockResolvedValue(undefined)
    logSpy.mockResolvedValue(undefined)
    releaseSpy.mockResolvedValue({} as any)
  })

  afterAll(() => {
    verifyOtpSpy.mockRestore()
    logSpy.mockRestore()
    releaseSpy.mockRestore()
  })

  test('listAdminActions: billing allowed, regular forbidden', async () => {
    const db = { listAdminActions: jest.fn().mockResolvedValue({ actions: [], total: 0 }) } as unknown as AccountDB

    setToken(BILLING)
    await expect(listAdminActions(mockCtx, db, mockBranding, mockToken, {})).resolves.toEqual({
      actions: [],
      total: 0
    })

    setToken(REGULAR)
    await expect(listAdminActions(mockCtx, db, mockBranding, mockToken, {})).rejects.toThrow(forbidden)
  })

  test('adminReleaseSocialId: admin cannot cut their own login, others are logged', async () => {
    const db = {} as unknown as AccountDB
    const params = { personUuid: 'admin-acc' as any, type: SocialIdType.EMAIL, value: 'a@b.c', otpCode: '1' }

    setToken({ account: 'admin-acc', ...ADMIN })
    await expect(adminReleaseSocialId(mockCtx, db, mockBranding, mockToken, params)).rejects.toThrow(forbidden)

    await adminReleaseSocialId(mockCtx, db, mockBranding, mockToken, { ...params, personUuid: 'other' as any })
    expect(releaseSpy).toHaveBeenCalledWith(db, 'other', SocialIdType.EMAIL, 'a@b.c', 'admin-acc', true)
    expect(logSpy).toHaveBeenCalledWith(
      mockCtx,
      db,
      mockToken,
      'release_social_id',
      'other',
      `${SocialIdType.EMAIL}:a@b.c`
    )
  })

  test('adminDeletePerson: refuses a person that already has an account', async () => {
    const deletePerson = jest.fn()
    const db = {
      person: { findOne: jest.fn().mockResolvedValue({ uuid: 'p1', firstName: 'A', lastName: 'B' }) },
      account: { findOne: jest.fn().mockResolvedValue({ uuid: 'p1' }) },
      socialId: { find: jest.fn().mockResolvedValue([]) },
      deletePerson
    } as unknown as AccountDB

    setToken({ account: 'admin-acc', ...ADMIN })
    await expect(
      adminDeletePerson(mockCtx, db, mockBranding, mockToken, { personUuid: 'p1' as any, otpCode: '1' })
    ).rejects.toThrow(PlatformError)
    expect(deletePerson).not.toHaveBeenCalled()

    // Unfinished signup: no account row -> purged and audited
    ;(db.account.findOne as jest.Mock).mockResolvedValue(null)
    await adminDeletePerson(mockCtx, db, mockBranding, mockToken, { personUuid: 'p1' as any, otpCode: '1' })
    expect(deletePerson).toHaveBeenCalledWith('p1')
    expect(logSpy).toHaveBeenCalledWith(mockCtx, db, mockToken, 'delete_person', 'p1', 'A B', { socialIds: [] })
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
