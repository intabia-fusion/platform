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

import { type Person } from '@hcengineering/contact'
import { getSocialIdsByPersonRefs } from '@hcengineering/contact-resources'
import { type Ref, type SearchFilters, type Space } from '@hcengineering/core'

import { expandClasses } from './classes'
import type { ChatSearchFilters, PickedAuthor } from './types'

const TRANSCRIPTION_COLLECTION = 'transcription'

export async function pickAuthors (persons: Array<Ref<Person>>): Promise<PickedAuthor[]> {
  if (persons.length === 0) return []

  const socialIds = await getSocialIdsByPersonRefs(persons)

  return persons.map((person) => ({ person, socialIds: socialIds.get(person) ?? [] }))
}

export function toSearchFilters (filters: ChatSearchFilters): SearchFilters | undefined {
  const result: SearchFilters = {}

  if (filters.attachedToClasses !== undefined && filters.attachedToClasses.length > 0) {
    result.attachedToClass = expandClasses(filters.attachedToClasses)
  }
  if (filters.authors !== undefined && filters.authors.length > 0) {
    result.createdBy = filters.authors.flatMap((a) => a.socialIds)
  }
  if (filters.after !== undefined) {
    result.createdAfter = filters.after
  }
  if (filters.before !== undefined) {
    result.createdBefore = filters.before
  }
  if (filters.attachedTo !== undefined && filters.attachedTo.length > 0) {
    result.attachedTo = filters.attachedTo.map((o) => o._id)
  }
  if (filters.hasAttachment === true) {
    result.hasAttachment = true
  }
  if (filters.includeTranscription !== true) {
    result.excludeCollections = [TRANSCRIPTION_COLLECTION]
  }

  return Object.keys(result).length > 0 ? result : undefined
}

export function toSearchSpaces (_filters: ChatSearchFilters, scopeSpace?: Ref<Space>): Array<Ref<Space>> | undefined {
  return scopeSpace !== undefined ? [scopeSpace] : undefined
}

const DAY = 24 * 60 * 60 * 1000

export function startOfDay (value: number): number {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay (value: number): number {
  return startOfDay(value) + DAY - 1
}
