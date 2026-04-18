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

import { getWorkspaceIds } from '../utils'

jest.mock('@intabiafusion/account-client', () => ({
  getClient: jest.fn()
}))

jest.mock('../config', () => ({
  AccountsUrl: 'http://test-accounts:3000'
}))

describe('utils', () => {
  describe('getWorkspaceIds', () => {
    const mockGetWorkspaceInfo = jest.fn()
    const mockGetClient = jest.requireMock('@intabiafusion/account-client').getClient

    beforeEach(() => {
      jest.clearAllMocks()
      mockGetClient.mockReturnValue({
        getWorkspaceInfo: mockGetWorkspaceInfo
      })
    })

    it('should return workspace ids from account client', async () => {
      const mockWorkspaceInfo = {
        uuid: 'test-workspace-uuid',
        dataId: 'test-data-id',
        url: 'test-workspace-url'
      }
      mockGetWorkspaceInfo.mockResolvedValue(mockWorkspaceInfo)

      const result = await getWorkspaceIds('test-token')

      expect(mockGetClient).toHaveBeenCalledWith('http://test-accounts:3000', 'test-token')
      expect(mockGetWorkspaceInfo).toHaveBeenCalled()
      expect(result).toEqual({
        uuid: 'test-workspace-uuid',
        dataId: 'test-data-id',
        url: 'test-workspace-url'
      })
    })

    it('should handle workspace without dataId', async () => {
      const mockWorkspaceInfo = {
        uuid: 'test-workspace-uuid',
        dataId: undefined,
        url: 'test-workspace-url'
      }
      mockGetWorkspaceInfo.mockResolvedValue(mockWorkspaceInfo)

      const result = await getWorkspaceIds('test-token')

      expect(result).toEqual({
        uuid: 'test-workspace-uuid',
        dataId: undefined,
        url: 'test-workspace-url'
      })
    })

    it('should propagate errors from account client', async () => {
      const error = new Error('Network error')
      mockGetWorkspaceInfo.mockRejectedValue(error)

      await expect(getWorkspaceIds('test-token')).rejects.toThrow('Network error')
    })

    it('should pass token to account client', async () => {
      const mockWorkspaceInfo = {
        uuid: 'workspace-uuid',
        dataId: 'data-id',
        url: 'workspace-url'
      }
      mockGetWorkspaceInfo.mockResolvedValue(mockWorkspaceInfo)

      const customToken = 'custom-auth-token-123'
      await getWorkspaceIds(customToken)

      expect(mockGetClient).toHaveBeenCalledWith('http://test-accounts:3000', customToken)
    })

    it('should handle different workspace configurations', async () => {
      const testCases = [
        {
          input: { uuid: 'uuid-1', dataId: 'data-1', url: 'url-1' },
          expected: { uuid: 'uuid-1', dataId: 'data-1', url: 'url-1' }
        },
        {
          input: { uuid: 'uuid-2', dataId: null, url: 'url-2' },
          expected: { uuid: 'uuid-2', dataId: null, url: 'url-2' }
        },
        {
          input: { uuid: 'uuid-3', url: 'url-3' },
          expected: { uuid: 'uuid-3', dataId: undefined, url: 'url-3' }
        }
      ]

      for (const testCase of testCases) {
        mockGetWorkspaceInfo.mockResolvedValue(testCase.input)
        const result = await getWorkspaceIds('token')
        expect(result).toEqual(testCase.expected)
      }
    })
  })
})
