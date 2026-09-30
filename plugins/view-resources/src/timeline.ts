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

import type { Timestamp } from '@hcengineering/core'
import { writable, type Writable } from 'svelte/store'

function readNumber (key: string): number | undefined {
  try {
    const value = Number(localStorage.getItem(key))
    return Number.isFinite(value) && value > 0 ? value : undefined
  } catch {
    return undefined
  }
}

function persist (store: Writable<number>, key: string): void {
  store.subscribe((value) => {
    try {
      localStorage.setItem(key, String(value))
    } catch {}
  })
}

export function startOfMonth (date: Timestamp): Timestamp {
  const d = new Date(date)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

/**
 * First day of the month the Timeline view is centered on.
 * @public
 */
export const timelineMonthStore = writable<Timestamp>(readNumber('timeline.month') ?? startOfMonth(Date.now()))

export const timelineRanges = [1, 3, 6, 12]

/**
 * How many months the windowed Timeline shows around the selected one.
 * @public
 */
export const timelineRangeStore = writable<number>(readRange())

function readRange (): number {
  const value = readNumber('timeline.range')
  return value !== undefined && timelineRanges.includes(value) ? value : 3
}

persist(timelineMonthStore, 'timeline.month')
persist(timelineRangeStore, 'timeline.range')

// Grid density per range, so the whole window fits a typical panel width.
export function timelineDayWidth (months: number): number {
  if (months <= 1) return 24
  if (months <= 3) return 10
  if (months <= 6) return 5
  return 2.5
}
