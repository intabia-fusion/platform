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

import { Analytics } from '@hcengineering/analytics'
import core, { type Account, AccountRole, type Doc, type Tx, type TxCUD, setCurrentAccount } from '@hcengineering/core'
import platform, { ForbiddenKind, PlatformError, Severity, Status, forbiddenError } from '@hcengineering/platform'
import { addNotification } from '@hcengineering/ui'
import view from '@hcengineering/view'
import { ReadOnlyAccessMiddleware } from '../middleware'

const nextTx = jest.fn()

jest.mock('@hcengineering/platform', () => ({
  __esModule: true,
  ...jest.requireActual('@hcengineering/platform'),
  translate: async (id: string) => id
}))
jest.mock('@hcengineering/presentation', () => ({
  BasePresentationMiddleware: class {
    async provideTx (tx: Tx): Promise<any> {
      return await nextTx(tx)
    }
  }
}))
jest.mock('@hcengineering/ui', () => ({
  addNotification: jest.fn(),
  NotificationSeverity: { Info: 'info' }
}))
jest.mock('@hcengineering/theme', () => ({ getCurrentLanguage: () => 'en' }))
jest.mock('../components/ReadOnlyNotification.svelte', () => ({}))
jest.mock('../components/ForbiddenNotification.svelte', () => ({}))

const tx = {
  _id: 'tx1',
  _class: core.class.TxUpdateDoc,
  objectClass: core.class.Space,
  objectId: 'space1',
  objectSpace: core.space.Space
} as unknown as TxCUD<Doc>

describe('ReadOnlyAccessMiddleware forbidden handling', () => {
  const mw = ReadOnlyAccessMiddleware.create({} as any)
  const handleEvent = jest.spyOn(Analytics, 'handleEvent').mockImplementation(() => {})

  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

  beforeEach(() => {
    jest.clearAllMocks()
    setCurrentAccount({ uuid: 'user1', role: AccountRole.User } as unknown as Account)
  })

  it.each([
    [ForbiddenKind.WorkspaceRole, view.string.PermissionWarningTitle, view.string.PermissionWarningMessage],
    [ForbiddenKind.NotSpaceMember, view.string.AccessDeniedTitle, view.string.NotSpaceMemberMessage],
    [ForbiddenKind.SpaceOwnerOnly, view.string.AccessDeniedTitle, view.string.SpaceOwnerOnlyMessage],
    [ForbiddenKind.LastSpaceOwner, view.string.AccessDeniedTitle, view.string.LastSpaceOwnerMessage],
    [ForbiddenKind.SpaceRole, view.string.AccessDeniedTitle, view.string.SpaceRoleMessage],
    [ForbiddenKind.WorkspaceOwnerOnly, view.string.AccessDeniedTitle, view.string.WorkspaceOwnerOnlyMessage],
    [ForbiddenKind.SeatLimit, view.string.AccessDeniedTitle, view.string.SeatLimitMessage],
    [ForbiddenKind.SystemOnly, view.string.AccessDeniedTitle, view.string.AccessDeniedMessage]
  ])('%s: shows its text grouped by kind and logs PermissionDenied', async (kind, title, message) => {
    nextTx.mockRejectedValue(forbiddenError(kind))

    await expect(mw.tx(tx)).resolves.toEqual({})

    expect(addNotification).toHaveBeenCalledWith(
      title,
      message,
      expect.anything(),
      expect.anything(),
      'info',
      `forbidden-${kind}`
    )
    expect(handleEvent).toHaveBeenCalledWith('PermissionDenied', {
      kind,
      txId: 'tx1',
      txClass: core.class.TxUpdateDoc,
      objectClass: core.class.Space,
      objectId: 'space1',
      objectSpace: core.space.Space,
      role: AccountRole.User
    })
  })

  it('passes the server reason to the console and analytics', async () => {
    nextTx.mockRejectedValue(forbiddenError(ForbiddenKind.SpaceOwnerOnly, 'Only owners can change space privacy'))

    await mw.tx(tx)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Only owners can change space privacy'))
    expect(handleEvent).toHaveBeenCalledWith(
      'PermissionDenied',
      expect.objectContaining({ message: 'Only owners can change space privacy' })
    )
  })

  it('falls back to the default text for Forbidden without a kind', async () => {
    nextTx.mockRejectedValue(new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {})))

    await expect(mw.tx(tx)).resolves.toEqual({})

    expect(addNotification).toHaveBeenCalledWith(
      view.string.AccessDeniedTitle,
      view.string.AccessDeniedMessage,
      expect.anything(),
      expect.anything(),
      'info',
      'forbidden-unknown'
    )
    expect(handleEvent).toHaveBeenCalledWith('PermissionDenied', expect.objectContaining({ kind: 'unknown' }))
  })

  it('rethrows errors other than Forbidden', async () => {
    const err = new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, {}))
    nextTx.mockRejectedValue(err)

    await expect(mw.tx(tx)).rejects.toBe(err)
    expect(addNotification).not.toHaveBeenCalled()
    expect(handleEvent).not.toHaveBeenCalled()
  })
})
