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

<!-- A provider that delivers only what is still unread after a while (the letter): how long. -->
<script lang="ts">
  import core from '@hcengineering/core'
  import notification, { type NotificationProvider, type NotificationProviderSetting } from '@hcengineering/notification'
  import { getClient } from '@hcengineering/presentation'
  import { DropdownLabelsIntl, type DropdownIntlItem, Label } from '@hcengineering/ui'

  export let provider: NotificationProvider
  export let setting: NotificationProviderSetting | undefined
  export let enabled: boolean

  const client = getClient()
  const MINUTE = 60 * 1000
  const HOUR = 60 * MINUTE

  const items: DropdownIntlItem[] = [
    ...[10, 20, 30].map((minutes) => ({ id: minutes * MINUTE, label: notification.string.HoldMinutes, params: { minutes } })),
    ...[1, 4, 8, 12, 24].map((hours) => ({ id: hours * HOUR, label: notification.string.HoldHours, params: { hours } }))
  ]

  $: selected = setting?.holdMs ?? provider.holdMs ?? 0

  async function select (event: CustomEvent<DropdownIntlItem['id'] | undefined>): Promise<void> {
    const holdMs = event.detail
    if (typeof holdMs !== 'number' || holdMs === selected) return
    if (setting !== undefined) {
      await client.update(setting, { holdMs })
    } else {
      await client.createDoc(notification.class.NotificationProviderSetting, core.space.Workspace, {
        attachedTo: provider._id,
        enabled,
        holdMs
      })
    }
  }
</script>

{#if provider.holdMs !== undefined && enabled}
  <div class="flex-row-center flex-gap-2 mt-2">
    <span class="description">
      <Label label={notification.string.HoldLabel} />
    </span>
    <DropdownLabelsIntl {items} {selected} kind="regular" size="small" on:selected={select} />
  </div>
{/if}

<style lang="scss">
  .description {
    color: var(--global-secondary-TextColor);
  }
</style>
