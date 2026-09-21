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
  AccountRole,
  type AccountUuid,
  type Branding,
  type BrandingMap,
  type MeasureContext,
  type WorkspaceMode,
  type WorkspaceUuid
} from '@hcengineering/core'
import { PlatformError } from '@hcengineering/platform'
import { decodeTokenVerbose } from '@hcengineering/server-token'

import {
  deletionDeadline,
  findOrphanedWorkspaces,
  getDeletionGraceMs,
  getDeletionReadonlyDays,
  getDeletionReadonlyMs,
  purgeAccount,
  sweepScheduledDeletions
} from '../deletion'
import { requireAdminOp } from '../adminOp'
import { deleteWorkspace } from '../operations'
import { performWorkspaceOperation } from '../serviceOperations'
import * as serviceOperations from '../serviceOperations'
import * as utils from '../utils'
import { isReadOnlyWorkspace } from '../utils'
import type { AccountDB, WorkspaceStatus } from '../types'

const noBrandings: BrandingMap = {}

jest.mock('@hcengineering/server-token', () => ({
  isHumanAdmin: jest.requireActual('@hcengineering/server-token').isHumanAdmin,
  decodeTokenVerbose: jest.fn(),
  generateToken: jest.fn()
}))

jest.mock('../adminOp', () => ({
  requireAdminOp: jest.fn(),
  requireAdminSession: jest.fn(),
  isHumanAdminLogin: jest.fn(),
  verifyAdminOtpLimited: jest.fn()
}))

const DAY = 24 * 60 * 60 * 1000

const ctx = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
} as unknown as MeasureContext

/** Matches the subset of query operators the deletion sweep uses. */
function matches (row: any, query: Record<string, any>): boolean {
  return Object.entries(query).every(([key, cond]) => {
    const value = row[key]
    if (cond !== null && typeof cond === 'object') {
      if (cond.$lte !== undefined) return value != null && value <= cond.$lte
      return false
    }
    return value === cond
  })
}

interface Fake {
  db: AccountDB
  statuses: Array<Partial<WorkspaceStatus>>
  accounts: Array<{ uuid: AccountUuid, deleteOn?: number }>
  deleted: AccountUuid[]
  events: any[]
}

function fakeDb (
  statuses: Array<Partial<WorkspaceStatus>> = [],
  accounts: Array<{ uuid: AccountUuid, deleteOn?: number }> = [],
  workspacesOfAccount: any[] = [],
  members: Record<string, Array<{ person: AccountUuid, role: AccountRole }>> = {}
): Fake {
  const deleted: AccountUuid[] = []
  const events: any[] = []
  const db = {
    workspaceStatus: {
      find: async (query: any) => statuses.filter((s) => matches(s, query)),
      findOne: async (query: any) => statuses.find((s) => matches(s, query)) ?? null,
      update: async (query: any, ops: any) => {
        for (const s of statuses.filter((s) => matches(s, query))) {
          Object.assign(s, ops)
        }
      }
    },
    // The sweep reads the workspace back to write to its owners.
    workspace: {
      findOne: async (query: any) =>
        workspacesOfAccount.find((w) => matches(w, query)) ??
        (statuses.some((s) => s.workspaceUuid === query.uuid)
          ? { uuid: query.uuid, name: String(query.uuid), url: String(query.uuid) }
          : null)
    },
    socialId: { find: async () => [] },
    account: {
      find: async (query: any) => accounts.filter((a) => matches(a, query)),
      update: async (query: any, ops: any) => {
        for (const a of accounts.filter((a) => matches(a, query))) {
          Object.assign(a, ops)
        }
      }
    },
    accountEvent: { insertOne: async (e: any) => events.push(e) },
    subscription: { find: async () => [] },
    deleteAccount: async (uuid: AccountUuid) => deleted.push(uuid),
    getAccountWorkspaces: async () => workspacesOfAccount,
    getWorkspaceMembers: async (uuid: WorkspaceUuid) => members[uuid] ?? []
  } as unknown as AccountDB

  return { db, statuses, accounts, deleted, events }
}

