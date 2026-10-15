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
  import { isOwnerOrMaintainer } from '@hcengineering/core'
  import type { Ref, Status } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import task, { type ProjectType } from '@hcengineering/task'
  import { Label } from '@hcengineering/ui'
  import { FixedColumn } from '@hcengineering/view-resources'
  import { taskTypeStore } from '../..'
  import plugin from '../../plugin'
  import { getStatusUsage } from '../../statusMergeApi'
  import { loadWorkflowUsage, type StatusWorkflowRef } from '../../statusUsage'
  import { openTaskTypeSettings, openWorkflowSettings } from '../../utils'

  export let type: ProjectType
  export let statusId: Ref<Status> | undefined

  const client = getClient()

  $: projectTaskTypes = [...$taskTypeStore.values()].filter((it) => it.parent === type._id)
  $: usedBy = projectTaskTypes
    .filter((it) => statusId !== undefined && it.statuses.includes(statusId))
    .sort((a, b) => a.name.localeCompare(b.name))

  let counts = new Map<string, number>()
  let workflows: StatusWorkflowRef[] = []
  // A slow answer for a previous status must not replace the current one
  let requested: Ref<Status> | undefined

  // The server counts every space; a client query sees only the spaces the user is a member of
  async function countByTaskType (id: Ref<Status>): Promise<Map<string, number>> {
    if (isOwnerOrMaintainer()) {
      try {
        return new Map(Object.entries((await getStatusUsage({ projectType: type._id, status: id })).byKind))
      } catch {
        // The failed request is shown by the pipeline; the visible counts below stand in
      }
    }
    const kinds = projectTaskTypes.map((it) => it._id)
    const totals = await Promise.all(
      kinds.map(async (kind) => {
        const found = await client.findAll(task.class.Task, { status: id, kind }, { limit: 1, total: true })
        return found.total
      })
    )
    return new Map(kinds.map((kind, i) => [kind, totals[i]]))
  }

  async function load (id: Ref<Status> | undefined): Promise<void> {
    requested = id
    if (id === undefined) {
      counts = new Map()
      workflows = []
      return
    }
    const byKind = await countByTaskType(id)
    const used = (await loadWorkflowUsage(client, type._id, projectTaskTypes)).get(id) ?? []
    if (requested !== id) return
    counts = byKind
    workflows = used
  }
  $: void load(statusId)
</script>

<div class="hulyModal-content__settingsSet table">
  <div class="hulyTableAttr-container">
    <div class="hulyTableAttr-header font-medium-12">
      <span><Label label={plugin.string.TaskTypes} /></span>
      <FixedColumn key="status-usage-tasks" justify="right"><Label label={plugin.string.Tasks} /></FixedColumn>
    </div>
    <div class="hulyTableAttr-content workflow">
      {#each usedBy as taskType (taskType._id)}
        <button
          class="hulyTableAttr-content__row"
          on:click={() => {
            openTaskTypeSettings(taskType._id)
          }}
        >
          <span class="hulyTableAttr-content__row-label grow">{taskType.name}</span>
          <FixedColumn key="status-usage-tasks" justify="right">
            <span class="font-medium-14">{counts.get(taskType._id) ?? 0}</span>
          </FixedColumn>
        </button>
      {:else}
        <div class="hulyTableAttr-content__row disableMouseOver">
          <span class="hulyTableAttr-content__row-label grow dark"><Label label={plugin.string.StatusUsageNone} /></span
          >
        </div>
      {/each}
    </div>
  </div>
</div>
<div class="hulyModal-content__settingsSet table">
  <div class="hulyTableAttr-container">
    <div class="hulyTableAttr-header font-medium-12">
      <span><Label label={plugin.string.StatusesColumnWorkflows} /></span>
    </div>
    <div class="hulyTableAttr-content workflow">
      {#each workflows as wf (wf.id)}
        <button
          class="hulyTableAttr-content__row"
          on:click={() => {
            openWorkflowSettings(wf.id)
          }}
        >
          <span class="hulyTableAttr-content__row-label grow">{wf.name}</span>
        </button>
      {:else}
        <div class="hulyTableAttr-content__row disableMouseOver">
          <span class="hulyTableAttr-content__row-label grow dark"><Label label={plugin.string.StatusUsageNone} /></span
          >
        </div>
      {/each}
    </div>
  </div>
</div>
