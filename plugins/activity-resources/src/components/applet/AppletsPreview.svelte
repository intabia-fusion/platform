<!--
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
-->

<script lang="ts">
  import activity, { type ActivityMessage, type AppletInstance, type AppletSnapshot } from '@hcengineering/activity'
  import type { Ref } from '@hcengineering/core'
  import { type Asset, getResource } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Icon } from '@hcengineering/ui'

  import { sortApplets } from '../../applets'

  // Ready copies (a forwarded message, a notification) skip the query.
  export let messageId: Ref<ActivityMessage> | undefined = undefined
  export let applets: AppletSnapshot[] | undefined = undefined

  interface Item {
    _id: Ref<AppletInstance>
    icon: Asset
    title: string
  }

  const client = getClient()
  const query = createQuery()

  let queried: AppletSnapshot[] = []
  let queriedFor: Ref<ActivityMessage> | undefined = undefined
  let items: Item[] = []
  let version = 0

  $: if (applets == null && messageId != null) {
    const id = messageId
    query.query(activity.class.AppletInstance, { attachedTo: messageId }, (res) => {
      queried = res
      queriedFor = id
    })
  } else {
    query.unsubscribe()
    queried = []
    queriedFor = undefined
  }

  // Checked by id: a reused preview would show the titles of the previous message.
  $: resolveItems(applets ?? (queriedFor === messageId ? queried : [])).catch((err) => {
    console.error(err)
  })

  async function resolveItems (instances: AppletSnapshot[]): Promise<void> {
    const current = ++version
    const result: Item[] = []
    for (const instance of sortApplets(instances)) {
      const model = client.getModel().findAllSync(activity.class.Applet, { _id: instance.applet })[0]
      if (model == null) continue
      const getTitle = await getResource(model.getTitleFn)
      result.push({ _id: instance._id, icon: model.icon, title: getTitle(instance) })
    }
    if (current === version) items = result
  }
</script>

{#each items as item (item._id)}
  <span class="applet-preview">
    <Icon icon={item.icon} size="small" />
    <span class="overflow-label">{item.title}</span>
  </span>
{/each}

<style lang="scss">
  .applet-preview {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    color: var(--global-secondary-TextColor);
  }
</style>
