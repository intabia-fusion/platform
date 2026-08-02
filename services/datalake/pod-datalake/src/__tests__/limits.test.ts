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
import { type WorkspaceUuid } from '@hcengineering/core'
import { QueueWorkspaceEvent } from '@hcengineering/server-core'
import { LimitsState } from '../limits'

const WS_A = 'aaaaaaaa-0000-0000-0000-000000000001' as WorkspaceUuid
const WS_B = 'bbbbbbbb-0000-0000-0000-000000000002' as WorkspaceUuid

const ctx: any = { info: jest.fn(), error: jest.fn(), warn: jest.fn() }

function makeQueue (): {
  queue: any
  producer: any
  emit: (ws: WorkspaceUuid, category: string, status: string) => Promise<void>
} {
  let handler: ((ctx: any, msgs: any[], control: any) => Promise<void>) | undefined
  const producer = { send: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined) }
  const queue: any = {
    getProducer: jest.fn().mockReturnValue(producer),
    getClientId: jest.fn().mockReturnValue('test-client'),
    createBatchConsumer: jest.fn().mockImplementation((_c: any, _t: any, _g: any, h: any) => {
      handler = h
      return { close: jest.fn().mockResolvedValue(undefined) }
    })
  }
  const emit = async (workspace: WorkspaceUuid, category: string, status: string): Promise<void> => {
    await handler?.(ctx, [{ workspace, value: { type: QueueWorkspaceEvent.LimitsChanged, category, status } }], {})
  }
  return { queue, producer, emit }
}

describe('LimitsState', () => {
  it('cold-start fail-open: false before any events', () => {
    const { queue } = makeQueue()
    const state = new LimitsState(ctx, queue)
    expect(state.isExhausted(WS_A)).toBe(false)
  })

  it('disk exhausted adds, ok removes', async () => {
    const { queue, emit } = makeQueue()
    const state = new LimitsState(ctx, queue)
    await emit(WS_A, 'disk', 'exhausted')
    expect(state.isExhausted(WS_A)).toBe(true)
    await emit(WS_A, 'disk', 'ok')
    expect(state.isExhausted(WS_A)).toBe(false)
  })

  it('payment exhausted also blocks', async () => {
    const { queue, emit } = makeQueue()
    const state = new LimitsState(ctx, queue)
    await emit(WS_A, 'payment', 'exhausted')
    expect(state.isExhausted(WS_A)).toBe(true)
  })

  it('tokens/transcript categories ignored', async () => {
    const { queue, emit } = makeQueue()
    const state = new LimitsState(ctx, queue)
    await emit(WS_A, 'tokens', 'exhausted')
    await emit(WS_A, 'transcript', 'exhausted')
    expect(state.isExhausted(WS_A)).toBe(false)
  })

  it('per-workspace isolation', async () => {
    const { queue, emit } = makeQueue()
    const state = new LimitsState(ctx, queue)
    await emit(WS_A, 'disk', 'exhausted')
    expect(state.isExhausted(WS_A)).toBe(true)
    expect(state.isExhausted(WS_B)).toBe(false)
  })

  it('disk+payment: cleared only when both ok', async () => {
    const { queue, emit } = makeQueue()
    const state = new LimitsState(ctx, queue)
    await emit(WS_A, 'disk', 'exhausted')
    await emit(WS_A, 'payment', 'exhausted')
    expect(state.isExhausted(WS_A)).toBe(true)
    await emit(WS_A, 'disk', 'ok')
    expect(state.isExhausted(WS_A)).toBe(true) // payment still exhausted
    await emit(WS_A, 'payment', 'ok')
    expect(state.isExhausted(WS_A)).toBe(false)
  })

  it('sendStorageDelta sends correct shape', () => {
    const { queue, producer } = makeQueue()
    const state = new LimitsState(ctx, queue)
    state.sendStorageDelta(ctx, WS_A, 1024, 'abc123')
    expect(producer.send).toHaveBeenCalledWith(ctx, WS_A, [
      { kind: 'usage', workspace: WS_A, metric: 'storage', amount: 1024, ref: 'abc123' }
    ])
  })
})
