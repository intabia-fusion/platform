<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import type { Attribute, Class, Ref, Status, StatusCategory } from '@hcengineering/core'
  import core from '@hcengineering/core'
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { translate } from '@hcengineering/platform'
  import presentation, { IconWithEmoji, getClient } from '@hcengineering/presentation'
  import { clearSettingsStore, settingsStore } from '@hcengineering/setting-resources'
  import type { MergeStatusesResult, ProjectType, TaskType } from '@hcengineering/task'
  import {
    calculateStatuses,
    createStatusAtomic,
    getProjectTypeStates,
    canRenameStatusInPlace,
    getStatusErrorText,
    getStatusNameBlock,
    resolveStatusReuse
  } from '@hcengineering/task'
  import ui, {
    Component,
    Button,
    Icon,
    Label,
    Modal,
    ModernEditbox,
    TextArea,
    closePopup,
    type DropdownIntlItem,
    fromCodePoint,
    getPlatformColorDef,
    showPopup,
    themeStore
  } from '@hcengineering/ui'
  import { IconButton, MenuButton } from '@hcengineering/ui/kit'
  import { ColorsPopup, statusStore } from '@hcengineering/view-resources'
  import view from '@hcengineering/view-resources/src/plugin'
  import emojiPlugin from '@hcengineering/emoji'
  import { get } from 'svelte/store'

  import { taskTypeStore, typeStore } from '../..'
  import task from '../../plugin'
  import { confirmStatusMerge } from '../../statusMergeFlow'
  import { getStatusUsage, loadStatusTaskCount, mergeStatuses } from '../../statusMergeApi'
  import { deleteProjectTypeStatus } from '../../statusDelete'
  import { renameStatusByMerge } from '../../statusRename'
  import MergeConflicts from '../projectTypes/MergeConflicts.svelte'
  import ApproveStatusRenamePopup from './ApproveStatusRenamePopup.svelte'
  import DeleteStateConfirmationPopup from './DeleteStateConfirmationPopup.svelte'
  import StatusUsageTables from './StatusUsageTables.svelte'

  export let status: Status | undefined = undefined
  export let _class: Ref<Class<Status>> | undefined = status?._class
  // Absent: project type mode, the status belongs to the whole project type
  export let taskType: TaskType | undefined = undefined
  export let type: ProjectType
  export let ofAttribute: Ref<Attribute<Status>>
  export let category: Ref<StatusCategory> | undefined = status?.category
  export let value: string
  export let valuePattern: string | undefined = ''
  export let color: number | number[] | undefined = undefined
  export let icons: Asset[]
  export let iconWithEmoji: Asset = view.ids.IconWithEmoji
  export let icon: Asset | undefined
  export let canDelete: boolean = true
  export let selectableStates: Status[] = []
  export let readonly: boolean = true
  // Rename applies to every task type of the project type that uses the status (project type settings section)
  export let applyToAllTaskTypes: boolean = false

  value = status?.name ?? valuePattern ?? ''

  // Same id StatesProjectEditor opens us with: a slow rename may finish after another status was
  // opened, and must not close that one.
  const openedId = status?._id ?? '#'
  function closeIfStillOpen (): void {
    if (get(settingsStore).id === openedId) {
      clearSettingsStore()
    }
  }

  const client = getClient()

  let description: string | undefined

  $: projectMode = taskType === undefined
  $: _taskType = taskType !== undefined ? ($taskTypeStore.get(taskType._id) as TaskType) : undefined
  $: _typeId = type._id
  $: _type = $typeStore.get(_typeId) as ProjectType
  $: projectStatus = _type.statuses.find((s) => s._id === status?._id)
  $: finalColor = projectStatus?.color ?? status?.color
  $: finalDescription = projectStatus?.description ?? status?.description
  $: allowEditCategory = status === undefined

  $: if (_typeId !== undefined) {
    description = finalDescription
  }

  $: affectedTaskTypes =
    (applyToAllTaskTypes || projectMode) && status !== undefined
      ? [...$taskTypeStore.values()].filter(
          (tt) => tt.parent === _typeId && tt.statuses.includes(status?._id as Ref<Status>)
        )
      : _taskType !== undefined
        ? [_taskType]
        : []

  let total: number = 0
  let totalLoaded: Promise<void> = Promise.resolve()
  let loadSeq = 0

  $: if (status?._id !== undefined) {
    totalLoaded = loadTotal(status._id, projectMode ? _type.tasks : affectedTaskTypes.map((it) => it._id))
  } else {
    loadSeq++
    totalLoaded = Promise.resolve()
    total = 0
  }

  async function loadTotal (id: Ref<Status>, kinds: Array<Ref<TaskType>>): Promise<void> {
    const seq = ++loadSeq
    const count = await loadStatusTaskCount({ projectType: _typeId, status: id }, kinds, async () => {
      const found = await client.findAll(
        task.class.Task,
        { status: id, kind: { $in: kinds } },
        { limit: 1, total: true }
      )
      return found.total
    })
    if (seq === loadSeq) total = count
  }

  $: projectStatuses = getProjectTypeStates(_typeId, $typeStore, $statusStore.byId)
  $: nameChanged = status?.name.trim() !== value.trim()
  $: reuse = resolveStatusReuse(projectStatuses, { ofAttribute, name: value, category }, status?._id)
  $: existingCategory =
    reuse.action === 'create'
      ? undefined
      : client.getModel().findAllSync(core.class.StatusCategory, { _id: reuse.status.category })[0]?.label
  let existingCategoryName = ''
  $: if (existingCategory !== undefined) {
    void translate(existingCategory, {}, $themeStore.language).then((res) => {
      existingCategoryName = res
    })
  }
  $: reuseHint =
    reuse.action === 'reuse' && status?.name.trim() !== value.trim() && value.trim() !== '' && nameError === undefined
  $: usageStatusId = reuse.action === 'reuse' && reuseHint ? (reuse.status._id as Ref<Status>) : status?._id
  $: nameError = getNameError(nameChanged, value, reuse, affectedTaskTypes, total, existingCategoryName)

  // The error text and its parameters: it names the status that blocks the new name
  function getNameError (
    changed: boolean,
    name: string,
    found: typeof reuse,
    taskTypes: TaskType[],
    tasks: number,
    foundCategory: string
  ): { label: IntlString, params: Record<string, any>, mergeWith?: Status } | undefined {
    if (!changed || name.trim() === '' || found.action === 'create') return undefined
    const params = { name: found.status.name, category: foundCategory }
    const block = getStatusNameBlock(found, taskTypes, tasks)
    if (block === 'conflict') return { label: task.string.StatusNameCategoryConflict, params }
    if (block === 'exists') return { label: task.string.StatusNameAlreadyExists, params }
    if (block === 'duplicateWithTasks') {
      return { label: task.string.StatusNameExistsMerge, params, mergeWith: found.status as Status }
    }
    return undefined
  }

  function mergeWithExisting (existing: Status): void {
    if (status === undefined) return
    // The target is known, so only the confirmation step is shown
    confirmStatusMerge(
      _type,
      [status],
      existing,
      [...$taskTypeStore.values()].filter((tt) => tt.parent === _typeId),
      clearSettingsStore
    )
  }

  // The Status itself is renamed when only this project type can see it and no other status has the name:
  // no new Status, no task updates
  $: renameInPlace =
    status !== undefined && nameChanged && canRenameStatusInPlace(status, reuse, _typeId, $typeStore.values())

  $: needUpdate =
    (nameChanged || description !== finalDescription || color !== finalColor) &&
    value.trim() !== '' &&
    nameError === undefined

  async function save (): Promise<void> {
    if (readonly) return
    // The decision below needs the count of the current status and kinds
    await totalLoaded
    if (total > 0 && value.trim() !== status?.name?.trim() && !renameInPlace) {
      // We should ask for changes approve.
      showPopup(
        ApproveStatusRenamePopup,
        {
          object: status,
          total,
          okAction: async () => {
            await performSave()
            closePopup()
          },
          label: task.string.RenameStatus
        },
        undefined
      )
    } else {
      await performSave()
    }
  }

  let saveError: string | undefined
  // Why the server refused the merge behind a rename or a delete
  let saveConflicts: MergeStatusesResult['conflicts'] = []

  async function performSave (): Promise<void> {
    saveError = undefined
    saveConflicts = []
    try {
      await performSaveUnsafe()
    } catch (err: any) {
      saveError = await getStatusErrorText(err)
    }
  }

  async function performSaveUnsafe (): Promise<void> {
    if ((_taskType === undefined && !projectMode) || _class === undefined) return
    if (status === undefined) {
      const placeNew = (list: Array<Ref<Status>>, id: Ref<Status>): Array<Ref<Status>> => {
        const states = list.map((p) => $statusStore.byId.get(p)).filter((p) => p !== undefined)
        const lastIndex = states.findLastIndex((p) => p.category === category)
        return [...list.slice(0, lastIndex + 1), id, ...list.slice(lastIndex + 1)]
      }
      const { id: _id } = await createStatusAtomic(
        client,
        _typeId,
        _class,
        { ofAttribute, name: value.trim(), category, color, description },
        _taskType !== undefined ? [{ taskType: _taskType._id, place: placeNew }] : [],
        icon
      )
      if (_taskType !== undefined) _taskType.statuses = placeNew(_taskType.statuses, _id)
      status = await client.findOne(_class, { _id })
    } else if (needUpdate && (!nameChanged || renameInPlace)) {
      // Name, color, icon or description changed in place: a new Status would duplicate this one
      const id = status._id
      if (renameInPlace) {
        await client.update(status, { name: value.trim() })
      }
      const entries = _type.statuses.some((it) => it._id === id)
        ? _type.statuses.map((it) => (it._id === id ? { ...it, color, icon, description } : it))
        : [
            ..._type.statuses,
            { _id: id, color, icon, description, ...(_taskType !== undefined ? { taskType: _taskType._id } : {}) }
          ]
      await client.update(_type, {
        statuses: calculateStatuses({ statuses: entries, tasks: _type.tasks }, $taskTypeStore, [])
      })
    } else if (needUpdate) {
      const oldStatus = status._id
      const targets =
        applyToAllTaskTypes || projectMode ? affectedTaskTypes : _taskType !== undefined ? [_taskType] : []
      const data = { ofAttribute, name: value.trim(), category, color, description }
      let _id: Ref<Status>
      if (targets.length > 0) {
        const res = await renameStatusByMerge(
          client,
          { merge: mergeStatuses, usage: getStatusUsage },
          { type: _typeId, status: oldStatus, statusClass: _class, data, icon, taskTypes: targets.map((it) => it._id) }
        )
        if (!res.ok) {
          saveConflicts = res.conflicts
          return
        }
        _id = res.id
      } else {
        // No task type to swap in: the entry of the old status is replaced in the project type itself
        const created = await createStatusAtomic(client, _typeId, _class, data, [], icon, { exclude: oldStatus })
        _id = created.id
        const current = await client.findOne(task.class.ProjectType, { _id: _typeId })
        if (current !== undefined) {
          await client.update(current, {
            statuses: current.statuses.filter((it) => it._id !== oldStatus),
            ...(current.statusOrder !== undefined
              ? { statusOrder: current.statusOrder.map((it) => (it === oldStatus ? _id : it)) }
              : {})
          })
        }
      }
      status = await client.findOne(_class, { _id })
    }

    if (_taskType === undefined) {
      closeIfStillOpen()
      return
    }
    const sameCategory = _taskType.statuses
      .map((it) => $statusStore.byId.get(it))
      .filter((it) => it !== undefined)
      .filter((it) => it?.category === status?.category)
      .filter((it, idx, arr) => arr.findIndex((qt) => qt._id === it._id) === idx)

    canDelete = sameCategory.length > 1
    selectableStates = sameCategory.filter((it) => it._id !== status?._id)
    closeIfStillOpen()
  }

  let selected: 'color' | 'emoji' = icon === iconWithEmoji ? 'emoji' : 'color'
  const items: Array<DropdownIntlItem<'color' | 'emoji'>> = [
    {
      id: 'color',
      label: task.string.Color
    },
    {
      id: 'emoji',
      label: view.string.EmojiCategory
    }
  ]

  $: categoryIds = _taskType?.statusCategories ?? [
    ...new Set([...$taskTypeStore.values()].filter((it) => it.parent === _typeId).flatMap((it) => it.statusCategories))
  ]
  $: allCategories = getClient()
    .getModel()
    .findAllSync(core.class.StatusCategory, { _id: { $in: categoryIds } })

  $: categories = allCategories.map((it) => ({
    id: it._id,
    label: it.label,
    icon: it.icon
  }))

  function onDelete (): void {
    if (status === undefined || readonly) return
    const estatus = status
    const tt = _taskType
    if (tt === undefined) {
      void deleteProjectTypeStatus(_type, estatus, closeIfStillOpen)
      return
    }
    showPopup(
      DeleteStateConfirmationPopup,
      {
        object: estatus,
        selectableStates,
        taskType: tt,
        deleteAction: async (newStatus?: Status) => {
          if (newStatus === undefined) return
          saveError = undefined
          saveConflicts = []
          // Only this task type moves to the other status, on the server
          const res = await mergeStatuses({
            projectType: _type._id,
            target: newStatus._id,
            sources: [estatus._id],
            taskTypes: [tt._id]
          })
          if (!res.ok) {
            saveConflicts = res.conflicts
            return
          }
          closePopup()
          closeIfStillOpen()
        }
      },
      undefined
    )
  }

  function onDuplicate (): void {
    if (readonly) return
    let pattern = ''
    let inc = 2

    let prefix = value
    const g = value.match(/- ([0-9]+)/g)
    if (g != null) {
      prefix = value.split(g[0])[0].trim()
    }

    while (true) {
      pattern = prefix + ' - ' + (selectableStates.length + inc)
      if (selectableStates.some((it) => it.name === pattern) || status?.name === pattern) {
        // Duplicate
        inc++
      } else {
        break
      }
    }

    $settingsStore = {
      id: '#',
      component: task.component.CreateStatePopup,
      props: {
        status: undefined,
        taskType: _taskType,
        _class,
        category,
        type: _type,
        ofAttribute,
        icon,
        color,
        icons,
        valuePattern: pattern,
        readonly
      }
    }
  }
