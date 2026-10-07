//
// Copyright © 2023 Hardcore Engineering Inc.
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

import core, { type Class, type Doc, notEmpty, type Ref, type Space } from '@hcengineering/core'
import {
  migrateSpace,
  tryMigrate,
  type MigrateOperation,
  type MigrationClient,
  type MigrationUpgradeClient
} from '@hcengineering/model'
import { DOMAIN_PREFERENCE, type Preference, preferenceId } from '@hcengineering/preference'

/**
 * Removes preferences of `_class` whose `attachedTo` no longer exists among `target` documents.
 * @public
 */
export async function removeOrphanPreferences (
  client: MigrationClient,
  _class: Ref<Class<Preference>>,
  target: Ref<Class<Doc>>
): Promise<void> {
  const { hierarchy } = client
  // Descendants of the target may live in other domains than the target itself.
  const domains = new Set(
    [target, ...hierarchy.getDescendants(target)].map((it) => hierarchy.findDomain(it)).filter(notEmpty)
  )
  const iterator = await client.traverse<Preference>(DOMAIN_PREFERENCE, { _class })
  try {
    while (true) {
      const prefs = (await iterator.next(500)) ?? []
      if (prefs.length === 0) break

      const ids = Array.from(new Set(prefs.map((it) => it.attachedTo).filter(notEmpty)))
      const alive = new Set<string>()
      for (const domain of domains) {
        const found = await client.find<Doc>(domain, { _id: { $in: ids as Ref<Doc>[] } }, { projection: { _id: 1 } })
        for (const doc of found) alive.add(doc._id)
      }
      const orphans = prefs.filter((it) => it.attachedTo == null || !alive.has(it.attachedTo)).map((it) => it._id)
      if (orphans.length > 0) {
        await client.deleteMany(DOMAIN_PREFERENCE, { _id: { $in: orphans } })
      }
    }
  } finally {
    await iterator.close()
  }
}

export const preferenceOperation: MigrateOperation = {
  async migrate (client: MigrationClient, mode): Promise<void> {
    await tryMigrate(mode, client, preferenceId, [
      {
        state: 'removeDeprecatedSpace',
        func: async (client: MigrationClient) => {
          await migrateSpace(client, 'preference:space:Preference' as Ref<Space>, core.space.Workspace, [
            DOMAIN_PREFERENCE
          ])
        }
      }
    ])
  },
  async upgrade (state: Map<string, Set<string>>, client: () => Promise<MigrationUpgradeClient>): Promise<void> {}
}
