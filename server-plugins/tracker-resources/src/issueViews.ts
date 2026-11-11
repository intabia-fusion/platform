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

import core, { type Tx, type TxCUD, type Doc, type Ref, TxProcessor } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import tracker, { type Issue, type IssueViewPreference } from '@hcengineering/tracker'

// The normal preference API is private to the caller. Cleanup must collect all owners.
export async function OnIssueViewsChanged (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const removed = new Set<Ref<Issue>>()
  const changed = new Set<Ref<IssueViewPreference>>()
  for (const tx of txes) {
    if (!TxProcessor.isExtendsCUD(tx._class)) continue
    const cud = tx as TxCUD<Doc>
    if (control.hierarchy.isDerived(cud.objectClass, tracker.class.Issue) && tx._class === core.class.TxRemoveDoc) {
      removed.add(cud.objectId as Ref<Issue>)
    }
    if (cud.objectClass === tracker.class.IssueViewPreference && tx._class !== core.class.TxRemoveDoc) {
      changed.add(cud.objectId as Ref<IssueViewPreference>)
    }
  }
  const domain = control.hierarchy.getDomain(tracker.class.IssueViewPreference)
  const result: Tx[] = []
  if (removed.size > 0) {
    const views = await control.lowLevel.rawFindAll<IssueViewPreference>(domain, {
      _class: tracker.class.IssueViewPreference,
      attachedTo: { $in: [...removed] }
    })
    for (const view of views) {
      result.push(control.txFactory.createTxRemoveDoc(view._class, view.space, view._id))
    }
  }
  // A late create/update can arrive after deletion. Check it after storage, on every write,
  // including imports and clients that did not use the conditional recording operation.
  if (changed.size > 0) {
    const views = await control.lowLevel.rawFindAll<IssueViewPreference>(domain, {
      _class: tracker.class.IssueViewPreference,
      _id: { $in: [...changed] }
    })
    const alive = await control.findAll(control.ctx, tracker.class.Issue, {
      _id: { $in: views.map((view) => view.attachedTo) }
    }, { projection: { _id: 1 } })
    const ids = new Set(alive.map((issue) => issue._id))
    for (const view of views) {
      if (!ids.has(view.attachedTo) && !removed.has(view.attachedTo)) {
        result.push(control.txFactory.createTxRemoveDoc(view._class, view.space, view._id))
      }
    }
  }
  return result
}
