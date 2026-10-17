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

import { writable } from 'svelte/store'

export interface SwimLaneControls {
  collapseAll: () => void
  expandAll: () => void
}

export const swimLaneControlStore = writable<Map<string, SwimLaneControls>>(new Map())

export function registerSwimLaneControls (key: string, controls: SwimLaneControls): () => void {
  swimLaneControlStore.update((m) => {
    m.set(key, controls)
    return m
  })
  return () => {
    swimLaneControlStore.update((m) => {
      m.delete(key)
      return m
    })
  }
}

// Column merge actions of the board shown for a viewlet, for the issues view "..." menu.
export interface ColumnControls {
  resetMerge: () => void
  mergeByGroup: () => void
  // Some columns are merged now, so there is something to reset.
  merged: boolean
}

export const columnControlStore = writable<Map<string, ColumnControls>>(new Map())

export function registerColumnControls (key: string, controls: ColumnControls): () => void {
  columnControlStore.update((m) => {
    m.set(key, controls)
    return m
  })
  return () => {
    columnControlStore.update((m) => {
      if (m.get(key) === controls) m.delete(key)
      return m
    })
  }
}