describe('deletion schedule', () => {
  const envGrace = process.env.DELETION_GRACE_DAYS
  const envReadonly = process.env.DELETION_READONLY_DAYS

  afterEach(() => {
    // Assigning undefined would store the string "undefined" and poison every later parseInt.
    if (envGrace === undefined) delete process.env.DELETION_GRACE_DAYS
    else process.env.DELETION_GRACE_DAYS = envGrace
    if (envReadonly === undefined) delete process.env.DELETION_READONLY_DAYS
    else process.env.DELETION_READONLY_DAYS = envReadonly
  })

  test('defaults to three weeks with the first week read-only', () => {
    delete process.env.DELETION_GRACE_DAYS
    delete process.env.DELETION_READONLY_DAYS

    expect(getDeletionGraceMs()).toBe(21 * DAY)
    expect(getDeletionReadonlyMs()).toBe(7 * DAY)
    expect(deletionDeadline()).toBeGreaterThan(Date.now() + 20 * DAY)
  })

  test('env overrides the deferral', () => {
    process.env.DELETION_GRACE_DAYS = '2'
    expect(getDeletionGraceMs()).toBe(2 * DAY)
  })

  test('read-only for a scheduled workspace and for every archive', () => {
    expect(isReadOnlyWorkspace({ mode: 'active', deleteOn: Date.now() })).toBe(true)
    expect(isReadOnlyWorkspace({ mode: 'active' })).toBe(false)

    // An archive is restored through the platform, never edited in place - and the flag is what
    // stops datalake from taking writes for it.
    expect(isReadOnlyWorkspace({ mode: 'archived' })).toBe(true)
    expect(isReadOnlyWorkspace({ mode: 'archiving-backup' })).toBe(true)
    expect(isReadOnlyWorkspace({ mode: 'archived', deleteOn: Date.now() })).toBe(true)
  })
})

describe('findOrphanedWorkspaces', () => {
  const person = 'p1' as AccountUuid

  test('a workspace with a single owner blocks the account purge', async () => {
    const ws = { uuid: 'w1' as WorkspaceUuid, url: 'w1', status: { mode: 'active' } }
    const { db } = fakeDb([], [], [ws], { w1: [{ person, role: AccountRole.Owner }] })

    expect(await findOrphanedWorkspaces(db, person)).toHaveLength(1)
  })

  test('a workspace already scheduled for deletion does not block', async () => {
    const ws = { uuid: 'w1' as WorkspaceUuid, url: 'w1', status: { mode: 'active', deleteOn: Date.now() } }
    const { db } = fakeDb([], [], [ws], { w1: [{ person, role: AccountRole.Owner }] })

    expect(await findOrphanedWorkspaces(db, person)).toHaveLength(0)
  })

  test('a second owner does not block', async () => {
    const ws = { uuid: 'w1' as WorkspaceUuid, url: 'w1', status: { mode: 'active' } }
    const { db } = fakeDb([], [], [ws], {
      w1: [
        { person, role: AccountRole.Owner },
        { person: 'p2' as AccountUuid, role: AccountRole.Owner }
      ]
    })

    expect(await findOrphanedWorkspaces(db, person)).toHaveLength(0)
  })
})

