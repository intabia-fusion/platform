<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import { onMount } from 'svelte'
  import { Tier } from '@hcengineering/billing'
  import { UsageStatus } from '@hcengineering/core'
  import { Label } from '@hcengineering/ui'
  import { getCurrentWorkspaceUuid } from '@hcengineering/presentation'
  import type { WorkspaceTokenWindows } from '@hcengineering/billing-client'
  import plugin from '../plugin'
  import UsageProgress from './UsageProgress.svelte'
  import { calculateLimits, getBillingClient } from '../utils'

  export let usage: UsageStatus | null
  export let tier: Tier | undefined

  $: storageUsedBytes = usage?.usage?.storageBytes ?? 0
  $: meetingMinutes = usage?.usage?.meetingMinutes ?? 0
  $: tokensUsage = usage?.usage?.tokens ?? 0
  $: limits = calculateLimits(tier)

  // Rolling AI-token windows (5h + week). Limits come from billing (fixed config);
  // only shown when a limit is configured (> 0).
  let windows: WorkspaceTokenWindows | undefined
  onMount(async () => {
    const client = getBillingClient()
    if (client === null) return
    try {
      windows = await client.getWorkspaceTokenWindows(getCurrentWorkspaceUuid())
    } catch {
      windows = undefined
    }
  })
</script>

<div class="flex-col flex-gap-2">
  <div class="fs-bold">
    <Label label={plugin.string.Usage} />
  </div>

  <UsageProgress label={plugin.string.StorageUsage} value={storageUsedBytes} limit={limits.storageLimit} />

  <UsageProgress
    label={plugin.string.MeetingMinutesUsage}
    value={meetingMinutes}
    limit={limits.meetingMinutesLimit}
    kind={'minutes'}
  />

  <UsageProgress label={plugin.string.TotalTokens} value={tokensUsage} limit={limits.tokenLimit} kind={'items'} />

  {#if windows !== undefined && windows.window5h.limit > 0}
    <UsageProgress
      label={plugin.string.TokenWindow5h}
      value={windows.window5h.used}
      limit={windows.window5h.limit}
      kind={'items'}
    />
  {/if}
  {#if windows !== undefined && windows.week.limit > 0}
    <UsageProgress
      label={plugin.string.TokenWindowWeek}
      value={windows.week.used}
      limit={windows.week.limit}
      kind={'items'}
    />
  {/if}
</div>
