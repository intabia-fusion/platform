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

import { type MigrateUpdate, type MigrationClient, type MigrationUpdate, updateEach } from '@hcengineering/model'
import { type DocNotifyContext, type NotificationMessage } from '@hcengineering/notification'

import { DOMAIN_DOC_NOTIFY } from '../index'

// A context before the previews: its display copies and the thread message under `object`.
interface OldContext extends DocNotifyContext {
  object?: NotificationMessage
  objectTitle?: string
  objectIdentifier?: string
  objectLabel?: string
  objectIcon?: unknown
  parentObjectTitle?: string
  parentObjectIdentifier?: string
  parentObjectLabel?: string
  parentObjectIcon?: unknown
}

const stale = {
  object: '',
  objectTitle: '',
  objectIdentifier: '',
  objectLabel: '',
  objectIcon: '',
  parentObjectTitle: '',
  parentObjectIdentifier: '',
  parentObjectLabel: '',
  parentObjectIcon: ''
} as const

// The thread message moves to `message`; the display copies go, the card reads the preview.
export async function dropContextDisplayCopies (client: MigrationClient): Promise<void> {
  const counters = { done: 0, moved: 0, failed: 0 }
  // Every context of before had `objectTitle`; a second pass catches one with `object` alone
  for (const marker of ['objectTitle', 'object'] as const) {
    const iterator = await client.traverse<OldContext>(DOMAIN_DOC_NOTIFY, { [marker]: { $exists: true } })
    try {
      while (true) {
        const contexts = (await iterator.next(500)) ?? []
        if (contexts.length === 0) break
        const updates: Array<MigrationUpdate<OldContext>> = contexts.map((context) => {
          const update: MigrateUpdate<OldContext> = { $unset: stale }
          if (context.message == null && context.object != null) {
            update.message = context.object
            counters.moved++
          }
          return { filter: { _id: context._id }, update }
        })
        const done = await updateEach(client, DOMAIN_DOC_NOTIFY, updates)
        counters.done += done
        counters.failed += updates.length - done
      }
    } finally {
      await iterator.close()
    }
  }
  client.logger.log('context display copies', counters)
}
