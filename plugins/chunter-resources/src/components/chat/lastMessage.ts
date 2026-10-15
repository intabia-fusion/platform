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
import activity, { type ActivityMessage } from '@hcengineering/activity'
import { type Doc, type Ref, type Timestamp, type TxCreateDoc, core } from '@hcengineering/core'
import { addTxListener, getClient, onWorkspaceChange } from '@hcengineering/presentation'
import { get, writable } from 'svelte/store'

export const lastMessageByDoc = writable<Map<Ref<Doc>, Timestamp>>(new Map())

addTxListener((txes) => {
  const hierarchy = getClient().getHierarchy()
  const current = get(lastMessageByDoc)
  const next = new Map(current)
  let changed = false

  for (const tx of txes) {
    if (tx._class !== core.class.TxCreateDoc) continue
    const create = tx as TxCreateDoc<ActivityMessage>
    if (create.attachedTo === undefined) continue
    if (!hierarchy.isDerived(create.objectClass, activity.class.ActivityMessage)) continue

    next.set(create.attachedTo, create.modifiedOn)
    changed = true
  }

  if (changed) lastMessageByDoc.set(next)
})

onWorkspaceChange(() => {
  lastMessageByDoc.set(new Map())
})
