//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { type Employee } from '@hcengineering/contact'
import core, { setCurrentAccount, type Ref, type Space } from '@hcengineering/core'
import { writable } from 'svelte/store'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const txSpy = vi.fn(async (..._args: any[]) => ({}))
const hierarchy = { isDerived: () => false, getClass: () => ({}) }

// The module pulls in the whole presentation/ui graph at import time, none of which the
// timezone sync uses beyond getClient.
vi.mock('@hcengineering/presentation', () => ({
  __esModule: true,
  default: { metadata: {} },
  getClient: () => ({
    client: { tx: txSpy, getHierarchy: () => hierarchy, getModel: () => ({}) },
    getHierarchy: () => hierarchy
  }),
  createQuery: () => ({ query: () => {}, unsubscribe: () => {} }),
  addTxListener: () => {},
  onClient: () => {},
  isDisabled: () => false,
  getBlobRef: async () => ({ src: '', srcset: '' }),
  getFileUrl: () => '',
  reduceCalls: (op: any) => op
}))

// view-resources mounts the whole editor/action graph at import time; utils.ts takes two
// symbols from it.
vi.mock('@hcengineering/view-resources', () => ({
  accessDeniedStore: writable(false),
  FilterQuery: { remove: () => {} }
}))

const employee = (timezone?: string): Employee =>
  ({
    _id: 'p1' as Ref<Employee>,
    _class: 'contact:class:Person',
    space: 'sp' as Ref<Space>,
    timezone
  }) as unknown as Employee

beforeAll(() => {
  setCurrentAccount({ uuid: 'acc', socialIds: ['s1'], primarySocialId: 's1' } as any)
  localStorage.clear()
})

describe('syncMyEmployeeTimezone', () => {
  it('writes once and never again, whatever the store reports next', async () => {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const other = browserTz === 'Asia/Tbilisi' ? 'Asia/Novosibirsk' : 'Asia/Tbilisi'
    const { syncMyEmployeeTimezone } = await import('../utils')

    await syncMyEmployeeTimezone(employee(other))
    expect(txSpy).toHaveBeenCalledTimes(1)
    const tx = txSpy.mock.calls[0][0]
    expect(tx.attributes).toEqual({ timezone: browserTz })
    // Derived: a device fact has no place in the tx log, so it must not be persisted there.
    expect(tx.space).toBe(core.space.DerivedTx)

    // What another session of mine broadcasts back must not start a write loop: the store
    // fires again with its timezone, and this one is what used to answer with ours.
    await syncMyEmployeeTimezone(employee(other))
    await syncMyEmployeeTimezone(employee(other))
    expect(txSpy).toHaveBeenCalledTimes(1)
  })

  it('stays quiet after a reload when this device already wrote its zone', async () => {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const other = browserTz === 'Asia/Tbilisi' ? 'Asia/Novosibirsk' : 'Asia/Tbilisi'
    // A reload loses the in-memory flag but keeps localStorage; another device holding the
    // field at its own zone must not pull a second write out of us.
    vi.resetModules()
    const { syncMyEmployeeTimezone } = await import('../utils')

    await syncMyEmployeeTimezone(employee(other))
    expect(txSpy).toHaveBeenCalledTimes(1)
  })

  it('ignores an undefined employee', async () => {
    const { syncMyEmployeeTimezone } = await import('../utils')
    await syncMyEmployeeTimezone(undefined)
    // Still only the write from the first test - an undefined employee must not consume the
    // single attempt either.
    expect(txSpy).toHaveBeenCalledTimes(1)
  })
})
