<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { getClient, createQuery } from '@hcengineering/presentation'
  import notification, { type PushSubscription, type PushSubscriptionSetting } from '@hcengineering/notification'
  import core from '@hcengineering/core'
  import ModernToggle from '@hcengineering/ui/src/components/ModernToggle.svelte'
  import { Label } from '@hcengineering/ui'
  import { parseUserAgent } from '../../utils'

  let subscriptions: PushSubscription[] = []
  let settings: PushSubscriptionSetting[] = []

  const client = getClient()

  const subsQuery = createQuery()
  subsQuery.query(
    notification.class.PushSubscription,
    {},
    (result) => {
      subscriptions = result
    }
  )

  const settingsQuery = createQuery()
  settingsQuery.query(
    notification.class.PushSubscriptionSetting,
    {},
    (result) => {
      settings = result
    })

  $: getEnabled = (sub: PushSubscription): boolean => {
    const setting = settings.find(({ attachedTo }) => attachedTo === sub._id)
    return setting?.enabled ?? true
  }

  async function toggle (sub: PushSubscription): Promise<void> {
    const setting = settings.find(({ attachedTo }) => attachedTo === sub._id)
    const currentEnabled: boolean = setting !== undefined ? Boolean(setting.enabled) : true
    const enabled = !currentEnabled

    if (setting !== undefined) {
      await client.update(setting, { enabled })
    } else {
      await client.createDoc(notification.class.PushSubscriptionSetting, core.space.Workspace, {
        attachedTo: sub._id,
        enabled
      })
    }
  }
</script>

<div class="flex-col flex-gap-4">
  {#each subscriptions as subscription (subscription._id)}
  <div class="flex-row-top flex-gap-2">
    <div class="flex-col flex-gap-2 w-120">
      {#if subscription.name}
        <span class="label font-semi-bold">{parseUserAgent(subscription.name)}</span>
      {:else}
        <span class="label font-semi-bold"><Label label={notification.string.UnknownDevice} /></span>
      {/if}
      <span class="description">{new Date(subscription.createdOn ?? 0).toLocaleDateString()}</span>
    </div>
    <ModernToggle size="small" checked={getEnabled(subscription)} on:change={() => toggle(subscription)} />
  </div>
  {/each}
</div>

<style lang="scss">
  .label {
    color: var(--global-primary-TextColor);
  }
  .description {
    color: var(--global-secondary-TextColor);
  }
</style>
