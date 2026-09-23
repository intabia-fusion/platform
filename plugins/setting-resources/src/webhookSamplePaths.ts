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

export interface WebhookSamplePath {
  path: string
  preview: string
  isArray: boolean
}

const MAX_PATHS = 300
const MAX_DEPTH = 8

function previewOf (value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `[${value.length}]`
  if (typeof value === 'object') return '{}'
  if (typeof value === 'string') return value.length > 40 ? `${value.slice(0, 40)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return `${value}`
  return typeof value
}

/** Flattens a parsed sample body into dotted paths for the rule editor's pickers. Arrays descend
 * into their first element only (index 0), own properties only, capped at `limit` paths / depth 8. */
export function listWebhookPaths (sample: unknown, limit: number = MAX_PATHS): WebhookSamplePath[] {
  const result: WebhookSamplePath[] = []

  function walk (value: unknown, path: string, depth: number): void {
    if (result.length >= limit) return
    if (path !== '') result.push({ path, preview: previewOf(value), isArray: Array.isArray(value) })
    if (depth >= MAX_DEPTH) return
    if (Array.isArray(value)) {
      if (value.length > 0) walk(value[0], `${path}.0`, depth + 1)
      return
    }
    if (value === null || typeof value !== 'object') return
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (result.length >= limit) return
      walk(v, path === '' ? key : `${path}.${key}`, depth + 1)
    }
  }

  walk(sample, '', 0)
  return result.slice(0, limit)
}
