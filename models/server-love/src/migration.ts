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

import core, { TxOperations } from '@hcengineering/core'
import love from '@hcengineering/love'
import {
  tryUpgrade,
  type MigrateMode,
  type MigrateOperation,
  type MigrationUpgradeClient
} from '@hcengineering/model'
import serverCore from '@hcengineering/server-core'
import serverLove, { serverLoveId } from '@hcengineering/server-love'

// A trigger is a model document, and a workspace keeps the model it was created with: a trigger
// added to the model later never reaches an existing workspace on its own. Without this step the
// owner of a permanent meeting can be removed from its members, and the session of a deleted
// permanent meeting stays running, on every workspace created before the trigger existed.
async function addPermanentMeetingTrigger (client: MigrationUpgradeClient): Promise<void> {
  const existing = await client.findAll(serverCore.class.Trigger, {
    trigger: serverLove.trigger.OnPermanentMeetingUpdate
  })
  if (existing.length > 0) return

  const tx = new TxOperations(client, core.account.System)
  await tx.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverLove.trigger.OnPermanentMeetingUpdate,
    txMatch: {
      objectClass: love.class.PermanentMeeting
    }
  })
}

export const serverLoveOperation: MigrateOperation = {
  async migrate (): Promise<void> {},
  async upgrade (
    state: Map<string, Set<string>>,
    client: () => Promise<MigrationUpgradeClient>,
    mode: MigrateMode
  ): Promise<void> {
    await tryUpgrade(mode, state, client, serverLoveId, [
      {
        state: 'add-permanent-meeting-trigger',
        func: addPermanentMeetingTrigger
      }
    ])
  }
}
