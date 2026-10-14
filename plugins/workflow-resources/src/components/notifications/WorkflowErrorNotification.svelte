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
  import type { Status } from '@hcengineering/platform'
  import { Label, NotificationToast, StatusLabel, type Notification } from '@hcengineering/ui'
  import plugin from '../../plugin'
  import StatusRefs from './StatusRefs.svelte'
  import TaskRef from './TaskRef.svelte'

  export let notification: Notification
  export let onRemove: () => void

  let status: Status
  $: status = notification.params?.status as Status
  $: params = status.params ?? {}
  // Ids of the tasks, statuses and fields the server put into the error.
  $: refs = params.refs ?? {}
  $: statuses = [refs.statuses ?? []].flat()
  $: fields = refs.fields ?? []
</script>

<NotificationToast title={notification.title} severity={notification.severity} onClose={onRemove}>
  <svelte:fragment slot="title">
    {notification.title}
    {#if refs.task !== undefined}<TaskRef _id={refs.task} identifier={params.task} />{/if}
  </svelte:fragment>
  <svelte:fragment slot="content">
    {#if status.code === plugin.string.FieldRequiredError}
      <Label label={plugin.string.ToMoveToStatus} />
      <StatusRefs ids={[refs.to]} space={params.space} />
      <Label label={plugin.string.FillInFields} params={{ count: fields.length }} />
      {#each fields as field, i}{#if i > 0},{' '}{/if}<span class="field"><Label label={field} /></span>{/each}
    {:else if status.code === plugin.string.SubtaskStatusError}
      <Label label={plugin.string.SubtasksMustBeIn} params={{ count: statuses.length }} />
      <StatusRefs ids={statuses} space={params.space} />
    {:else if status.code === plugin.string.ParentStatusError}
      <Label label={plugin.string.ParentTask} />
      <TaskRef _id={refs.parent} identifier={params.parent} />
      <Label label={plugin.string.MustBeIn} params={{ count: statuses.length }} />
      <StatusRefs ids={statuses} space={params.space} />
    {:else}
      <StatusLabel {status} />
    {/if}
  </svelte:fragment>
</NotificationToast>

<style lang="scss">
  .field {
    font-weight: 600;
    white-space: nowrap;
  }
</style>
