//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { type Ref, type Space } from '@hcengineering/core'
import { type Employee } from '@hcengineering/contact'

const txSpy = jest.fn(async (..._args: any[]) => ({}))

jest.mock('@hcengineering/presentation', () => ({ getClient: () => ({ tx: txSpy }) }))

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  clear: () => {
    store.clear()
  }
}

const employee = (timezone?: string): Employee =>
  ({
    _id: 'p1' as Ref<Employee>,
    _class: 'contact:class:Person',
    space: 'sp' as Ref<Space>,
    timezone
  }) as unknown as Employee

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
const foreignTz = browserTz === 'Asia/Tbilisi' ? 'Asia/Novosibirsk' : 'Asia/Tbilisi'

// jest.resetModules() hands the module a fresh core, so the account has to be set on that one.
async function loadSync (): Promise<typeof import('../timezone').syncMyEmployeeTimezone> {
  const core = await import('@hcengineering/core')
  core.setCurrentAccount({ uuid: 'acc', socialIds: ['s1'], primarySocialId: 's1' } as any)
  return (await import('../timezone')).syncMyEmployeeTimezone
}

async function derivedTxSpace (): Promise<string> {
  return (await import('@hcengineering/core')).default.space.DerivedTx
}

const workingStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  clear: () => {
    store.clear()
  }
}

beforeEach(() => {
  ;(globalThis as any).localStorage = workingStorage
  txSpy.mockClear()
  store.clear()
  jest.resetModules()
})

describe('syncMyEmployeeTimezone', () => {
  it('writes this device zone once, as a derived tx', async () => {
    const syncMyEmployeeTimezone = await loadSync()

    await syncMyEmployeeTimezone(employee(foreignTz))

    expect(txSpy).toHaveBeenCalledTimes(1)
    const tx = txSpy.mock.calls[0][0]
    expect(tx.attributes).toEqual({ timezone: browserTz })
    // A device fact has no place in the tx log - that domain is what filled up (FUSIO-1344).
    expect(tx.space).toBe(await derivedTxSpace())
  })

  it('ignores what another session of mine writes back', async () => {
    const syncMyEmployeeTimezone = await loadSync()

    await syncMyEmployeeTimezone(employee(foreignTz))
    await syncMyEmployeeTimezone(employee(foreignTz))
    await syncMyEmployeeTimezone(employee(foreignTz))

    expect(txSpy).toHaveBeenCalledTimes(1)
  })

  it('stays quiet after a reload once this device has written its zone', async () => {
    const first = await loadSync()
    await first(employee(foreignTz))
    expect(txSpy).toHaveBeenCalledTimes(1)

    // A reload loses the in-memory flag but keeps localStorage.
    jest.resetModules()
    const reloaded = await loadSync()
    await reloaded(employee(foreignTz))

    expect(txSpy).toHaveBeenCalledTimes(1)
  })

  it('survives a browser that denies storage', async () => {
    const denied = (): never => {
      throw new Error('SecurityError: storage is disabled')
    }
    ;(globalThis as any).localStorage = { getItem: denied, setItem: denied, clear: () => {} }
    const syncMyEmployeeTimezone = await loadSync()

    // A private window must not turn this into an unhandled rejection - the caller only does
    // `void syncMyEmployeeTimezone(...)`.
    await expect(syncMyEmployeeTimezone(employee(foreignTz))).resolves.toBeUndefined()
  })

  it('does nothing without an employee', async () => {
    const syncMyEmployeeTimezone = await loadSync()
    await syncMyEmployeeTimezone(undefined)
    expect(txSpy).not.toHaveBeenCalled()
  })
})
