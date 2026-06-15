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

/** The three AI memory fields stored per user. */
export interface AIMemory {
  assistantMemory: string
  userMemory: string
  sharedContext: string
}

const EMPTY: AIMemory = { assistantMemory: '', userMemory: '', sharedContext: '' }

/**
 * Decide the effective user memory and whether it must be migrated to a Preference.
 *
 * Priority:
 *  1. Preference (source of truth once created) -> use it, no migration.
 *  2. Legacy blob memory -> use it, migrate=true (caller writes the Preference).
 *  3. Nothing -> empty memory seeded with the employee name, no migration.
 *
 * Pure: no I/O, fully unit-testable.
 */
export function resolveMemory (
  pref: Partial<AIMemory> | undefined,
  blobMemory: Partial<AIMemory> | undefined,
  employeeName: string | undefined
): { memory: AIMemory, migrate: boolean } {
  if (pref !== undefined) {
    return { memory: normalize(pref), migrate: false }
  }
  if (blobMemory !== undefined) {
    return { memory: normalize(blobMemory), migrate: true }
  }
  return {
    memory: {
      ...EMPTY,
      userMemory: employeeName !== undefined && employeeName !== '' ? `User name: ${employeeName}` : ''
    },
    migrate: false
  }
}

function normalize (m: Partial<AIMemory>): AIMemory {
  return {
    assistantMemory: m.assistantMemory ?? '',
    userMemory: m.userMemory ?? '',
    sharedContext: m.sharedContext ?? ''
  }
}
