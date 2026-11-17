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
  import type { Ref, Status } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import presentation, { getClient } from '@hcengineering/presentation'
  import type { ProjectType, TaskType } from '@hcengineering/task'
  import { createStatusesAtomic, findStatusAttr, getStatusErrorText } from '@hcengineering/task'
  import { Label } from '@hcengineering/ui'
  import { Button, Chip } from '@hcengineering/ui/kit'
  import { statusStore } from '@hcengineering/view-resources'
  import plugin from '../../plugin'

  export let type: ProjectType
  export let taskType: TaskType
  export let ids: Array<Ref<Status>> = []
  export let disabled = true

  const client = getClient()
  let busy: Ref<Status> | undefined
  let error: string | undefined

  function canAdd (status: Status | undefined): boolean {
    if (status?.category === undefined || !taskType.statusCategories.includes(status.category)) return false
    const hierarchy = client.getHierarchy()
    return (
      status.ofAttribute === findStatusAttr(hierarchy, taskType.ofClass)._id &&
      hierarchy.isDerived(status._class, taskType.statusClass)
    )
  }

  async function add (status: Status): Promise<void> {
    if (disabled || busy !== undefined || !canAdd(status) || taskType.statuses.includes(status._id)) return
    busy = status._id
    error = undefined
    try {
      await createStatusesAtomic(
        client,
        type._id,
        taskType.statusClass,
        [
          {
            id: status._id,
            attachExisting: true,
            data: { name: status.name, ofAttribute: status.ofAttribute, category: status.category }
          }
        ],
        {
          placements: [
            {
              taskType: taskType._id,
              place: (list, id) => {
                const last = list.findLastIndex((item) => $statusStore.byId.get(item)?.category === status.category)
                return [...list.slice(0, last + 1), id, ...list.slice(last + 1)]
              }
            }
          ]
        }
      )
    } catch (err) {
      error = await getStatusErrorText(err)
    } finally {
      busy = undefined
    }
  }
</script>

{#if ids.length > 0}
  <div class="missing-statuses" data-id="missing-task-type-statuses">
    <span><Label label={plugin.string.StatusNotInTaskType} />:</span>
    {#each ids as id (id)}
      {@const status = $statusStore.byId.get(id)}
      <span class="missing-status" data-status-id={id}>
        <Chip label={getEmbeddedLabel(status?.name ?? id)} size="extra-small" kind="neutral" />
        {#if canAdd(status)}
          <Button
            kind="secondary"
            size="small"
            label={presentation.string.Add}
            data-id="add-missing-task-type-status"
            disabled={disabled || busy !== undefined}
            on:click={() => {
              if (status !== undefined) void add(status)
            }}
          />
        {/if}
      </span>
    {/each}
    {#if error !== undefined}<span role="alert">{error}</span>{/if}
  </div>
{/if}

<style lang="scss">
  .missing-statuses,
  .missing-status {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--spacing-1);
    min-width: 0;
  }
</style>
