//
// Copyright © 2026 Intabia Fusion.
//

import { MeasureMetricsContext, type WorkspaceIds, type WorkspaceUuid } from '@hcengineering/core'
import { NoSuchKeyError } from '@hcengineering/server-core'
import { S3Service } from '..'

const wsIds = { uuid: 'ws-uuid' as WorkspaceUuid } as unknown as WorkspaceIds

function createService (getObject: () => Promise<any>): S3Service {
  const service = new S3Service({
    endpoint: 'http://localhost',
    accessKey: 'a',
    secretKey: 'b',
    rootBucket: 'bucket'
  } as any)
  service.client = { getObject } as any
  return service
}

describe('S3Service.doGet', () => {
  const ctx = new MeasureMetricsContext('test', {})

  it.each([
    ['NoSuchKey name', { name: 'NoSuchKey' }],
    ['NotFound name', { name: 'NotFound' }],
    ['404 status', { name: 'Other', $metadata: { httpStatusCode: 404 } }]
  ])('maps %s to NoSuchKeyError', async (_, err) => {
    const service = createService(async () => await Promise.reject(err))
    await expect(service.doGet(ctx, wsIds, 'obj')).rejects.toBeInstanceOf(NoSuchKeyError)
  })

  it('rethrows other failures as they are', async () => {
    const err = Object.assign(new Error('boom'), { name: 'InternalError', $metadata: { httpStatusCode: 503 } })
    const service = createService(async () => await Promise.reject(err))
    await expect(service.doGet(ctx, wsIds, 'obj')).rejects.toBe(err)
  })
})
