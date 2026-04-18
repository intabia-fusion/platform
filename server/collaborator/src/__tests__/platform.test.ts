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

import { systemAccountUuid } from '@intabiafusion/core'
// Mock config before importing platform
import { simpleClientFactory, Controller, WorkspaceClient } from '../platform'

jest.mock('../config', () => ({
  AccountsUrl: 'http://test-accounts:3000'
}))

jest.mock('@intabiafusion/server-client', () => ({
  createClient: jest.fn(),
  getTransactorEndpoint: jest.fn()
}))

jest.mock('@intabiafusion/account-client', () => ({
  getClient: jest.fn()
}))

jest.mock('@intabiafusion/server-token', () => ({
  generateToken: jest.fn()
}))

const mockGetTransactorEndpoint = jest.requireMock('@intabiafusion/server-client').getTransactorEndpoint
const mockCreateClient = jest.requireMock('@intabiafusion/server-client').createClient
const mockGenerateToken = jest.requireMock('@intabiafusion/server-token').generateToken

describe('platform', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Controller', () => {
    it('should create workspace client on first get', async () => {
      const controller = new Controller()
      const mockClient = { close: jest.fn() }

      mockGenerateToken.mockReturnValue('token')
      mockGetTransactorEndpoint.mockResolvedValue('ws://endpoint')
      mockCreateClient.mockResolvedValue(mockClient)

      const workspaceClient = await controller.get('workspace-1' as any)

      expect(workspaceClient.workspace).toBe('workspace-1')
      expect(workspaceClient.client).toBe(mockClient)
      expect(mockGenerateToken).toHaveBeenCalled()
      expect(mockGetTransactorEndpoint).toHaveBeenCalledWith('token')
      expect(mockCreateClient).toHaveBeenCalledWith('ws://endpoint', 'token')
    })

    it('should reuse existing workspace client', async () => {
      const controller = new Controller()
      const mockClient = { close: jest.fn() }

      mockGenerateToken.mockReturnValue('token')
      mockGetTransactorEndpoint.mockResolvedValue('ws://endpoint')
      mockCreateClient.mockResolvedValue(mockClient)

      const client1 = await controller.get('workspace-1' as any)
      const client2 = await controller.get('workspace-1' as any)

      expect(client1).toBe(client2)
      expect(mockCreateClient).toHaveBeenCalledTimes(1)
    })

    it('should close all workspace clients', async () => {
      const controller = new Controller()
      const mockClient1 = { close: jest.fn() }
      const mockClient2 = { close: jest.fn() }

      mockGenerateToken.mockReturnValue('token')
      mockGetTransactorEndpoint.mockResolvedValue('ws://endpoint')
      mockCreateClient.mockResolvedValueOnce(mockClient1).mockResolvedValueOnce(mockClient2)

      await controller.get('workspace-1' as any)
      await controller.get('workspace-2' as any)

      await controller.close()

      expect(mockClient1.close).toHaveBeenCalled()
      expect(mockClient2.close).toHaveBeenCalled()
    })
  })

  describe('WorkspaceClient', () => {
    it('should create workspace client with static factory', async () => {
      const mockClient = { close: jest.fn() }

      mockGenerateToken.mockReturnValue('system-token')
      mockGetTransactorEndpoint.mockResolvedValue('ws://endpoint')
      mockCreateClient.mockResolvedValue(mockClient)

      const client = await WorkspaceClient.create('workspace-1' as any)

      expect(client.workspace).toBe('workspace-1')
      expect(client.client).toBe(mockClient)
      expect(mockGenerateToken).toHaveBeenCalledWith(systemAccountUuid, 'workspace-1', {
        service: 'collaborator'
      })
    })

    it('should close client connection', async () => {
      const mockClient = { close: jest.fn() }

      mockGenerateToken.mockReturnValue('token')
      mockGetTransactorEndpoint.mockResolvedValue('ws://endpoint')
      mockCreateClient.mockResolvedValue(mockClient)

      const client = await WorkspaceClient.create('workspace-1' as any)
      await client.close()

      expect(mockClient.close).toHaveBeenCalled()
    })
  })

  describe('simpleClientFactory', () => {
    it('should return a function', () => {
      const mockToken = {
        account: 'account-uuid',
        workspace: 'workspace-uuid',
        extra: {}
      }

      const factory = simpleClientFactory(mockToken as any)

      expect(typeof factory).toBe('function')
    })
  })
})
