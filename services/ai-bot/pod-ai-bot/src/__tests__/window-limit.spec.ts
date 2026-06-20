//
// Copyright © 2026 Intabia Fusion
//

import { checkWindowLimit } from '../workspace/windowLimit'
import { type AILevelModel } from '../config'

function model (over: Partial<AILevelModel> = {}): AILevelModel {
  return { model: 'm', tokenMultiplier: 1, order: 0, label: 'L', ...over }
}

const usage = (w5: number, wk: number): { window5h: { used: number }, week: { used: number } } => ({
  window5h: { used: w5 },
  week: { used: wk }
})

describe('checkWindowLimit', () => {
  it('no limits = never blocked', () => {
    expect(checkWindowLimit(model(), usage(1e9, 1e9)).blocked).toBe(false)
  })

  it('blocks on 5h window at limit', () => {
    const v = checkWindowLimit(model({ window5hLimit: 100 }), usage(100, 0))
    expect(v).toMatchObject({ blocked: true, window: '5h', used: 100, limit: 100 })
  })

  it('blocks on week window over limit', () => {
    const v = checkWindowLimit(model({ weekLimit: 1000 }), usage(0, 1500))
    expect(v).toMatchObject({ blocked: true, window: 'week', limit: 1000 })
  })

  it('under both limits passes', () => {
    expect(checkWindowLimit(model({ window5hLimit: 100, weekLimit: 1000 }), usage(50, 500)).blocked).toBe(false)
  })

  it('5h checked before week', () => {
    const v = checkWindowLimit(model({ window5hLimit: 100, weekLimit: 1000 }), usage(100, 1500))
    expect(v.window).toBe('5h')
  })

  it('zero limit = unlimited', () => {
    expect(checkWindowLimit(model({ window5hLimit: 0 }), usage(9999, 0)).blocked).toBe(false)
  })
})
