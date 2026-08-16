//
// Copyright © 2026 Intabia Fusion
//

import { decideLevel, type WindowUsage } from '../workspace/windowLimit'

const usage = (used: number, limit: number, isFree = true, balance = 0): WindowUsage => ({
  month: { used, limit },
  balance,
  plan: isFree ? 'free' : 'business',
  isFree,
  hasPackages: false
})

describe('decideLevel', () => {
  it('proceeds with requested level when the tier window has room', () => {
    const d = decideLevel('high', usage(10, 100))
    expect(d).toEqual({ action: 'proceed', level: 'high' })
  })

  it('tier window spent + no balance -> block on a free plan', () => {
    const d = decideLevel('high', usage(1000, 1000, true))
    expect(d).toEqual({ action: 'block', reason: 'limit' })
  })

  it('tier window spent + no balance -> block on a paid plan too (no level downgrade)', () => {
    const d = decideLevel('high', usage(1000, 1000, false))
    expect(d).toEqual({ action: 'block', reason: 'limit' })
  })

  it('tier window spent but purchased balance left -> proceed at the requested level', () => {
    const d = decideLevel('high', usage(1000, 1000, true, 5000))
    expect(d).toEqual({ action: 'proceed', level: 'high' })
  })

  it('tier window over-spent beyond the balance -> block', () => {
    const d = decideLevel('high', usage(1000, 1000, false, 0))
    expect(d).toEqual({ action: 'block', reason: 'limit' })
  })

  it('billing unavailable -> block regardless of the reported window', () => {
    const d = decideLevel('high', { ...usage(0, 0, false), unavailable: true })
    expect(d).toEqual({ action: 'block', reason: 'unavailable' })
  })

  it('no limit (0) -> always proceed', () => {
    const d = decideLevel('high', usage(1e9, 0))
    expect(d).toEqual({ action: 'proceed', level: 'high' })
  })
})
