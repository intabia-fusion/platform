//
// Copyright © 2026 Intabia Fusion
//

import { computeWindowResetAt, type HourBucket } from '../window'

const H = (h: number): string => `2026-01-01T${String(h).padStart(2, '0')}:00:00.000Z`

describe('computeWindowResetAt', () => {
  it('no limit (0) -> null', () => {
    expect(computeWindowResetAt([{ hour: H(0), tokens: 999 }], 0, 5)).toBeNull()
  })

  it('under limit -> null', () => {
    const b: HourBucket[] = [
      { hour: H(0), tokens: 40 },
      { hour: H(1), tokens: 30 }
    ]
    expect(computeWindowResetAt(b, 100, 5)).toBeNull()
  })

  it('exceeded: resets when oldest bucket ages out', () => {
    // limit 100, used 150. Dropping the 00:00 bucket (60) leaves 90 <= 100.
    const b: HourBucket[] = [
      { hour: H(0), tokens: 60 },
      { hour: H(2), tokens: 90 }
    ]
    // 00:00 + 5h = 05:00
    expect(computeWindowResetAt(b, 100, 5)).toBe(H(5))
  })

  it('exceeded: needs several buckets to age out', () => {
    const b: HourBucket[] = [
      { hour: H(0), tokens: 50 },
      { hour: H(1), tokens: 50 },
      { hour: H(2), tokens: 50 }
    ]
    // limit 60, used 150. drop 00 (->100), still >60; drop 01 (->50) <=60 -> 01+5h=06:00
    expect(computeWindowResetAt(b, 60, 5)).toBe(H(6))
  })

  it('single newest bucket over limit -> ages out last', () => {
    const b: HourBucket[] = [{ hour: H(3), tokens: 200 }]
    expect(computeWindowResetAt(b, 100, 5)).toBe(H(8))
  })
})
