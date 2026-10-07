//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
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

import {
  tryMigrate,
  type MigrateOperation,
  type MigrationClient,
  type MigrationUpgradeClient
} from '@hcengineering/model'
import { removeOrphanPreferences } from '@hcengineering/model-preference'
import attachment, { attachmentId, DOMAIN_ATTACHMENT } from '.'

export const attachmentOperation: MigrateOperation = {
  async migrate (client: MigrationClient, mode): Promise<void> {
    await tryMigrate(mode, client, attachmentId, [
      {
        state: 'fix-attachedTo',
        mode: 'upgrade',
        func: async (client: MigrationClient): Promise<void> => {
          await client.update(
            DOMAIN_ATTACHMENT,
            { _class: attachment.class.Attachment, attachedToClass: 'chunter:class:Comment' },
            {
              attachedToClass: 'chunter:class:ChatMessage'
            }
          )
        }
      },
      {
        state: 'remove-orphan-saved-attachments-v1',
        mode: 'upgrade',
        func: async (client: MigrationClient): Promise<void> => {
          await removeOrphanPreferences(client, attachment.class.SavedAttachments, attachment.class.Attachment)
        }
      }
    ])
  },
  async upgrade (state: Map<string, Set<string>>, client: () => Promise<MigrationUpgradeClient>): Promise<void> {}
}
