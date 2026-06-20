//
// Copyright © 2026 Intabia Fusion
//

import { decideLevel, type WindowUsage } from '../workspace/windowLimit'
import { type AIProviderConfig } from '../config'

// Two providers: a purchased one (levels low/high) and a local clisr fallback.
const registry: AIProviderConfig[] = [
  {
    id: 'openai',
    provider: 'openai',
    concurrency: 1,
    batch: 1,
    levels: {
      low: { model: 'gpt-low', tokenMultiplier: 1, order: 1, label: 'Low' },
      high: { model: 'gpt-high', tokenMultiplier: 2, order: 3, label: 'High' }
    }
  },
  {
    id: 'clisr',
    provider: 'clisr',
    concurrency: 1,
    batch: 1,
    levels: {
      fast: { model: 'local-fast', tokenMultiplier: 0.1, order: 0, label: 'Fast', fallbackEligible: true }
    }
  }
]

const usage = (w5: [number, number], wk: [number, number]): WindowUsage => ({
  window5h: { used: w5[0], limit: w5[1] },
  week: { used: wk[0], limit: wk[1] }
})

describe('decideLevel', () => {
  it('proceeds with requested level when under both windows', () => {
    const d = decideLevel('high', registry, usage([10, 100], [10, 1000]), false)
    expect(d).toEqual({ action: 'proceed', level: 'high' })
  })

  it('5h over limit -> hard block (no fallback)', () => {
    const d = decideLevel('fast', registry, usage([100, 100], [0, 1000]), true)
    expect(d).toMatchObject({ action: 'block', blockedWindow: '5h' })
  })

  it('weekly over + requested not eligible + fallback off -> block', () => {
    const d = decideLevel('high', registry, usage([0, 100], [1000, 1000]), false)
    expect(d).toMatchObject({ action: 'block', blockedWindow: 'week' })
  })

  it('weekly over + fallback on -> downgrade to eligible level', () => {
    const d = decideLevel('high', registry, usage([0, 100], [1000, 1000]), true)
    expect(d).toEqual({ action: 'proceed', level: 'fast' })
  })

  it('weekly over + requested already eligible -> proceed as-is', () => {
    const d = decideLevel('fast', registry, usage([0, 100], [1000, 1000]), false)
    expect(d).toEqual({ action: 'proceed', level: 'fast' })
  })

  it('no limits (0) -> always proceed', () => {
    const d = decideLevel('high', registry, usage([1e9, 0], [1e9, 0]), false)
    expect(d).toEqual({ action: 'proceed', level: 'high' })
  })
})
