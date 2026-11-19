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
//
// LexoRank helpers for the lists the user orders by hand: the floors in the office navigator and
// the permanent meetings inside their groups. A rank places a row between two others, so a drop
// rewrites one document instead of renumbering everything below it.
//

import type { Doc, Rank, Ref, TxOperations } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'

/** Rows without a rank (created before the list was ordered) sort after the ranked ones. */
export function compareRanks (a: Rank | undefined, b: Rank | undefined): number {
  if (a === b) return 0
  if (a === undefined) return 1
  if (b === undefined) return -1
  return a.localeCompare(b)
}

/**
 * Rank of `moved` once the list is in the order of `ids`: a LexoRank between its new neighbours, so
 * the rows that stayed keep their values. Undefined when `moved` is not part of the list.
 */
export function rankAfterMove<T extends Doc & { rank?: Rank }> (
  docs: T[],
  ids: Array<Ref<T>>,
  moved: Ref<T>
): Rank | undefined {
  const index = ids.indexOf(moved)
  if (index === -1) return undefined
  const rankOf = (id: Ref<T> | undefined): Rank | undefined =>
    id === undefined ? undefined : docs.find((it) => it._id === id)?.rank
  return makeRank(rankOf(ids[index - 1] as Ref<T> | undefined), rankOf(ids[index + 1] as Ref<T> | undefined))
}

/** Writes the rank of the row that moved; nothing is written when it already holds that value. */
export async function persistMovedRank<T extends Doc & { rank?: Rank }> (
  client: TxOperations,
  docs: T[],
  ids: Array<Ref<T>>,
  moved: Ref<T>
): Promise<void> {
  const doc = docs.find((it) => it._id === moved)
  const rank = rankAfterMove(docs, ids, moved)
  if (doc === undefined || rank === undefined || doc.rank === rank) return
  // `rank` is declared on Doc through the constraint, so the update only carries that one key.
  const target: Doc & { rank?: Rank } = doc
  await client.diffUpdate(target, { rank })
}
