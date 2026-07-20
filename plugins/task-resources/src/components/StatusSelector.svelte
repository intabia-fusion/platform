<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import { Class, IdMap, Ref, Status } from '@hcengineering/core'
  import { IntlString } from '@hcengineering/platform'
  import { DocPopup, getClient } from '@hcengineering/presentation'
  import { Task, TaskType } from '@hcengineering/task'
  import { getObjectId, ObjectPresenter, statusStore } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'
  import { taskTypeStore } from '..'

  export let value: Task | Task[]
  export let width: 'medium' | 'large' | 'full' = 'medium'
  export let placeholder: IntlString
  export let _class: Ref<Class<Status>>
  export let embedded: boolean = false

  const dispatch = createEventDispatcher()
  const client = getClient()

  async function getAnalyticsIds (docs: Task[]): Promise<string[]> {
    const result: string[] = []

    for (const doc of docs) {
      const id = await getObjectId(doc, client.getHierarchy())
      result.push(id)
    }
    return result
  }

  $: current = Array.isArray(value)
    ? value.every((v) => v.status === (value as Array<Task>)[0].status)
      ? value[0].status
      : undefined
    : value.status

  $: kind = Array.isArray(value)
    ? value.every((v) => v.kind === (value as Array<Task>)[0].kind)
      ? value[0].kind
      : undefined
    : value.kind

  function updateStatuses (taskTypes: IdMap<TaskType>, store: IdMap<Status>, kind: Ref<TaskType> | undefined): void {
    if (kind === undefined) {
      statuses = []
    } else {
      const type = taskTypes.get(kind)
      if (type !== undefined) {
        statuses = type.statuses.map((p) => store.get(p)).filter((p) => p !== undefined)
      }
    }
  }

  $: updateStatuses($taskTypeStore, $statusStore.byId, kind)

  let statuses: Status[] = []
  let searchQuery: string = ''
  $: filteredStatuses = !searchQuery
    ? statuses
    : statuses.filter((status) => (status.name ?? '').toLowerCase().includes(searchQuery.toLowerCase()))
</script>

<DocPopup
  {_class}
  objects={filteredStatuses}
  allowDeselect={true}
  selected={current}
  on:close={(evt) => {
    const raw = evt.detail
    const statusId = typeof raw === 'string' ? raw : raw?._id
    dispatch('close', statusId)

    if (typeof statusId === 'string') {
      const docs = Array.isArray(value) ? value : [value]
      if (docs.length > 0) {
        void (async () => {
          try {
            const ops = client.apply(undefined, 'set-status')
            for (const it of docs) {
              if (it.status !== statusId) {
                // @ts-expect-error: runtime string safely matches Ref<Status>
                await ops.update(it, { status: statusId })
              }
            }
            await ops.commit()
          } catch (error) {
            console.error(error)
          }
        })()
      }

      void getAnalyticsIds(docs).then((ids) => {
        Analytics.handleEvent('task.SetStatus', { status: statusId, objects: ids })
      })
    }
  }}
  {placeholder}
  {width}
  {embedded}
  on:changeContent
  on:search={(e) => (searchQuery = e.detail)}
>
  <svelte:fragment slot="item" let:item>
    <div class="flex-row-center flex-grow overflow-label">
      <ObjectPresenter
        objectId={item._id}
        _class={item._class}
        value={item}
        inline={false}
        noUnderline
        props={{
          disabled: true,
          inline: false,
          size: 'small',
          avatarSize: 'smaller',
          taskType: kind,
          projectType: kind !== undefined ? $taskTypeStore.get(kind)?.parent : undefined
        }}
      />
    </div>
  </svelte:fragment>
</DocPopup>
