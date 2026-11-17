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

import core, {
  clone,
  type AccountUuid,
  type Ref,
  type Tx,
  type TxCreateDoc,
  type TxUpdateDoc,
  TxFactory,
  TxProcessor,
  systemAccountUuid
} from '@hcengineering/core'
import { getSocialIdsByAccounts } from '@hcengineering/server-contact'
import type { TriggerControl } from '@hcengineering/server-core'
import { boardBeforeKey, withBoardNavigationLock } from '@hcengineering/server-tracker'
import tracker, { type Board, type BoardNavigationPreference, isBoardAvailable } from '@hcengineering/tracker'

const attachedTo = 'tracker:boards-navigation'

export async function OnBoardMembers (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const additions = new Map<AccountUuid, Set<Ref<Board>>>()
  for (const tx of txes) {
    let before: Board | undefined
    let after: Board
    if (tx._class === core.class.TxCreateDoc) {
      after = TxProcessor.createDoc2Doc(tx as TxCreateDoc<Board>)
    } else if (tx._class === core.class.TxUpdateDoc) {
      before = control.contextCache.get(boardBeforeKey(tx._id))
      // Without a preimage we cannot distinguish a new assignment from a manually hidden board.
      if (before === undefined) continue
      after = TxProcessor.updateDoc2Doc(clone(before), tx as TxUpdateDoc<Board>)
    } else continue

    const previous = new Set(before === undefined ? [] : [before.author, ...(before.editors ?? [])])
    const members = new Set([after.author, ...(after.visibility === 'all' ? (after.editors ?? []) : [])])
    for (const account of members) {
      if (previous.has(account)) continue
      const boards = additions.get(account) ?? new Set<Ref<Board>>()
      boards.add(after._id)
      additions.set(account, boards)
    }
  }
  if (additions.size === 0) return []

  const socialIds = await getSocialIdsByAccounts(control, [...additions.keys()])
  const recipients = new Map<Ref<Tx>, AccountUuid>()
  // Derived writes bypass PrivateMiddleware. Route these exact transactions before generic targets.
  control.ctx.contextData.broadcast.targets = {
    [`board-navigation:${txes[0]._id}`]: async (tx) => {
      const account = recipients.get(tx._id)
      return account === undefined ? undefined : { target: [account, systemAccountUuid] }
    },
    ...control.ctx.contextData.broadcast.targets
  }

  for (const [account, boards] of additions) {
    const id = `${attachedTo}:${account}` as Ref<BoardNavigationPreference>
    await withBoardNavigationLock(control.workspace.uuid, id, control.contextCache, async () => {
      const [preference] = await control.findAll(control.ctx, tracker.class.BoardNavigationPreference, { _id: id })
      const identities = socialIds[account] ?? []
      const socialId = preference === undefined ? identities[0] : identities.find((id) => id === preference.createdBy)
      if (socialId === undefined) {
        control.ctx.warn('Cannot add board to navigation: missing identity or foreign preference owner', { account })
        return
      }
      const factory = new TxFactory(socialId, true)
      let tx: Tx
      if (preference === undefined) {
        // Preserve the initial catalogue snapshot used by ensureBoardNavigation on first opening.
        const available = await control.findAll(control.ctx, tracker.class.Board, {})
        tx = factory.createTxCreateDoc(tracker.class.BoardNavigationPreference, core.space.Workspace, {
          attachedTo,
          boards: [...new Set([...available.filter((b) => isBoardAvailable(b, account)).map((b) => b._id), ...boards])]
        }, id)
      } else {
        const missing = [...boards].filter((board) => !preference.boards.includes(board))
        if (missing.length === 0) return
        tx = factory.createTxUpdateDoc(tracker.class.BoardNavigationPreference, preference.space, id, {
          $push: { boards: { $each: missing, $position: preference.boards.length } }
        })
      }
      recipients.set(tx._id, account)
      // Hold the scope until persisted so concurrent board assignments cannot create duplicate preferences.
      await control.apply(control.ctx, [tx], true)
    })
  }
  return []
}
