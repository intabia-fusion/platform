//
// Copyright © 2026 Intabia Fusion.
//

import { ClientSocketReadyState } from '@hcengineering/client'
import { toFindResult, type PersonUuid, type WorkspaceUuid } from '@hcengineering/core'
import { connect } from '../connection'

// Socket that never opens: the connection stays idle and the test feeds handleMsg directly.
class IdleSocket {
  readyState: ClientSocketReadyState = ClientSocketReadyState.CONNECTING
  send (): void {}
  close (): void {
    this.readyState = ClientSocketReadyState.CLOSED
  }
}

async function collect (chunks: Array<{ data: any[], total: number, lookupMap?: Record<string, any> }>): Promise<any> {
  const client: any = connect('ws://localhost:3333', jest.fn(), 'ws' as WorkspaceUuid, 'u' as PersonUuid, {
    socketFactory: () => new IdleSocket() as any
  })
  const request = { resolve: jest.fn(), reject: jest.fn() }
  client.requests.set(7, request)
  chunks.forEach((c, index) => {
    client.handleMsg(1, {
      id: 7,
      chunk: { index, final: index === chunks.length - 1 },
      result: toFindResult(c.data, c.total, c.lookupMap)
    })
  })
  await client.close()
  expect(request.resolve).toHaveBeenCalledTimes(1)
  return request.resolve.mock.calls[0][0]
}

describe('multi-frame find response', () => {
  it('merges lookupMap of all chunks', async () => {
    const res = await collect([
      { data: [{ _id: 'a' }], total: 2, lookupMap: { x: { _id: 'x' } } },
      { data: [{ _id: 'b' }], total: 0, lookupMap: { y: { _id: 'y' } } }
    ])
    expect(res.map((d: any) => d._id)).toEqual(['a', 'b'])
    expect(Object.keys(res.lookupMap ?? {}).sort()).toEqual(['x', 'y'])
  })

  it('keeps an honest total of 0', async () => {
    const res = await collect([{ data: [], total: 0 }])
    expect(res.total).toBe(0)
  })
})
