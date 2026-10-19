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
  import core from '@hcengineering/core'
  import type { Ref, Status } from '@hcengineering/core'
  import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import type { ProjectType, TaskType } from '@hcengineering/task'
  import {
    createStatusesAtomic,
    getExistingStatusOptions,
    getProjectStatusRank,
    getProjectTypeStates,
    getStatusCategoryOrder,
    getStatusErrorText
  } from '@hcengineering/task'
  import { CheckBox, EditBox, Label, Modal } from '@hcengineering/ui'
  import { statusStore } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'
  import { taskTypeStore, typeStore } from '../..'
  import task from '../../plugin'
  import StatePresenter from './StatePresenter.svelte'

  export let type: ProjectType
  export let taskType: TaskType

  const client = getClient()
  const dispatch = createEventDispatcher()

  let search = ''
  let selected = new Set<Ref<Status>>()
  let busy = false
  let error: string | undefined

  $: currentType = $typeStore.get(type._id) ?? type
  $: currentTaskType = $taskTypeStore.get(taskType._id) ?? taskType
  // Project type order, as the icons and groups use it
  $: rank = getProjectStatusRank([currentType], $taskTypeStore)
  $: projectStatuses = [...getProjectTypeStates(currentType._id, $typeStore, $statusStore.byId)].sort(
    (a, b) => (rank.get(a._id) ?? rank.size) - (rank.get(b._id) ?? rank.size)
  )
  $: taskTypeStatuses = currentTaskType.statuses
    .map((it) => $statusStore.byId.get(it))
    .filter((it): it is Status => it !== undefined)
  $: groups = getExistingStatusOptions(projectStatuses, taskTypeStatuses, getStatusCategoryOrder())
    .map((group) => ({
      ...group,
      statuses: group.statuses.filter((it) => it.name.toLowerCase().includes(search.trim().toLowerCase()))
    }))
    .filter((group) => group.statuses.length > 0)

  function categoryLabel (category: Status['category']): IntlString {
    return client.getModel().findAllSync(core.class.StatusCategory, { _id: category })[0]?.label ?? getEmbeddedLabel('')
  }

  function toggle (id: Ref<Status>): void {
    const next = new Set(selected)
    if (!next.delete(id)) next.add(id)
    selected = next
  }

  // At the end of its category in the task type
  function place (list: Array<Ref<Status>>, id: Ref<Status>): Array<Ref<Status>> {
    const category = $statusStore.byId.get(id)?.category
    const states = list.map((it) => $statusStore.byId.get(it)).filter((it) => it !== undefined)
    const lastIndex = states.findLastIndex((it) => it.category === category)
    return [...list.slice(0, lastIndex + 1), id, ...list.slice(lastIndex + 1)]
  }

  async function save (): Promise<void> {
    busy = true
    error = undefined
    try {
      const items = [...selected]
        .map((id) => $statusStore.byId.get(id))
        .filter((it): it is Status => it !== undefined)
        .map((it) => ({
          id: it._id,
          attachExisting: true,
          data: { name: it.name, ofAttribute: it.ofAttribute, category: it.category }
        }))
      await createStatusesAtomic(client, type._id, currentTaskType.statusClass, items, {
        placements: [{ taskType: taskType._id, place }]
      })
      dispatch('close')
    } catch (err: any) {
      error = await getStatusErrorText(err)
    } finally {
      busy = false
    }
  }
</script>

<!-- Not Card: it closes when the action ends, and a failure has to stay on screen -->
<Modal
  type="type-popup"
  width="medium"
  label={task.string.AddExistingStatusTitle}
  okLabel={task.string.AddExistingStatusConfirm}
  okLoading={busy}
  canSave={selected.size > 0 && !busy}
  okAction={save}
  onCancel={() => {
    dispatch('close')
  }}
>
  <div class="flex-col flex-gap-2">
    {#if groups.length === 0 && search.trim() === ''}
      <Label label={task.string.AddExistingStatusEmpty} />
    {:else}
      <EditBox bind:value={search} placeholder={task.string.StatusName} kind="default" />
      {#each groups as group (group.category)}
        <span class="fs-bold" style="color: var(--global-secondary-TextColor)">
          <Label label={categoryLabel(group.category)} />
        </span>
        {#each group.statuses as status (status._id)}
          <button
            class="menu-item withList w-full flex-row-center flex-gap-2"
            style="justify-content: flex-start; text-align: left"
            on:click={() => {
              toggle(status._id)
            }}
          >
            <span class="flex-center pointer-events-none">
              <CheckBox checked={selected.has(status._id)} />
            </span>
            <StatePresenter value={status} projectType={type._id} />
          </button>
        {/each}
      {/each}
    {/if}
    {#if error !== undefined}
      <div style="color: var(--global-error-TextColor)">{error}</div>
    {/if}
  </div>
</Modal>
