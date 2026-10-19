<script lang="ts">
  import { DeleteConfirmationPopup } from '@hcengineering/contact-resources'
  import type { Status } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import type { ProjectType, TaskType } from '@hcengineering/task'
  import task from '@hcengineering/task'
  import ui, { Button, eventToHTMLElement, Label } from '@hcengineering/ui'
  import { MenuButton } from '@hcengineering/ui/kit'
  import plugin from '../../plugin'
  import { loadStatusTaskCount } from '../../statusMergeApi'
  import { confirmStatusMerge, pickStatusForMerge } from '../../statusMergeFlow'
  import StatePresenter from './StatePresenter.svelte'

  export let object: Status
  // Delete from one task type; absent with `type`: delete from the whole project type
  export let taskType: TaskType | undefined = undefined
  export let deleteAction: (newStatus?: Status) => Promise<void>
  export let selectableStates: Status[] = []
  export let type: ProjectType | undefined = undefined
  export let taskTypes: TaskType[] = []
  export let tasks: number = 0
  // Projects of the project type that have the status as their default
  export let projects: number = 0
  export let workflows: number = 0
  export let transferDone: (() => void) | undefined = undefined

  const client = getClient()
  let total: number = 0

  $: if (taskType !== undefined) void loadTotal(taskType)

  async function loadTotal (tt: TaskType): Promise<void> {
    const count = await loadStatusTaskCount({ projectType: tt.parent, status: object._id }, [tt._id], async () => {
      const found = await client.findAll(
        task.class.Task,
        { status: object._id, kind: tt._id },
        { limit: 1, total: true }
      )
      return found.total
    })
    if (taskType?._id === tt._id) total = count
  }
  const items = selectableStates.map((it) => ({ id: it._id, label: getEmbeddedLabel(it.name) }))
  // The same category and name first: tasks keep their meaning, no category change
  const sameName = (it: Status): boolean => it.name.trim().toLowerCase() === object.name.trim().toLowerCase()
  const sameCategory = selectableStates.filter((it) => it.category === object.category)
  let selected = (sameCategory.find(sameName) ?? sameCategory[0] ?? selectableStates[0])?._id ?? ''

  $: selectedState = selectableStates.find((it) => it._id === selected)

  function pickTarget (ev: MouseEvent): void {
    if (type === undefined) return
    pickStatusForMerge(
      eventToHTMLElement(ev),
      type,
      selectableStates,
      taskTypes,
      'into',
      (id) => {
        selected = id
      },
      plugin.string.StatusDeleteTransferTo
    )
  }
  $: projectMode = type !== undefined
  // Tasks and transitions need a new status; the server moves them and deletes this one
  // A project default needs one too: the merge rewrites it
  $: transfer = projectMode && (tasks > 0 || projects > 0 || workflows > 0)

  async function confirm (): Promise<void> {
    if (type === undefined) {
      if (selectedState !== undefined) await deleteAction(selectedState)
    } else if (!transfer) {
      await deleteAction()
    } else if (selectedState !== undefined) {
      confirmStatusMerge(type, [object], selectedState, taskTypes, transferDone, { transfer: true, origin: 'delete' })
    }
  }
</script>

<DeleteConfirmationPopup
  {object}
  deleteAction={confirm}
  on:close
  skipCheck={projectMode}
  title={projectMode ? plugin.string.StatusDelete : undefined}
  confirmation={projectMode ? plugin.string.StatusDeleteConfirm : undefined}
  okLabel={projectMode ? plugin.string.Delete : undefined}
  cancelLabel={projectMode ? ui.string.Cancel : undefined}
  confirmationParams={projectMode ? {} : undefined}
  canDeleteExtra={projectMode ? !transfer || selectedState !== undefined : selectedState !== undefined}
>
  <svelte:fragment slot="object">
    <StatePresenter value={object} projectType={type?._id} />
  </svelte:fragment>
  <div class="flex-grow mt-4">
    {#if transfer}
      <div class="flex-grow justify-between">
        <span class="fs-title">
          <Label label={plugin.string.StatusDeleteInUse} params={{ tasks, workflows }} />
          {#if projects > 0}
            <Label label={plugin.string.StatusDeleteInUseProjects} params={{ projects }} />
          {/if}
        </span>
      </div>
      <div class="flex-grow justify-between mt-2">
        <span><Label label={plugin.string.StatusDeleteTransferTo} /></span>
        <Button kind="regular" size="medium" on:click={pickTarget}>
          <svelte:fragment slot="content">
            {#if selectedState !== undefined}
              <StatePresenter value={selectedState} projectType={type?._id} />
            {/if}
          </svelte:fragment>
        </Button>
      </div>
    {:else if projectMode}
      <span><Label label={plugin.string.StatusDeleteUnused} /></span>
    {:else if total > 0}
      <div class="flex-grow justify-between">
        <span class="fs-title">
          A status {object.name} is in use by {total} tasks.
        </span>
      </div>
      <div class="flex-grow justify-between mt-2">
        <span> A new status should be selected. </span>
        <MenuButton
          {items}
          {selected}
          label={getEmbeddedLabel(selectedState?.name ?? '')}
          kind="secondary"
          size="medium"
          on:selected={(it) => {
            selected = it.detail
          }}
        />
      </div>
    {:else}
      <span> It is safe to delete status, it is not used. </span>
    {/if}
  </div>
</DeleteConfirmationPopup>
