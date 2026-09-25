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

// Pure helpers of the kanban swim lanes, kept free of Svelte imports so that jest can load them.

/**
 * Swim lanes in display order: lanes whose values are in `sortedValues` go first in that order, the rest
 * follow, sorted by `fallbackKey`.
 */
export function orderSwimLanes<T extends { value: unknown }> (
  lanes: T[],
  sortedValues: unknown[] | undefined,
  fallbackKey: (lane: T) => string
): T[] {
  const index = new Map<unknown, number>((sortedValues ?? []).map((value, i) => [value, i]))
  const unknown = index.size
  return [...lanes].sort((a, b) => {
    const ai = index.get(a.value) ?? unknown
    const bi = index.get(b.value) ?? unknown
    if (ai !== bi) return ai - bi
    return fallbackKey(a).localeCompare(fallbackKey(b))
  })
}
