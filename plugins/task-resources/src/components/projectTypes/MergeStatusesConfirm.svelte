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
  import type { Status } from '@hcengineering/core'
  import type { MergeStatusesResult, ProjectType, TaskType } from '@hcengineering/task'
  import { Label, Modal } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import task from '../../plugin'
  import { mergeStatuses } from '../../statusMergeApi'
  import MergeStatusesDetails from './MergeStatusesDetails.svelte'

  export let type: ProjectType
  export let sources: Status[]
  export let target: Status
  export let taskTypes: TaskType[]
  export let transfer: boolean = false
  export let origin: 'merge' | 'delete' = 'merge'

  const dispatch = createEventDispatcher()

  let merging = false
  let conflicts: MergeStatusesResult['conflicts'] = []
  let failure: string | undefined

  $: quoted = sources.map((it) => `"${it.name}"`).join(', ')

  async function merge (): Promise<void> {
    merging = true
    conflicts = []
    failure = undefined
    try {
      const res = await mergeStatuses({
        projectType: type._id,
        target: target._id,
        sources: sources.map((it) => it._id),
        ...(transfer ? { transfer } : {})
      })
      if (res.ok) {
        dispatch('close', true)
      } else {
        conflicts = res.conflicts
      }
    } catch (err: any) {
      failure = err?.message ?? String(err)
    } finally {
      merging = false
    }
  }
</script>

<Modal
  type="type-popup"
  label={origin === 'delete' ? task.string.StatusDelete : task.string.MergeStatusesTitle}
  okLabel={origin === 'delete' ? task.string.Delete : task.string.MergeStatuses}
  okKind="negative"
  okLoading={merging}
  canSave={!merging}
  okAction={merge}
  onCancel={() => {
    dispatch('close')
  }}
>
  <div class="flex-col flex-gap-2">
    <Label label={task.string.MergeConfirmNote} params={{ sources: quoted }} />
    <MergeStatusesDetails {type} {sources} {target} {taskTypes} {conflicts} />
    {#if failure !== undefined}
      <div style="color: var(--global-error-TextColor)">{failure}</div>
    {/if}
  </div>
</Modal>
