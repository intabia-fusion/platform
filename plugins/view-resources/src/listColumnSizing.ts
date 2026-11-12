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

import { getContext, setContext, tick } from 'svelte'
import type { Action, ActionReturn } from 'svelte/action'
import { derived, get, writable, type Readable, type Writable } from 'svelte/store'

const contextKey = Symbol('list-column-sizing')
interface ColumnSizing {
  available: Writable<number>
  columns: Map<string, Writable<Map<HTMLElement, number>>>
}

// One scope for the entire list, including all its groups.
export function provideListColumnSizing (): (element: Element) => void {
  const sizing: ColumnSizing = { available: writable(0), columns: new Map() }
  setContext(contextKey, sizing)
  return (element) => {
    sizing.available.set(element.clientWidth)
  }
}

export function getListColumnSizing (key: string): {
  width: Readable<number | undefined>
  measure: Action<HTMLElement, string>
} {
  const sizing = getContext<ColumnSizing | undefined>(contextKey)
  let measurements = sizing?.columns.get(key)
  if (measurements === undefined) {
    measurements = writable(new Map<HTMLElement, number>())
    sizing?.columns.set(key, measurements)
  }
  const widths = measurements
  const width =
    sizing === undefined
      ? writable<number | undefined>(undefined)
      : derived([widths, sizing.available], ([values, available]) =>
          Math.min(Math.max(0, ...values.values()), available * 0.4, 512)
        )

  function measure (element: HTMLElement): ActionReturn<string> | undefined {
    if (sizing === undefined) return
    let active = true
    const update = (): void => {
      if (!active) return
      // The label is max-content until capped, so scrollWidth stays intrinsic.
      const next = element.scrollWidth
      if (get(widths).get(element) === next) return
      widths.update((values) => {
        values.set(element, next)
        return values
      })
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    update()
    return {
      update () {
        void tick().then(update)
      },
      destroy () {
        active = false
        observer.disconnect()
        widths.update((values) => {
          values.delete(element)
          return values
        })
      }
    }
  }
  return { width, measure }
}
