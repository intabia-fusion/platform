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

import { AuthenticationExtension } from '../../extensions/authentication'
import { buildContext } from '../../context'
import { MeasureContext } from '@hcengineering/core'

jest.mock('@hcengineering/server-token', () => ({
  decodeToken: jest.fn()
}))

jest.mock('@hcengineering/collaborator-client', () => ({
  decodeDocumentId: jest.fn()
}))

jest.mock('@hcengineering/account', () => ({
  isReadOnlyOrGuest: jest.fn()
}))

jest.mock('../../context', () => ({
  buildContext: jest.fn()
}))

jest.mock('../../utils', () => ({
  getWorkspaceIds: jest.fn()
}))

const mockDecodeToken = jest.requireMock('@hcengineering/server-token').decodeToken
const mockDecodeDocumentId = jest.requireMock('@hcengineering/collaborator-client').decodeDocumentId
const mockIsReadOnlyOrGuest = jest.requireMock('@hcengineering/account').isReadOnlyOrGuest
const mockBuildContext = buildContext as jest.MockedFunction<typeof buildContext>
const mockGetWorkspaceIds = jest.requireMock('../../utils').getWorkspaceIds

describe('AuthenticationExtension', () => {
  const mockCtx: MeasureContext = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    with: jest.fn((_, _p1, fn) => fn(mockCtx)),
    withSync: jest.fn((_, __, fn) => fn()),
    newChild: jest.fn(() => mockCtx)
  } as unknown as MeasureContext

  beforeEach(() => {
    jest.clearAllMocks()
    mockDecodeDocumentId.mockReturnValue({
      workspaceId: 'workspace-uuid'
    })
  })

  describe('onAuthenticate', () => {
    it('should authenticate user and return context', async () => {
      const extension = new AuthenticationExtension({ ctx: mockCtx })

      const mockToken = {
        account: 'account-uuid',
        workspace: 'workspace-uuid',
        extra: {}
      }
      mockDecodeToken.mockReturnValue(mockToken)
      mockIsReadOnlyOrGuest.mockReturnValue(false)

      const mockWorkspaceIds = {
        uuid: 'workspace-uuid' as any,
        dataId: 'data-id' as any,
        url: 'workspace-url'
      }
      mockGetWorkspaceIds.mockResolvedValue(mockWorkspaceIds)

      const mockContext = {
        connectionId: 'conn-id',
        wsIds: mockWorkspaceIds,
        clientFactory: jest.fn()
      }
      mockBuildContext.mockReturnValue(mockContext)

      const mockConnection = { readOnly: false }
      const mockPayload = {
        token: 'test-token',
        documentName: 'workspace-uuid:doc-id:class:Doc:attr',
        requestParameters: new Map(),
        context: {},
        connection: mockConnection
      }

      const result = await extension.onAuthenticate(mockPayload as any)

      expect(mockDecodeDocumentId).toHaveBeenCalledWith('workspace-uuid:doc-id:class:Doc:attr')
      expect(mockDecodeToken).toHaveBeenCalledWith('test-token')
      expect(mockGetWorkspaceIds).toHaveBeenCalledWith('test-token')
      expect(mockBuildContext).toHaveBeenCalledWith(mockPayload, mockWorkspaceIds)
      expect(result).toBe(mockContext)
      expect(mockConnection.readOnly).toBe(false)
    })

    it('should set connection to read-only for readonly users', async () => {
      const extension = new AuthenticationExtension({ ctx: mockCtx })

      const mockToken = {
        account: 'guest-uuid',
        workspace: 'workspace-uuid',
        extra: {}
      }
      mockDecodeToken.mockReturnValue(mockToken)
      mockIsReadOnlyOrGuest.mockReturnValue(true)

      const mockWorkspaceIds = {
        uuid: 'workspace-uuid' as any,
        dataId: 'data-id' as any,
        url: 'workspace-url'
      }
      mockGetWorkspaceIds.mockResolvedValue(mockWorkspaceIds)

      const mockContext = {
        connectionId: 'conn-id',
        wsIds: mockWorkspaceIds,
        clientFactory: jest.fn()
      }
      mockBuildContext.mockReturnValue(mockContext)

      const mockConnection = { readOnly: false }
      const mockPayload = {
        token: 'test-token',
        documentName: 'workspace-uuid:doc-id:class:Doc:attr',
        requestParameters: new Map(),
        context: {},
        connection: mockConnection
      }

      await extension.onAuthenticate(mockPayload as any)

      expect(mockIsReadOnlyOrGuest).toHaveBeenCalledWith('guest-uuid', {})
      expect(mockConnection.readOnly).toBe(true)
    })

    it('should throw error when workspace ID does not match', async () => {
      const extension = new AuthenticationExtension({ ctx: mockCtx })

      const mockToken = {
        account: 'account-uuid',
        workspace: 'workspace-uuid',
        extra: {}
      }
      mockDecodeToken.mockReturnValue(mockToken)
      mockIsReadOnlyOrGuest.mockReturnValue(false)

      mockDecodeDocumentId.mockReturnValue({
        workspaceId: 'different-workspace-uuid'
      })

      const mockWorkspaceIds = {
        uuid: 'workspace-uuid' as any,
        dataId: 'data-id' as any,
        url: 'workspace-url'
      }
      mockGetWorkspaceIds.mockResolvedValue(mockWorkspaceIds)

      const mockPayload = {
        token: 'test-token',
        documentName: 'different-workspace-uuid:doc-id:class:Doc:attr',
        requestParameters: new Map(),
        context: {},
        connection: { readOnly: false }
      }

      await expect(extension.onAuthenticate(mockPayload as any)).rejects.toThrow(
        'documentName must include workspace id'
      )
    })

    it('should propagate errors from getWorkspaceIds', async () => {
      const extension = new AuthenticationExtension({ ctx: mockCtx })

      const mockToken = {
        account: 'account-uuid',
        workspace: 'workspace-uuid',
        extra: {}
      }
      mockDecodeToken.mockReturnValue(mockToken)
      mockIsReadOnlyOrGuest.mockReturnValue(false)

      mockGetWorkspaceIds.mockRejectedValue(new Error('Account service unavailable'))

      const mockPayload = {
        token: 'test-token',
        documentName: 'workspace-uuid:doc-id:class:Doc:attr',
        requestParameters: new Map(),
        context: {},
        connection: { readOnly: false }
      }

      await expect(extension.onAuthenticate(mockPayload as any)).rejects.toThrow('Account service unavailable')
    })

    it('should include mode in log when present in token', async () => {
      const extension = new AuthenticationExtension({ ctx: mockCtx })

      const mockToken = {
        account: 'account-uuid',
        workspace: 'workspace-uuid',
        extra: { mode: 'service' }
      }
      mockDecodeToken.mockReturnValue(mockToken)
      mockIsReadOnlyOrGuest.mockReturnValue(false)

      const mockWorkspaceIds = {
        uuid: 'workspace-uuid' as any,
        dataId: 'data-id' as any,
        url: 'workspace-url'
      }
      mockGetWorkspaceIds.mockResolvedValue(mockWorkspaceIds)

      const mockContext = {
        connectionId: 'conn-id',
        wsIds: mockWorkspaceIds,
        clientFactory: jest.fn()
      }
      mockBuildContext.mockReturnValue(mockContext)

      const mockPayload = {
        token: 'test-token',
        documentName: 'workspace-uuid:doc-id:class:Doc:attr',
        requestParameters: new Map(),
        context: {},
        connection: { readOnly: false }
      }

      await extension.onAuthenticate(mockPayload as any)

      expect(mockCtx.info).toHaveBeenCalledWith(
        'authenticate',
        expect.objectContaining({
          mode: 'service',
          readonly: false
        })
      )
    })
  })
})
