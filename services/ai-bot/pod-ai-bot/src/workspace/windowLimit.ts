//
// Copyright © 2026 Intabia Fusion
//

import { type AILevelModel } from '../config'

export interface WindowUsage {
  window5h: { used: number }
  week: { used: number }
}

export interface WindowLimitVerdict {
  blocked: boolean
  window?: '5h' | 'week'
  used?: number
  limit?: number
}

// Compare a level's rolling-window limits against current usage. A limit of 0 or
// undefined means unlimited. Blocks if EITHER window is at/over its limit.
export function checkWindowLimit (model: AILevelModel, usage: WindowUsage): WindowLimitVerdict {
  const l5 = model.window5hLimit ?? 0
  const lw = model.weekLimit ?? 0

  if (l5 > 0 && usage.window5h.used >= l5) {
    return { blocked: true, window: '5h', used: usage.window5h.used, limit: l5 }
  }
  if (lw > 0 && usage.week.used >= lw) {
    return { blocked: true, window: 'week', used: usage.week.used, limit: lw }
  }
  return { blocked: false }
}
