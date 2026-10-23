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

import core, { type Client } from '@hcengineering/core'
import platform, {
  addEventListener,
  PlatformError,
  PlatformEvent,
  removeEventListener,
  Severity,
  Status,
  type Status as PlatformStatus
} from '@hcengineering/platform'
import { PresentationPipelineImpl, type PresentationPipeline } from '../pipeline'

function connectionClosed (): PlatformError {
  return new PlatformError(new Status(Severity.ERROR, platform.status.ConnectionClosed, {}))
}

describe('PresentationPipelineImpl connection teardown', () => {
  const statuses: PlatformStatus[] = []
  const listener = async (_event: string, status: PlatformStatus): Promise<void> => {
    statuses.push(status)
  }

  beforeEach(() => {
    statuses.length = 0
    addEventListener(PlatformEvent, listener)
  })

  afterEach(() => {
    removeEventListener(PlatformEvent, listener)
  })

  function createPipeline (client: Partial<Client>): PresentationPipeline {
    return PresentationPipelineImpl.create(client as Client, [])
  }

  it('does not report a status for findAll cancelled by close', async () => {
    const pipeline = createPipeline({
      findAll: async () => {
        throw connectionClosed()
      }
    })

    const result = await pipeline.findAll(core.class.Doc, {})

    expect(result).toHaveLength(0)
    expect(statuses).toHaveLength(0)
  })

  it('does not report a status for findOne cancelled by close', async () => {
    const pipeline = createPipeline({
      findOne: async () => {
        throw connectionClosed()
      }
    })

    await expect(pipeline.findOne(core.class.Doc, {})).resolves.toBeUndefined()
    expect(statuses).toHaveLength(0)
  })

  it('does not report a status for tx cancelled by close', async () => {
    const pipeline = createPipeline({
      tx: async () => {
        throw connectionClosed()
      }
    })

    await expect(pipeline.tx({} as any)).resolves.toEqual({})
    expect(statuses).toHaveLength(0)
  })

  it('does not report a status for domainRequest cancelled by close', async () => {
    const pipeline = createPipeline({
      domainRequest: async () => {
        throw connectionClosed()
      }
    })

    await expect(pipeline.domainRequest('test' as any, {} as any)).resolves.toEqual({
      domain: 'test',
      value: null
    })
    expect(statuses).toHaveLength(0)
  })

  it('does not report a status for searchFulltext cancelled by close', async () => {
    const pipeline = createPipeline({
      searchFulltext: async () => {
        throw connectionClosed()
      }
    })

    await expect(pipeline.searchFulltext({ query: 'x', classes: [] }, { limit: 10 })).resolves.toEqual({ docs: [] })
    expect(statuses).toHaveLength(0)
  })

  it('still reports a real error', async () => {
    const pipeline = createPipeline({
      findAll: async () => {
        throw new Error('boom')
      }
    })

    await pipeline.findAll(core.class.Doc, {})

    expect(statuses).toHaveLength(1)
    expect(statuses[0].code).toBe(platform.status.UnknownError)
    expect(statuses[0].params.message).toBe('boom')
  })
})
