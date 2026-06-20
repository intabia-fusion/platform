//
// Copyright © 2026 Intabia Fusion
//

import { type AILevel, type AIProviderConfig } from '../config'
import { providerLevels, resolveModel } from '../llms/modelRegistry'

export interface WindowUsage {
  window5h: { used: number, limit: number }
  week: { used: number, limit: number }
}

export interface LimitDecision {
  // 'proceed' with the (possibly downgraded) level, or 'block' with which window hit.
  action: 'proceed' | 'block'
  level?: AILevel
  blockedWindow?: '5h' | 'week'
}

function over (w: { used: number, limit: number }): boolean {
  return w.limit > 0 && w.used >= w.limit
}

// Decide whether to serve a request given rolling-window usage:
// - 5h window over limit -> hard block for everyone (no fallback).
// - weekly window over limit -> only a fallbackEligible level may serve. If the
//   requested level is eligible, proceed; else if fallbackToSimpler is on, switch to
//   the cheapest fallbackEligible level (by order); else block.
// - otherwise proceed with the requested level.
export function decideLevel (
  requested: AILevel,
  registry: AIProviderConfig[],
  usage: WindowUsage,
  fallbackToSimpler: boolean
): LimitDecision {
  if (over(usage.window5h)) {
    return { action: 'block', blockedWindow: '5h' }
  }

  if (!over(usage.week)) {
    return { action: 'proceed', level: requested }
  }

  // Weekly limit exceeded — only fallback-eligible levels may serve.
  if (isEligible(requested, registry)) {
    return { action: 'proceed', level: requested }
  }
  if (fallbackToSimpler) {
    const fallback = cheapestEligible(registry)
    if (fallback !== undefined) {
      return { action: 'proceed', level: fallback }
    }
  }
  return { action: 'block', blockedWindow: 'week' }
}

function isEligible (level: AILevel, registry: AIProviderConfig[]): boolean {
  try {
    return resolveModel(level, registry).model.fallbackEligible === true
  } catch {
    return false
  }
}

// Cheapest fallback-eligible level across all providers (lowest order).
function cheapestEligible (registry: AIProviderConfig[]): AILevel | undefined {
  let best: { level: AILevel, order: number } | undefined
  for (const provider of registry) {
    for (const level of providerLevels(provider)) {
      const model = provider.levels[level]
      if (model?.fallbackEligible === true) {
        if (best === undefined || model.order < best.order) {
          best = { level, order: model.order }
        }
      }
    }
  }
  return best?.level
}
