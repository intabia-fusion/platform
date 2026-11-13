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

/**
 * A meeting occurrence as a person reads it: short month, day, hour and minute, in the browser's
 * locale and timezone. Kept import-free on purpose - the theme and ui barrels bring Svelte with
 * them, and this helper is used from message building that unit tests exercise.
 */
export function formatOccurrence (ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleString()
  }
}
