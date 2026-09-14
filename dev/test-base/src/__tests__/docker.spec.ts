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

import { EventEmitter } from 'events'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import type * as dockerModule from '../docker'
import type * as logModule from '../log'

jest.mock('child_process', () => ({ spawn: jest.fn() }))
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn } = require('child_process')

describe('composeUp', () => {
  const dir = resolve(mkdtempSync(resolve(tmpdir(), 'test-base-docker-')), 'prepare')
  const original = process.stdout.write.bind(process.stdout)
  let composeUp: typeof dockerModule.composeUp

  beforeAll(() => {
    process.stdout.write = (() => true) as any
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const log: typeof logModule = require('../log')
      log.initLogs(dir)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      composeUp = (require('../docker') as typeof dockerModule).composeUp
    })
  })

  afterAll(() => {
    process.stdout.write = original
  })

  /** A child that reports `code` on the next tick, like a finished process would. */
  function child (code: number): EventEmitter & { stdout: EventEmitter, stderr: EventEmitter } {
    const it = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() })
    setTimeout(() => it.emit('close', code), 0)
    return it
  }

  const opts = { cwd: '/tmp', project: 'qms', files: ['docker-compose.yaml'] }

  beforeEach(() => {
    spawn.mockReset()
  })

  it('retries a failed up and succeeds on the second attempt', async () => {
    spawn.mockImplementationOnce(() => child(1)).mockImplementationOnce(() => child(0))

    await composeUp(opts, 3, 1)

    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('gives up after the attempt limit and reports the failure', async () => {
    spawn.mockImplementation(() => child(1))

    await expect(composeUp(opts, 3, 1)).rejects.toThrow('exited with code 1')
    expect(spawn).toHaveBeenCalledTimes(3)
  })
})