describe('sweepScheduledDeletions', () => {
  const now = Date.now()

  test('an active workspace goes to archiving once the read-only week is over', async () => {
    const due: Partial<WorkspaceStatus> = {
      workspaceUuid: 'w1' as WorkspaceUuid,
      mode: 'active',
      deleteOn: now + 13 * DAY // 21 - 13 = 8 days elapsed, past the 7 read-only ones
    }
    const fresh: Partial<WorkspaceStatus> = {
      workspaceUuid: 'w2' as WorkspaceUuid,
      mode: 'active',
      deleteOn: now + 20 * DAY
    }
    const { db } = fakeDb([due, fresh])

    await sweepScheduledDeletions(ctx, db, noBrandings)

    expect(due.mode).toBe('archiving-pending-backup')
    expect(fresh.mode).toBe('active')
  })

  test('an archived workspace is purged once the deadline passes', async () => {
    const due: Partial<WorkspaceStatus> = {
      workspaceUuid: 'w1' as WorkspaceUuid,
      mode: 'archived',
      deleteOn: now - 1000
    }
    const waiting: Partial<WorkspaceStatus> = {
      workspaceUuid: 'w2' as WorkspaceUuid,
      mode: 'archived',
      deleteOn: now + 5 * DAY
    }
    const { db } = fakeDb([due, waiting])

    await sweepScheduledDeletions(ctx, db, noBrandings)

    expect(due.mode).toBe('pending-deletion')
    expect(due.isDisabled).toBe(true)
    expect(waiting.mode).toBe('archived')
  })

  test('an archived workspace without a deadline is left alone', async () => {
    const archived: Partial<WorkspaceStatus> = { workspaceUuid: 'w1' as WorkspaceUuid, mode: 'archived' }
    const { db } = fakeDb([archived])

    await sweepScheduledDeletions(ctx, db, noBrandings)

    expect(archived.mode).toBe('archived')
  })

  test('an account past its deadline is purged, one still waiting is not', async () => {
    const { db, deleted, events } = fakeDb(
      [],
      [
        { uuid: 'a1' as AccountUuid, deleteOn: now - 1 },
        { uuid: 'a2' as AccountUuid, deleteOn: now + DAY },
        { uuid: 'a3' as AccountUuid }
      ]
    )

    await sweepScheduledDeletions(ctx, db, noBrandings)

    expect(deleted).toEqual(['a1'])
    expect(events).toHaveLength(1)
  })

  test('a workspace with a branding gets that branding passed to the notify function', async () => {
    const expired: Partial<WorkspaceStatus> = {
      workspaceUuid: 'w1' as WorkspaceUuid,
      mode: 'archived',
      deleteOn: now - 1000
    }
    const ws = { uuid: 'w1' as WorkspaceUuid, name: 'W1', url: 'w1', branding: 'acme' }
    const { db } = fakeDb([expired], [], [ws])
    const acmeBranding: Branding = { key: 'acme', defaultLanguage: 'ru' }
    const brandings: BrandingMap = { 'acme.example.com': acmeBranding }
    const notify = jest.spyOn(utils, 'notifyWorkspaceDeletionScheduled').mockResolvedValue(undefined)

    await sweepScheduledDeletions(ctx, db, brandings)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][2]).toBe(acmeBranding)
  })
})

describe('sweepScheduledDeletions resilience', () => {
  test('a failed notice does not cost the remaining rows their sweep', async () => {
    const expired: Partial<WorkspaceStatus> = {
      workspaceUuid: 'w1' as WorkspaceUuid,
      mode: 'archived',
      deleteOn: Date.now() - 1000
    }
    const { db, accounts, deleted } = fakeDb([expired], [{ uuid: 'a1' as AccountUuid, deleteOn: Date.now() - 1000 }])
    jest.spyOn(utils, 'getWorkspaceInfoWithStatusById').mockRejectedValue(new Error('mail is down'))
    jest.spyOn(utils, 'notifyAccountDeletion').mockResolvedValue(undefined)

    await sweepScheduledDeletions(ctx, db, noBrandings)

    expect(expired.mode).toBe('pending-deletion')
    expect(accounts).toHaveLength(1)
    expect(deleted).toEqual(['a1'])
  })
})

describe('purgeAccount', () => {
  test('refuses to purge the sole owner of a live workspace', async () => {
    const person = 'p1' as AccountUuid
    const ws = { uuid: 'w1' as WorkspaceUuid, url: 'w1', status: { mode: 'active' } }
    const { db, deleted } = fakeDb([], [], [ws], { w1: [{ person, role: AccountRole.Owner }] })

    await purgeAccount(ctx, db, person)

    expect(deleted).toHaveLength(0)
  })
})

