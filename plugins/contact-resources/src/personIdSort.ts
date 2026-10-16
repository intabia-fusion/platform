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

import { getName, getPersonsByPersonIds } from '@hcengineering/contact'
import { type PersonId, type TxOperations } from '@hcengineering/core'

// Groups by createdBy/modifiedBy: by the person's display name, empty values last.
export async function personIdSort (
  client: TxOperations,
  value: Array<PersonId | null | undefined>
): Promise<Array<PersonId | null | undefined>> {
  const h = client.getHierarchy()
  const ids = value.filter((v): v is PersonId => v != null)
  const persons = ids.length > 0 ? await getPersonsByPersonIds(client, ids) : new Map()
  const nameOf = (id: PersonId): string => {
    const p = persons.get(id)
    return p !== undefined ? getName(h, p) : ''
  }

  return [...value].sort((a, b) => {
    if (a == null && b == null) return 0
    if (a == null) return 1
    if (b == null) return -1
    return nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' })
  })
}
