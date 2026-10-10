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

import { MeasureMetricsContext, type WorkspaceIds, type WorkspaceUuid } from '@hcengineering/core'
import { Readable } from 'stream'
import { DatalakeService } from '..'

describe('DatalakeService.put', () => {
  const ctx = new MeasureMetricsContext('test', {})
  const wsIds: WorkspaceIds = { uuid: 'ws' as WorkspaceUuid, url: 'ws' }
  let uploadedSizes: number[] = []
  let fetchCalls = 0

  beforeEach(() => {
    uploadedSizes = []
    fetchCalls = 0
    // The first request fails on the network, the next ones succeed.
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      fetchCalls++
      if (init?.body instanceof FormData) {
        uploadedSizes.push((init.body.get('file') as File).size)
      }
      if (fetchCalls === 1) {
        throw new Error('connection reset')
      }
      return Response.json([{ key: 'blob', metadata: { etag: 'etag' } }])
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const service = (): DatalakeService =>
    new DatalakeService({ kind: 'datalake', name: 'datalake', endpoint: 'http://datalake' }, { retryInterval: 0 })

  // The direct upload holds the whole object in memory anyway, so a stream is buffered once and retried.
  it('retries a stream on the direct upload path', async () => {
    await service().put(ctx, wsIds, 'blob', Readable.from([Buffer.from('hello')]), 'text/plain')
    expect(uploadedSizes).toEqual([5, 5])
  })

  it('retries a buffer', async () => {
    await service().put(ctx, wsIds, 'blob', Buffer.from('hello'), 'text/plain')
    expect(uploadedSizes).toEqual([5, 5])
  })
})