</script>

<Modal
  label={status === undefined ? task.string.StatusCreateTitle : task.string.StatusPopupTitle}
  type="type-aside"
  okLabel={status === undefined ? presentation.string.Create : presentation.string.Save}
  okAction={save}
  canSave={needUpdate && !readonly}
  onCancel={() => {
    clearSettingsStore()
  }}
>
  <svelte:fragment slot="actions">
    {#if !readonly}
      <IconButton
        icon={ui.icon.Trash}
        size="small"
        kind="tertiary"
        disabled={status === undefined || !(canDelete || projectMode) || readonly}
        tooltip={{ label: presentation.string.Delete }}
        on:click={onDelete}
      />
      <IconButton
        icon={ui.icon.Copy}
        size="small"
        kind="tertiary"
        disabled={status === undefined || readonly}
        tooltip={{ label: presentation.string.Copy }}
        on:click={onDuplicate}
      />
    {/if}
  </svelte:fragment>
  <div class="hulyModal-content__titleGroup">
    <ModernEditbox bind:value label={task.string.StatusName} size="large" kind="ghost" disabled={readonly} />
    {#if saveError !== undefined}
      <div class="name-error">
        <div class="name-error-text">
          <Icon icon={ui.icon.ExclamationCircle} size="small" fill="var(--theme-error-color)" />
          <span><Label label={task.string.StatusSaveFailed} params={{ reason: saveError }} /></span>
        </div>
      </div>
    {/if}
    {#if saveConflicts.length > 0}
      <div class="name-error">
        <div class="name-error-text">
          <Icon icon={ui.icon.ExclamationCircle} size="small" fill="var(--theme-error-color)" />
          <span><Label label={task.string.StatusChangeRefused} /></span>
        </div>
        <MergeConflicts conflicts={saveConflicts} />
      </div>
    {/if}
    {#if nameError !== undefined}
      <div class="name-error">
        <div class="name-error-text">
          <Icon icon={ui.icon.ExclamationCircle} size="small" fill="var(--theme-error-color)" />
          <span><Label label={nameError.label} params={nameError.params} /></span>
        </div>
        {#if nameError.mergeWith !== undefined && !readonly}
          <Button
            kind="regular"
            size="small"
            label={task.string.MergeStatuses}
            on:click={() => {
              if (nameError?.mergeWith !== undefined) mergeWithExisting(nameError.mergeWith)
            }}
          />
        {/if}
      </div>
    {/if}
    <TextArea
      placeholder={task.string.Description}
      width="100%"
      height="4.5rem"
      margin="var(--spacing-1) var(--spacing-2)"
      noFocusBorder
      disabled={readonly}
      bind:value={description}
    />
  </div>
  <div class="hulyModal-content__settingsSet">
    <div class="hulyModal-content__settingsSet-line">
      <span class="label"><Label label={task.string.StatusCategory} /></span>
      <MenuButton
        items={categories}
        selected={category}
        disabled={!allowEditCategory || readonly}
        icon={categories.find((it) => it.id === category)?.icon}
        label={categories.find((it) => it.id === category)?.label}
        kind="secondary"
        size="medium"
        on:selected={(it) => {
          category = it.detail
        }}
      />
    </div>
  </div>
  <div class="hulyModal-content__settingsSet table">
    <div class="hulyTableAttr-container">
      <div class="hulyTableAttr-header font-medium-12 withButton">
        <MenuButton
          {items}
          {selected}
          icon={ui.icon.Sliders}
          label={items.find((it) => it.id === selected)?.label}
          kind="secondary"
          size="small"
          disabled={readonly}
          on:selected={(event) => {
            selected = event.detail
            if (selected === 'emoji') {
              icon = undefined
            }
          }}
        />
        {#if icon === iconWithEmoji}
          <IconWithEmoji icon={color ?? 0} size="medium" />
        {/if}
      </div>
      <div class="hulyTableAttr-content">
        {#if selected === 'color'}
          <ColorsPopup
            selected={getPlatformColorDef(color ?? 0, $themeStore.dark).name}
            embedded
            disabled={readonly}
            columns="auto"
            on:close={(evt) => {
              if (readonly) return
              color = evt.detail
              icon = undefined
            }}
          />
        {:else}
          <Component
            is={emojiPlugin.component.EmojiPopup}
            disabled={readonly}
            props={{
              selected: Array.isArray(color) ? fromCodePoint(...color) : color ? fromCodePoint(color) : undefined,
              kind: 'default'
            }}
            on:close={(evt) => {
              if (readonly) return
              color = evt.detail.codes
              icon = iconWithEmoji
            }}
          />
        {/if}
      </div>
    </div>
  </div>
  {#if reuseHint}
    <div class="reuse-hint"><Label label={task.string.StatusReuseHint} /></div>
  {/if}
  {#if usageStatusId !== undefined}
    <StatusUsageTables type={_type} statusId={usageStatusId} />
  {/if}
</Modal>

<style lang="scss">
  .name-error {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-2);
    margin: var(--spacing-2) var(--spacing-2) var(--spacing-2);
    font-size: 0.8125rem;
    color: var(--global-error-TextColor);
  }
  .reuse-hint {
    margin: var(--spacing-1) var(--spacing-2);
    font-size: 0.8125rem;
    color: var(--global-secondary-TextColor);
  }
  .name-error-text {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-1);

    :global(svg) {
      flex-shrink: 0;
    }
  }
</style>
