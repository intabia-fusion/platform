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

import { MeasureMetricsContext } from '@hcengineering/core'
import { mkdirSync, mkdtempSync } from 'fs'
import { createServer } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { start } from '../index'

jest.mock('@hcengineering/account-client', () => ({
  getClient: () => ({
    getWorkspaceInfo: async () => ({ uuid: 'ws-uuid', dataId: undefined, url: 'ws' })
  })
}))

// Same name and rule as the datalake client: these names are refused by the storage itself.
class InvalidNameError extends Error {
  name = 'InvalidNameError'
}
const refuse = (name: unknown): void => {
  if (typeof name !== 'string' || name === '' || name === '.' || name === '..') throw new InvalidNameError('Invalid')
}

const errors: string[] = []
const logger = {
  info: () => {},
  warn: () => {},
  error: (message: string) => {
    errors.push(message)
  },
  logOperation: () => {},
  close: async () => {}
}
const stat = jest.fn(async (_ctx: any, _ws: any, name: string) => {
  refuse(name)
  return undefined
})
const remove = jest.fn(async (_ctx: any, _ws: any, names: string[]) => {
  names.forEach(refuse)
})

let base = ''
let stop: () => void
let setIntervalSpy: jest.SpyInstance

async function freePort (): Promise<number> {
  return await new Promise((resolve) => {
    const srv = createServer()
    srv.listen(0, () => {
      const { port } = srv.address() as any
      srv.close(() => {
        resolve(port)
      })
    })
  })
}

beforeAll(async () => {
  // start() schedules a temp-file cleanup that would keep jest open
  setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((() => 0) as any)
  jest.spyOn(console, 'log').mockImplementation(() => {})
  // start() indexes <PUBLIC_DIR>/dist, so it has to exist
  const publicDir = mkdtempSync(join(tmpdir(), 'front-files-'))
  mkdirSync(join(publicDir, 'dist'))
  process.env.PUBLIC_DIR = publicDir
  const port = await freePort()
  const ctx = new MeasureMetricsContext('test', {}, {}, undefined, logger)
  stop = start(
    ctx,
    {
      storageAdapter: { stat, remove } as any,
      accountsUrl: 'http://account',
      uploadUrl: '/upload',
      filesUrl: '/files',
      modelVersion: '',
      version: '',
      rekoniUrl: '',
      telegramUrl: '',
      gmailUrl: '',
      calendarUrl: ''
    },
    port
  )
  base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${base}/config.json`)
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
})

afterAll(() => {
  stop?.()
  setIntervalSpy.mockRestore()
})

beforeEach(() => {
  errors.length = 0
  stat.mockClear()
  remove.mockClear()
})

const auth = { headers: { authorization: 'Bearer t' } }

describe('/files with a name the storage refuses', () => {
  it.each([
    ['GET', ''],
    ['GET', '.'],
    ['GET', '..'],
    ['GET', 'a&file=b'],
    ['HEAD', '']
  ])('%s ?file=%s answers 404 without an error log', async (method, name) => {
    const res = await fetch(`${base}/files?file=${name}`, { ...auth, method })
    expect(res.status).toBe(404)
    expect(errors).toEqual([])
    expect(stat).not.toHaveBeenCalled()
  })

  it.each(['', '.', '..', 'a&file=b'])('DELETE ?file=%s answers 400 without an error log', async (name) => {
    const res = await fetch(`${base}/files?file=${name}`, { ...auth, method: 'DELETE' })
    expect(res.status).toBe(400)
    expect(errors).toEqual([])
    expect(remove).not.toHaveBeenCalled()
  })

  it('GET of a missing blob is still 404 through stat', async () => {
    const res = await fetch(`${base}/files?file=abc`, auth)
    expect(res.status).toBe(404)
    expect(stat).toHaveBeenCalledTimes(1)
  })
})
