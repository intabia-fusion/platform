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

jest.mock('../config', () => ({ __esModule: true, default: {} }))
jest.mock('@hcengineering/server-client', () => ({
  ...jest.requireActual('@hcengineering/server-client'),
  extractToken: () => ({ workspace: 'workspace', account: 'user' })
}))

/* eslint-disable import/first */
import { hashMessage } from '@hcengineering/chunter'
import { createServer } from '../server/server'
/* eslint-enable import/first */

describe('POST /translate', () => {
  const findOne = jest.fn()
  const clientFor = jest.fn(() => ({ findOne }))
  const queueTranslation = jest.fn()
  const controller: any = { getWorkspaceClient: async () => ({ clientFor }), queueTranslation }
  const routes = new Map<string, (...args: any[]) => any>()
  const app: any = {
    use: jest.fn(),
    get: jest.fn(),
    post: jest.fn((path, handler) => { routes.set(path, handler) })
  }
  createServer(controller, {} as any, app)

  async function request (body: unknown): Promise<{ status?: number, error?: any }> {
    return await new Promise((resolve) => {
      const result: { status?: number, error?: any } = {}
      const response = {
        status: (status: number) => { result.status = status; return response },
        json: () => { resolve(result) }
      }
      routes.get('/translate')?.({ body, headers: {} }, response, (error: any) => { result.error = error; resolve(result) })
    })
  }

  beforeEach(() => { jest.clearAllMocks() })

  it('queues the authorized message hash and requested language', async () => {
    const message = { _id: 'message', _class: 'chat', message: 'source' }
    findOne.mockResolvedValue(message)
    expect(await request({ message: 'message', lang: 'de' })).toEqual({ status: 202 })
    expect(clientFor).toHaveBeenCalledWith('user')
    expect(queueTranslation).toHaveBeenCalledWith('workspace', {
      kind: 'translate', message: 'message', messageClass: 'chat', sourceHash: hashMessage(message.message as any), lang: 'de'
    })
  })

  it('does not queue messages the caller cannot read', async () => {
    findOne.mockResolvedValue(undefined)
    const result = await request({ message: 'private', lang: 'en' })
    expect(result.error.code).toBe(404)
    expect(queueTranslation).not.toHaveBeenCalled()
  })

  it('rejects unsafe language keys', async () => {
    const result = await request({ message: 'message', lang: 'en.$bad' })
    expect(result.error.code).toBe(400)
    expect(queueTranslation).not.toHaveBeenCalled()
  })
})
