//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { MeasureMetricsContext } from '@hcengineering/core'
import { wrapPipeline } from '../utils'

// wrapPipeline reuses one SessionData; if tx() doesn't drain broadcast, per-tx scanners
// (permissions) turn O(n^2). Guards the drain.
describe('wrapPipeline broadcast drain', () => {
  function makePipeline (): any {
    return {
      context: {
        modelDb: {},
        hierarchy: { updateLookupMixin: (_c: any, v: any) => v },
        lowLevelStorage: {}
      },
      // Simulate a middleware appending derived txes/queue entries during tx.
      tx: async (ctx: any) => {
        ctx.contextData.broadcast.txes.push({})
        ctx.contextData.broadcast.queue.push({})
        return [{}]
      },
      handleBroadcast: async () => {}
    }
  }

  it('drains txes/queue after every tx (no accumulation across calls)', async () => {
    const ctx = new MeasureMetricsContext('test', {})
    const client = wrapPipeline(ctx, makePipeline(), { uuid: 'ws', url: '', dataId: 'ws' } as any)
    const bc = (ctx.contextData as any).broadcast

    await client.tx({} as any)
    expect(bc.txes.length).toBe(0)
    expect(bc.queue.length).toBe(0)

    await client.tx({} as any)
    expect(bc.txes.length).toBe(0)
    expect(bc.queue.length).toBe(0)
  })
})