describe('performWorkspaceOperation deletion events', () => {
  let statusById: Record<string, Partial<WorkspaceStatus>>

  const setup = (mode: WorkspaceMode, deleteOn?: number): AccountDB => {
    const status: Partial<WorkspaceStatus> = { workspaceUuid: 'w1' as WorkspaceUuid, mode, deleteOn }
    statusById = { w1: status }
    const { db } = fakeDb([status])
    jest
      .spyOn(utils, 'getWorkspacesInfoWithStatusByIds')
      .mockResolvedValue([{ uuid: 'w1' as WorkspaceUuid, name: 'W1', url: 'w1', status }] as any)
    jest.spyOn(utils, 'logAdminAction').mockResolvedValue(undefined)
    jest.spyOn(utils, 'notifyWorkspaceDeleted').mockResolvedValue(undefined)
    jest.spyOn(utils, 'notifyWorkspaceDeletionScheduled').mockResolvedValue(undefined)
    return db
  }

  beforeEach(() => {
    jest.restoreAllMocks()
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({
      account: 'p1' as AccountUuid,
      workspace: 'w1' as WorkspaceUuid,
      extra: { admin: 'true' }
    })
  })

  test('delete only stamps the deadline, the workspace keeps running', async () => {
    const db = setup('active')

    await performWorkspaceOperation(ctx, db, null, 'token', {
      workspaceId: 'w1' as WorkspaceUuid,
      event: 'delete',
      params: []
    })

    expect(statusById.w1.mode).toBe('active')
    expect(statusById.w1.deleteOn).toBeGreaterThan(Date.now())
  })

  test('delete-now skips the deferral and hands the workspace to the purge pipeline', async () => {
    const db = setup('active', Date.now() + DAY)

    await performWorkspaceOperation(ctx, db, null, 'token', {
      workspaceId: 'w1' as WorkspaceUuid,
      event: 'delete-now',
      params: []
    })

    expect(statusById.w1.mode).toBe('pending-deletion')
    expect(statusById.w1.isDisabled).toBe(true)
    expect(statusById.w1.deleteOn).toBeUndefined()
    expect(statusById.w1.processingAttempts).toBe(0)
  })

  test('the owners are told once: a repeat delete only moves the deadline', async () => {
    const db = setup('active')
    const notify = jest.spyOn(utils, 'notifyWorkspaceDeletionScheduled')

    await performWorkspaceOperation(ctx, db, null, 'token', {
      workspaceId: 'w1' as WorkspaceUuid,
      event: 'delete',
      params: []
    })
    expect(notify).toHaveBeenCalledTimes(1)
    // The email quotes the deadline that was written, not one computed a moment later.
    expect(notify.mock.calls[0][4]).toEqual({
      deleteOn: statusById.w1.deleteOn,
      readonlyDays: getDeletionReadonlyDays()
    })

    await performWorkspaceOperation(ctx, db, null, 'token', {
      workspaceId: 'w1' as WorkspaceUuid,
      event: 'delete',
      params: []
    })
    expect(notify).toHaveBeenCalledTimes(1)
  })

  test('delete-now writes without a deadline: nothing left to call off', async () => {
    const db = setup('active', Date.now() + DAY)
    const notify = jest.spyOn(utils, 'notifyWorkspaceDeletionScheduled')

    await performWorkspaceOperation(ctx, db, null, 'token', {
      workspaceId: 'w1' as WorkspaceUuid,
      event: 'delete-now',
      params: []
    })

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][4]).toBeUndefined()
  })

  test('delete-now is refused for a workspace already on its way out', async () => {
    const db = setup('pending-deletion')

    await expect(
      performWorkspaceOperation(ctx, db, null, 'token', {
        workspaceId: 'w1' as WorkspaceUuid,
        event: 'delete-now',
        params: []
      })
    ).rejects.toThrow(PlatformError)
  })

  test('delete-now is admin-only', async () => {
    const db = setup('active')
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({
      account: 'p1' as AccountUuid,
      workspace: 'w1' as WorkspaceUuid,
      extra: {}
    })

    await expect(
      performWorkspaceOperation(ctx, db, null, 'token', {
        workspaceId: 'w1' as WorkspaceUuid,
        event: 'delete-now',
        params: []
      })
    ).rejects.toThrow(PlatformError)
    expect(statusById.w1.mode).toBe('active')
  })

  test('cancel-delete on a read-only workspace just drops the deadline', async () => {
    const db = setup('active', Date.now() + DAY)

    await performWorkspaceOperation(ctx, db, null, 'token', {
      workspaceId: 'w1' as WorkspaceUuid,
      event: 'cancel-delete',
      params: []
    })

    expect(statusById.w1.deleteOn).toBeUndefined()
    expect(statusById.w1.mode).toBe('active')
  })

  test('cancel-delete on an archived workspace leaves it archived', async () => {
    const db = setup('archived', Date.now() + DAY)

    await performWorkspaceOperation(ctx, db, null, 'token', {
      workspaceId: 'w1' as WorkspaceUuid,
      event: 'cancel-delete',
      params: []
    })

    expect(statusById.w1.deleteOn).toBeUndefined()
    expect(statusById.w1.mode).toBe('archived')
  })

  test('delete schedules an archived workspace as well', async () => {
    const db = setup('archived')
    const notify = jest.spyOn(utils, 'notifyWorkspaceDeletionScheduled')

    await performWorkspaceOperation(ctx, db, null, 'token', {
      workspaceId: 'w1' as WorkspaceUuid,
      event: 'delete',
      params: []
    })

    expect(statusById.w1.deleteOn).toBeGreaterThan(Date.now())
    expect(statusById.w1.mode).toBe('archived')
    // Already archived: no read-only window applies, unlike scheduling an active workspace.
    expect(notify.mock.calls[0][4]).toEqual({ deleteOn: statusById.w1.deleteOn, readonlyDays: 0 })
  })

  test('an owner on their own workspace does not go through the admin OTP', async () => {
    const db = setup('active', Date.now() + DAY)
    ;(requireAdminOp as jest.Mock).mockClear()

    await performWorkspaceOperation(ctx, db, null, 'token', {
      workspaceId: 'w1' as WorkspaceUuid,
      event: 'cancel-delete',
      params: []
    })

    // The admin panel always sends a code; without one this is the person's own workspace.
    expect(requireAdminOp).not.toHaveBeenCalled()
    expect(statusById.w1.deleteOn).toBeUndefined()
  })

  test('cancel-delete is refused when nothing is scheduled', async () => {
    const db = setup('active')

    await expect(
      performWorkspaceOperation(ctx, db, null, 'token', {
        workspaceId: 'w1' as WorkspaceUuid,
        event: 'cancel-delete',
        params: []
      })
    ).rejects.toThrow(PlatformError)
  })

  test('unarchive clears the deadline together with the archive', async () => {
    const db = setup('archived', Date.now() + DAY)

    await performWorkspaceOperation(ctx, db, null, 'token', {
      workspaceId: 'w1' as WorkspaceUuid,
      event: 'unarchive',
      params: []
    })

    expect(statusById.w1.deleteOn).toBeUndefined()
    expect(statusById.w1.mode).toBe('pending-restore')
  })
})

