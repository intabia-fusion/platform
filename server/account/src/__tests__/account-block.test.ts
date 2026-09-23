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

import { type AccountUuid, type MeasureContext } from '@hcengineering/core'
import platform, { PlatformError } from '@hcengineering/platform'

import { ensureNotBlocked } from '../utils'
import { adminSetAccountBlocked } from '../serviceOperations'
import { confirm } from '../operations'
import { requireAdminOp } from '../adminOp'
import { decodeTokenVerbose } from '@hcengineering/server-token'
import type { AccountDB } from '../types'

jest.mock('@hcengineering/server-token', () => ({
  ...jest.requireActual('@hcengineering/server-token'),
  decodeTokenVerbose: jest.fn(),
  generateToken: jest.fn(() => 'new-token')
}))

jest.mock('../adminOp', () => ({
  requireAdminOp: jest.fn(),
  requireAdminSession: jest.fn(),
  isHumanAdminLogin: jest.fn(),
  verifyAdminOtpLimited: jest.fn()
}))

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  logAdminAction: jest.fn(),
  confirmEmail: jest.fn(async () => ({ _id: 'sid' })),
  confirmHulyIds: jest.fn()
}))

const ctx = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as MeasureContext
const admin = 'admin-1' as AccountUuid
const target = 'user-1' as AccountUuid

function fakeDb (account: { uuid: AccountUuid, blockedOn?: number } | null): { db: AccountDB, row: any } {
  const row: any = account
  const db = {
    account: {
      findOne: async () => row,
      update: async (_query: any, ops: any) => {
        Object.assign(row, ops)
      }
    },
    person: { findOne: async () => ({ uuid: target, firstName: 'A', lastName: 'B' }) }
  } as unknown as AccountDB

  return { db, row }
}

describe('ensureNotBlocked', () => {
  it('lets a normal account through', () => {
    expect(() => {
      ensureNotBlocked({ blockedOn: undefined })
    }).not.toThrow()
    expect(() => {
      ensureNotBlocked(null)
    }).not.toThrow()
  })

  it('refuses a blocked one', () => {
    try {
      ensureNotBlocked({ blockedOn: Date.now() })
      fail('should have thrown')
    } catch (err: any) {
      expect(err).toBeInstanceOf(PlatformError)
      expect(err.status.code).toBe(platform.status.AccountBlocked)
    }
  })
})

describe('adminSetAccountBlocked', () => {
  beforeEach(() => {
    ;(requireAdminOp as jest.Mock).mockReset()
    ;(requireAdminOp as jest.Mock).mockResolvedValue({ account: admin, extra: { admin: 'true' } })
  })

  it('stamps and clears blockedOn', async () => {
    const { db, row } = fakeDb({ uuid: target })

    await adminSetAccountBlocked(ctx, db, null, 'token', { accountUuid: target, blocked: true, otpCode: '1' })
    expect(row.blockedOn).toBeGreaterThan(0)

    await adminSetAccountBlocked(ctx, db, null, 'token', { accountUuid: target, blocked: false, otpCode: '1' })
    expect(row.blockedOn).toBeUndefined()
  })

  it('refuses to block the admin who asks', async () => {
    const { db } = fakeDb({ uuid: admin })

    await expect(
      adminSetAccountBlocked(ctx, db, null, 'token', { accountUuid: admin, blocked: true, otpCode: '1' })
    ).rejects.toBeInstanceOf(PlatformError)
  })

  it('refuses an unknown account', async () => {
    const { db } = fakeDb(null)

    await expect(
      adminSetAccountBlocked(ctx, db, null, 'token', { accountUuid: target, blocked: true, otpCode: '1' })
    ).rejects.toBeInstanceOf(PlatformError)
  })
})

describe('a blocked account gets no token', () => {
  beforeEach(() => {
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: target, extra: { confirmEmail: 'a@b.c' } })
  })

  // The confirmation link outlives the block, so `confirm` must not hand out a fresh token.
  it('refuses an old confirmation link', async () => {
    const db = {
      account: { findOne: async () => ({ uuid: target, blockedOn: Date.now() }) },
      person: { findOne: async () => ({ uuid: target, firstName: 'A', lastName: 'B' }) },
      shortLink: { deleteMany: async () => {} }
    } as unknown as AccountDB
    await expect(confirm(ctx, db, null, 'token')).rejects.toBeInstanceOf(PlatformError)
  })
})
