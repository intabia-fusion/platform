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

import chunter from '@hcengineering/chunter'
import type { Person } from '@hcengineering/contact'
import { getPersonsByPersonIds } from '@hcengineering/contact-resources'
import {
  notEmpty,
  type Class,
  type Doc,
  type Hierarchy,
  type PersonId,
  type Ref,
  type SearchResultDoc
} from '@hcengineering/core'

// Kept apart from hydrate.ts, which pulls in the view layer, so the row builders stay light.

export async function personsOf (docs: SearchResultDoc[]): Promise<Map<PersonId, Person>> {
  const ids = Array.from(new Set(docs.map((d) => d.doc.createdBy).filter(notEmpty)))
  return ids.length > 0 ? await getPersonsByPersonIds(ids) : new Map()
}

export function authorOf (d: SearchResultDoc, persons: Map<PersonId, Person>): Person | undefined {
  return d.doc.createdBy !== undefined ? persons.get(d.doc.createdBy) : undefined
}

export function trimmed (fragments: string[] | undefined): string[] {
  return (fragments ?? []).map((f) => f.trim()).filter((f) => f !== '')
}

export function isThreadClass (hierarchy: Hierarchy, _class: Ref<Class<Doc>>): boolean {
  return hierarchy.hasClass(_class) && hierarchy.isDerived(_class, chunter.class.ThreadMessage)
}