describe('deleteWorkspace self-service guard', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({
      account: 'p1' as AccountUuid,
      workspace: 'w1' as WorkspaceUuid,
      extra: {}
    })
  })

  test('a repeat delete on an already scheduled workspace is a no-op, like the admin dedup', async () => {
    const status: Partial<WorkspaceStatus> = {
      workspaceUuid: 'w1' as WorkspaceUuid,
      mode: 'active',
      deleteOn: Date.now() + DAY
    }
    const { db } = fakeDb([status])
    ;(db as unknown as { getWorkspaceRole: () => Promise<AccountRole> }).getWorkspaceRole = async () =>
      AccountRole.Owner
    const cancelSubs = jest.spyOn(serviceOperations, 'cancelWorkspaceSubscriptions').mockResolvedValue(undefined)
    const notifyScheduled = jest.spyOn(utils, 'notifyWorkspaceDeletionScheduled').mockResolvedValue(undefined)
    const notifyDeleted = jest.spyOn(utils, 'notifyWorkspaceDeleted').mockResolvedValue(undefined)
    const before = status.deleteOn

    await deleteWorkspace(ctx, db, null, 'token', { otpCode: '' })

    expect(status.deleteOn).toBe(before)
    expect(cancelSubs).not.toHaveBeenCalled()
    expect(notifyScheduled).not.toHaveBeenCalled()
    expect(notifyDeleted).not.toHaveBeenCalled()
  })

  test('delete is refused for a workspace already on its way out, same as the admin delete guard', async () => {
    const status: Partial<WorkspaceStatus> = { workspaceUuid: 'w1' as WorkspaceUuid, mode: 'pending-deletion' }
    const { db } = fakeDb([status])
    ;(db as unknown as { getWorkspaceRole: () => Promise<AccountRole> }).getWorkspaceRole = async () =>
      AccountRole.Owner

    await expect(deleteWorkspace(ctx, db, null, 'token', { otpCode: '' })).rejects.toThrow(PlatformError)
  })
})
