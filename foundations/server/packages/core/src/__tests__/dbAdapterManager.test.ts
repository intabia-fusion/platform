//
// Copyright © 2026 Intabia Fusion.
//

import { type Domain, type MeasureContext } from '@hcengineering/core'
import { type DbAdapter, type DbAdapterHandler, type DomainHelper } from '../adapter'
import { DbAdapterManagerImpl } from '../dbAdapterManager'

async function setup (): Promise<{ emit: (event: 'add' | 'delete', count: number) => void, checked: number[] }> {
  let handler: DbAdapterHandler | undefined
  const adapter = {
    on: (h: DbAdapterHandler) => {
      handler = h
    }
  } as unknown as DbAdapter
  const ctx = {
    with: async (_: string, __: any, op: (ctx: MeasureContext) => Promise<void>) => {
      await op(ctx)
    }
  } as unknown as MeasureContext
  const checked: number[] = []
  const helper: DomainHelper = {
    checkDomain: async (_ctx, _domain, documents) => {
      checked.push(documents)
    }
  }
  const manager = new DbAdapterManagerImpl(
    ctx,
    {} as any,
    { hierarchy: { domains: () => [] } } as any,
    adapter,
    new Map([['main', adapter]])
  )
  await manager.registerHelper(ctx, helper)
  return {
    emit: (event, count) => {
      handler?.('test' as Domain, event, count, {} as any)
    },
    checked
  }
}

describe('DbAdapterManagerImpl index check threshold', () => {
  it('checks the domain when one-by-one growth passes 50', async () => {
    const { emit, checked } = await setup()
    emit('add', 49)
    emit('add', 1)
    emit('add', 1)
    expect(checked).toEqual([51])
  })

  it('checks the domain when one-by-one shrink goes back to 50', async () => {
    const { emit, checked } = await setup()
    emit('add', 52)
    checked.length = 0
    emit('delete', 1)
    emit('delete', 1)
    expect(checked).toEqual([50])
  })
})
