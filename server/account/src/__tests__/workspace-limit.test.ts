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

jest.mock('../adminOp', () => ({ ...jest.requireActual('../adminOp'), requireAdminOp: jest.fn() }))
jest.mock('@hcengineering/server-token', () => ({
  ...jest.requireActual('@hcengineering/server-token'),
  decodeTokenVerbose: jest.fn()
}))

/* eslint-disable import/first */
import {
  type AccountUuid,
  type MeasureContext,
  type PersonUuid,
  type WorkspaceMode,
  type WorkspaceUuid
} from '@hcengineering/core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import { decodeTokenVerbose, generateToken } from '@hcengineering/server-token'

import { requireAdminOp } from '../adminOp'
import { createWorkspace, holdsWorkspaceSlot, maxWorkspacesLimit, workspaceLimitPerUser } from '../operations'
import { adminUpdateAccountWorkspaceLimit } from '../serviceOperations'
import { type AccountDB, type Workspace, type WorkspaceStatus } from '../types'
import * as utils from '../utils'
/* eslint-enable import/first */

describe('workspace creation limit', () => {
  const mockCtx = { error: jest.fn(), info: jest.fn(), warn: jest.fn() } as unknown as MeasureContext
  const person = '22222222-2222-4222-8222-222222222222' as AccountUuid
  const token = generateToken(person, undefined, undefined)
  const adminToken = generateToken(person, undefined, { admin: 'true' })
  const newWorkspace = '33333333-3333-4333-8333-333333333333' as WorkspaceUuid

  const record = jest.spyOn(utils, 'createWorkspaceRecord')
  const endpoint = jest.spyOn(utils, 'getEndpoint').mockReturnValue('https://test.example')
  const collaboratorEndpoint = jest.spyOn(utils, 'getCollaboratorEndpoint').mockReturnValue('https://test.example')

  function ws (uuid: WorkspaceUuid): Partial<Workspace> & { uuid: WorkspaceUuid } {
    return { uuid, name: `WS ${uuid}`, url: `ws-${uuid}`, createdBy: person }
  }

  function status (
    workspaceUuid: WorkspaceUuid,
    mode: WorkspaceMode,
    isDisabled = false
  ): Partial<WorkspaceStatus> & { workspaceUuid: WorkspaceUuid } {
    return { workspaceUuid, mode, isDisabled }
  }

  function makeDb (
    opts: {
      workspaces?: Array<Partial<Workspace> & { uuid: WorkspaceUuid }>
      statuses?: Partial<WorkspaceStatus>[]
      maxWorkspaces?: number | null
    } = {}
  ): AccountDB {
    return {
      socialId: {
        find: jest.fn().mockResolvedValue([
          {
            _id: 'social-id',
            key: 'email:jane@example.com',
            type: 'email',
            value: 'jane@example.com',
            personUuid: person,
            verifiedOn: Date.now(),
            createdOn: Date.now()
          }
        ]),
        findOne: jest.fn().mockResolvedValue(null)
      },
      person: {
        findOne: jest.fn().mockResolvedValue({ uuid: person as PersonUuid, firstName: 'Jane', lastName: 'Doe' })
      },
      account: {
        findOne: jest.fn().mockResolvedValue({ uuid: person, maxWorkspaces: opts.maxWorkspaces ?? null }),
        update: jest.fn()
      },
      workspace: { find: jest.fn().mockResolvedValue(opts.workspaces ?? []), update: jest.fn() },
      workspaceStatus: { find: jest.fn().mockResolvedValue(opts.statuses ?? []), update: jest.fn() },
      assignWorkspace: jest.fn(),
      adminAction: { insertOne: jest.fn() }
    } as unknown as AccountDB
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: person })
    record.mockResolvedValue({ workspaceUuid: newWorkspace, workspaceUrl: `ws-${newWorkspace}` })
    endpoint.mockReturnValue('https://test.example')
    collaboratorEndpoint.mockReturnValue('https://test.example')
  })

  const cases: Array<[string, Partial<WorkspaceStatus> | undefined, boolean]> = [
    ['a workspace without a status row yet', undefined, true],
    ['pending-creation, disabled until the DB exists', status(newWorkspace, 'pending-creation', true), true],
    ['creating', status(newWorkspace, 'creating', true), true],
    ['active', status(newWorkspace, 'active'), true],
    ['active but disabled by support', status(newWorkspace, 'active', true), true],
    ['archived', status(newWorkspace, 'archived'), true],
    ['pending-deletion', status(newWorkspace, 'pending-deletion', true), false],
    ['deleting', status(newWorkspace, 'deleting', true), false],
    ['deleted', status(newWorkspace, 'deleted', true), false]
  ]

  test.each(cases)('holdsWorkspaceSlot: %s', (_name, wsStatus, expected) => {
    expect(holdsWorkspaceSlot(wsStatus as WorkspaceStatus | undefined)).toBe(expected)
  })

  test('a live workspace takes the only slot', async () => {
    const db = makeDb({
      maxWorkspaces: 1,
      workspaces: [ws('11111111-1111-4111-8111-111111111111' as WorkspaceUuid)],
      statuses: [status('11111111-1111-4111-8111-111111111111' as WorkspaceUuid, 'active')]
    })

    await expect(createWorkspace(mockCtx, db, null, token, { workspaceName: 'second' })).rejects.toThrow(
      new PlatformError(new Status(Severity.ERROR, platform.status.WorkspaceLimitReached, { workspace: 'second' }))
    )
    expect(record).not.toHaveBeenCalled()
  })

  test('a workspace with no status row still takes the slot', async () => {
    const db = makeDb({ maxWorkspaces: 1, workspaces: [ws('11111111-1111-4111-8111-111111111111' as WorkspaceUuid)] })

    await expect(createWorkspace(mockCtx, db, null, token, { workspaceName: 'second' })).rejects.toThrow(
      new PlatformError(new Status(Severity.ERROR, platform.status.WorkspaceLimitReached, { workspace: 'second' }))
    )
  })

  test('a deleted workspace frees the slot', async () => {
    const db = makeDb({
      maxWorkspaces: 1,
      workspaces: [ws('11111111-1111-4111-8111-111111111111' as WorkspaceUuid)],
      statuses: [status('11111111-1111-4111-8111-111111111111' as WorkspaceUuid, 'deleted', true)]
    })

    const result = await createWorkspace(mockCtx, db, null, token, { workspaceName: 'second' })
    expect(result.workspace).toBe(newWorkspace)
    expect(record).toHaveBeenCalled()
  })

  test('the platform limit applies while the account has no override', async () => {
    const own = Array.from({ length: workspaceLimitPerUser }, (_, i) => ws(`1111-${i}` as WorkspaceUuid))
    const db = makeDb({
      workspaces: own,
      statuses: own.map((it) => status(it.uuid, 'active'))
    })

    await expect(createWorkspace(mockCtx, db, null, token, { workspaceName: 'overflow' })).rejects.toThrow(
      new PlatformError(new Status(Severity.ERROR, platform.status.WorkspaceLimitReached, { workspace: 'overflow' }))
    )
  })

  test('adminUpdateAccountWorkspaceLimit writes the override and reports the effective limit', async () => {
    const db = makeDb()

    const result = await adminUpdateAccountWorkspaceLimit(mockCtx, db, null, adminToken, {
      accountUuid: person,
      maxWorkspaces: 12,
      otpCode: '000000'
    })

    expect(db.account.update).toHaveBeenCalledWith({ uuid: person }, { maxWorkspaces: 12 })
    expect(result).toEqual({ workspaceLimit: 12 })
    expect(requireAdminOp).toHaveBeenCalledWith(mockCtx, db, adminToken, 'set_workspace_limit', '000000', person)
  })

  test('null clears the override instead of freezing the current platform value', async () => {
    const db = makeDb()

    const result = await adminUpdateAccountWorkspaceLimit(mockCtx, db, null, adminToken, {
      accountUuid: person,
      maxWorkspaces: null,
      otpCode: '000000'
    })

    expect(db.account.update).toHaveBeenCalledWith({ uuid: person }, { maxWorkspaces: null })
    expect(result).toEqual({ workspaceLimit: workspaceLimitPerUser })
  })

  test.each([0, -1, 1.5, maxWorkspacesLimit + 1])(
    'adminUpdateAccountWorkspaceLimit rejects %s',
    async (maxWorkspaces) => {
      const db = makeDb()

      await expect(
        adminUpdateAccountWorkspaceLimit(mockCtx, db, null, adminToken, {
          accountUuid: person,
          maxWorkspaces,
          otpCode: '000000'
        })
      ).rejects.toThrow(new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, {})))
      expect(db.account.update).not.toHaveBeenCalled()
    }
  )

  test('adminUpdateAccountWorkspaceLimit rejects an unknown account', async () => {
    const db = makeDb()
    ;(db.account.findOne as jest.Mock).mockResolvedValue(null)

    await expect(
      adminUpdateAccountWorkspaceLimit(mockCtx, db, null, adminToken, {
        accountUuid: person,
        maxWorkspaces: 12,
        otpCode: '000000'
      })
    ).rejects.toThrow(new PlatformError(new Status(Severity.ERROR, platform.status.AccountNotFound, {})))
    expect(db.account.update).not.toHaveBeenCalled()
  })

  test('a failing OTP gate blocks the write', async () => {
    const db = makeDb()
    ;(requireAdminOp as jest.Mock).mockRejectedValueOnce(
      new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
    )

    await expect(
      adminUpdateAccountWorkspaceLimit(mockCtx, db, null, adminToken, {
        accountUuid: person,
        maxWorkspaces: 12,
        otpCode: 'wrong'
      })
    ).rejects.toThrow(new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {})))
    expect(db.account.update).not.toHaveBeenCalled()
  })
})
