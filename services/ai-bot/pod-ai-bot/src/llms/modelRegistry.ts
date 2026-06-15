//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { type AILevel, type AILevelModel, type AIProviderConfig } from '../config'
import { type TokenUsage } from './types'

export interface ResolvedModel {
  provider: AIProviderConfig
  level: AILevel // the level actually served (may differ from requested after fallback)
  model: AILevelModel
}

/** A level available across the registry, for UI listing. */
export interface AvailableLevel {
  level: AILevel
  order: number
  label: string
  description?: string
  tokenMultiplier: number
}

/**
 * All distinct levels the registry serves, sorted by `order` (weakest first).
 * If two providers define the same level id, the lower-order entry wins. UI uses
 * this to render the level picker with labels/descriptions.
 */
export function availableLevels (registry: AIProviderConfig[]): AvailableLevel[] {
  const byLevel = new Map<AILevel, AvailableLevel>()
  for (const provider of registry) {
    for (const [level, model] of Object.entries(provider.levels)) {
      if (model === undefined) continue
      const existing = byLevel.get(level)
      if (existing === undefined || model.order < existing.order) {
        byLevel.set(level, {
          level,
          order: model.order,
          label: model.label,
          description: model.description,
          tokenMultiplier: model.tokenMultiplier
        })
      }
    }
  }
  return [...byLevel.values()].sort((a, b) => a.order - b.order)
}

/**
 * Resolve a requested level to a (provider, model). The exact level wins; if no
 * provider serves it, fall back to the nearest available level by `order` (prefer
 * the closest lower/cheaper, then the closest higher). Throws if the registry
 * serves no levels.
 */
export function resolveModel (level: AILevel, registry: AIProviderConfig[]): ResolvedModel {
  const at = (lvl: AILevel): ResolvedModel | undefined => {
    for (const provider of registry) {
      const model = provider.levels[lvl]
      if (model !== undefined) return { provider, level: lvl, model }
    }
    return undefined
  }

  const exact = at(level)
  if (exact !== undefined) return exact

  const levels = availableLevels(registry)
  if (levels.length === 0) {
    throw new Error('AI provider registry serves no levels')
  }

  // Requested level not served. Pick nearest by order: prefer closest lower,
  // else closest higher. Unknown requested level (no order) -> weakest available.
  const reqOrder = levels.find((l) => l.level === level)?.order
  if (reqOrder === undefined) {
    const fallback = at(levels[0].level)
    if (fallback !== undefined) return fallback
  } else {
    const lower = levels.filter((l) => l.order < reqOrder).pop()
    const higher = levels.find((l) => l.order > reqOrder)
    const pick = lower ?? higher
    if (pick !== undefined) {
      const r = at(pick.level)
      if (r !== undefined) return r
    }
  }

  throw new Error('AI provider registry serves no levels')
}

/** Find a provider by its id, or undefined. */
export function providerById (id: string, registry: AIProviderConfig[]): AIProviderConfig | undefined {
  return registry.find((p) => p.id === id)
}

/** All levels a provider serves, weakest -> strongest (by `order`). */
export function providerLevels (provider: AIProviderConfig): AILevel[] {
  return Object.entries(provider.levels)
    .filter(([, m]) => m !== undefined)
    .sort(([, a], [, b]) => (a as AILevelModel).order - (b as AILevelModel).order)
    .map(([level]) => level)
}

/**
 * Billed tokens = (prompt + completion) * tokenMultiplier, rounded up.
 * Local hardware (clisr) gets a low multiplier; premium models cost more.
 */
export function billedTokens (usage: TokenUsage, multiplier: number): number {
  return Math.ceil((usage.promptTokens + usage.completionTokens) * multiplier)
}

/** GigaChat model -> level + billing multiplier mapping (helper for registry authoring). */
const GIGACHAT_TIERS: Record<string, { level: AILevel, multiplier: number }> = {
  'GigaChat-Lite': { level: 'low', multiplier: 1 },
  GigaChat: { level: 'middle', multiplier: 2 },
  'GigaChat-Pro': { level: 'high', multiplier: 4 },
  'GigaChat-Max': { level: 'max', multiplier: 8 }
}

/** Resolve a GigaChat tier; defaults to the base `GigaChat` (middle) when unknown. */
export function gigachatTier (model: string): { level: AILevel, multiplier: number } {
  return GIGACHAT_TIERS[model] ?? GIGACHAT_TIERS.GigaChat
}
