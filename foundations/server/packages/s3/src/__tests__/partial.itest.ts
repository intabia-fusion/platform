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

import { MeasureMetricsContext, type WorkspaceDataId, type WorkspaceUuid, generateId } from '@hcengineering/core'
import { minioConfig, stopContainers } from '@hcengineering/test-containers'
import { type Readable } from 'stream'
import { S3Service } from '..'

describe('s3 partial', () => {
  const ctx = new MeasureMetricsContext('test', {})
  const dataId = generateId() as unknown as WorkspaceDataId
  const wsIds = { uuid: dataId as unknown as WorkspaceUuid, dataId, url: '' }
  let service: S3Service

  beforeAll(async () => {
    const cfg = await minioConfig()
    service = new S3Service({
      kind: 's3',
      name: 's3',
      // An IP endpoint makes the SDK address buckets by path, which a single-host server needs.
      endpoint: `http://${cfg.endPoint === 'localhost' ? '127.0.0.1' : cfg.endPoint}:${cfg.port}`,
      accessKey: cfg.accessKey,
      secretKey: cfg.secretKey
    })
    await service.make(ctx, wsIds)
    await service.put(ctx, wsIds, 'blob', '0123456789', 'text/plain')
  }, 120000)

  afterAll(async () => {
    await stopContainers()
  })

  async function read (stream: Readable): Promise<string> {
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString()
  }

  it('returns exactly length bytes', async () => {
    expect(await read(await service.partial(ctx, wsIds, 'blob', 2, 3))).toBe('234')
  })

  it('returns the tail without a length', async () => {
    expect(await read(await service.partial(ctx, wsIds, 'blob', 7))).toBe('789')
  })
})
