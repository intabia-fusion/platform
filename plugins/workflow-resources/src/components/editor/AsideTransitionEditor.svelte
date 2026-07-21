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
  import { onDestroy } from 'svelte'
  import { Data, DocumentUpdate, Ref, Status } from '@hcengineering/core'
  import presentation, { createQuery, getClient, MessageBox } from '@hcengineering/presentation'
  import { clearSettingsStore } from '@hcengineering/setting-resources'
  import ui, {
    Label,
    Modal,
    showPopup,
    ModernDropdown,
    ModernDropdownLabels,
    ModernEditbox,
    ListItem,
    languageStore,
    type DropdownTextItem,
    ModernButton,
    IconError,
    Spinner
  } from '@hcengineering/ui'
  import {
    WorkflowTransition,
    removeTransition,
    Workflow,
    updateTransition,
    getTransitionConflict,
    ConflictInfo
  } from '@hcengineering/workflow'
  import { StatePresenter } from '@hcengineering/task-resources'
  import { translate } from '@hcengineering/platform'

  import plugin from '../../plugin'
  import ValidatorsNavGroup from './validators/ValidatorsNavGroup.svelte'

  export let workflow: Workflow
  export let _id: Ref<WorkflowTransition>
  export let transition: WorkflowTransition | undefined
  export let transitions: WorkflowTransition[] = []
  export let readonly: boolean
  export let statuses: Status[] = []

  const client = getClient()
  const transitionsQuery = createQuery()

  let name = ''
  let fromStatusItemIds: string[] | undefined = []
  let toStatusItem: ListItem | undefined = undefined
  let fromStatusItems: DropdownTextItem[] = []

  let isSaving = false
  let timer: any = null
  let savePromise: Promise<void> | null = null

  $: transitionsQuery.query(plugin.class.WorkflowTransition, { attachedTo: workflow._id }, (res) => {
    transitions = res
    transition = res.find((it) => it._id === _id)
  })

  $: void translate(plugin.string.AnyStatus, {}, $languageStore).then((it) => {
    fromStatusItems = [
      { label: it, id: 'null', exclusive: true },
      ...statuses.map((s) => ({
        id: s._id,
        label: s.name,
        icon: StatePresenter,
        iconProps: { value: s, shouldShowName: false }
      }))
    ]
  })

  $: toStatusItems = statuses.map((s) => ({
    _id: s._id,
    label: s.name,
    icon: StatePresenter,
    iconProps: { value: s, shouldShowName: false }
  }))

  let lastLoadedId: string | undefined = undefined

  $: if (
    transition != null &&
    transition._id !== lastLoadedId &&
    fromStatusItems.length > 0 &&
    toStatusItems.length > 0
  ) {
    lastLoadedId = transition._id
    name = transition.name ?? ''
    fromStatusItemIds = transition.from ?? ['null']
    toStatusItem = toStatusItems.find((it) => it._id === transition?.to)
  }

  $: isSelf = toStatusItem?._id != null && fromStatusItemIds != null && fromStatusItemIds.includes(toStatusItem._id)

  let conflictInfo: ConflictInfo | null = null
  $: {
    const fromVal = fromStatusItemIds?.includes('null') ? null : (fromStatusItemIds as Ref<Status>[])
    const toVal = toStatusItem?._id as Ref<Status>
    conflictInfo =
      toVal != null && fromStatusItemIds != null && fromStatusItemIds.length > 0
        ? getTransitionConflict({ _id, from: fromVal, to: toVal }, transitions)
        : null
  }

  function getFromStatus (ids: string[] | undefined): Ref<Status>[] | null {
    return ids == null || ids.includes('null') ? null : ((ids ?? []) as Ref<Status>[])
  }

  $: updatedData = {
    name: name.trim(),
    from: getFromStatus(fromStatusItemIds),
    to: toStatusItem?._id as Ref<Status> | undefined
  }

  function isTransitionFlowValid (
    to: Ref<Status> | undefined,
    fromItemIds: Ref<Status>[] | null | undefined,
    isSelfTransition: boolean,
    conflict: ConflictInfo | null
  ): boolean {
    const hasTargetStatus = to != null
    const hasSourceStatuses = fromItemIds === null || (Array.isArray(fromItemIds) && fromItemIds.length > 0)
    const isNotSelf = !isSelfTransition
    const hasNoConflicts = conflict == null

    return hasTargetStatus && hasSourceStatuses && isNotSelf && hasNoConflicts
  }

  function cloneData (data: Partial<Data<WorkflowTransition>>): Partial<Data<WorkflowTransition>> {
    return {
      name: data.name,
      from: data.from ? [...data.from] : data.from,
      to: data.to
    }
  }

  async function save (): Promise<void> {
    if (transition == null || readonly) return

    if (savePromise != null) {
      await savePromise
    }

    const data = cloneData(updatedData)

    const fromVal = data.from
    const toVal = data.to
    const isSelfTransition = toVal != null && fromVal != null && fromVal.includes(toVal)
    const conflict =
      toVal != null && fromVal != null && fromVal.length > 0
        ? getTransitionConflict({ _id, from: fromVal, to: toVal }, transitions)
        : null

    const isStatusesValid = isTransitionFlowValid(toVal, fromVal, isSelfTransition, conflict)

    const hasFromChanged = JSON.stringify(fromVal) !== JSON.stringify(transition.from)
    const hasToChanged = toVal != null && toVal !== transition.to
    const hasNameChanged = (data.name?.length ?? 0) > 0 && data.name !== transition.name

    const update: DocumentUpdate<WorkflowTransition> = {}

    if (hasNameChanged && data.name) {
      update.name = data.name
    }

    if (isStatusesValid) {
      if (hasFromChanged) update.from = fromVal
      if (hasToChanged && toVal) update.to = toVal
    }

    if (Object.keys(update).length === 0) return

    const currentPromise = (async () => {
      try {
        isSaving = true
        await updateTransition(client, workflow._id, transition._id, update)
      } catch (err) {
        console.error('Failed to auto-save transition:', err)
      } finally {
        isSaving = false
      }
    })()

    savePromise = currentPromise
    try {
      await currentPromise
    } finally {
      if (savePromise === currentPromise) {
        savePromise = null
      }
    }
  }

  function handleAutoSave (_: Partial<Data<WorkflowTransition>>): void {
    if (transition == null || transition._id !== lastLoadedId || readonly) return

    clearTimeout(timer)
    timer = setTimeout(() => {
      void save()
    }, 500)
  }

  $: handleAutoSave(updatedData)

  async function closeEditor (): Promise<void> {
    clearTimeout(timer)
    await save()
    clearSettingsStore()
  }

  async function handleRemove (): Promise<void> {
    showPopup(MessageBox, {
      label: plugin.string.DeleteWorkflowTransition,
      message: plugin.string.DeleteWorkflowTransitionConfirm,
      dangerous: true,
      action: async () => {
        await removeTransition(client, workflow._id, _id)
        clearSettingsStore()
      }
    })
  }

  onDestroy(() => {
    clearTimeout(timer)
  })
</script>

<Modal
  type="type-aside"
  label={plugin.string.WorkflowTransition}
  labelProps={{ name: transition?.name ?? '' }}
  canSave={true}
  showCancelButton={false}
  okKind="secondary"
  okAction={closeEditor}
  on:close={closeEditor}
>
  <div class="flex-column flex-gap-4 p-8">
    <div class="row">
      <span class="label"> <Label label={plugin.string.Name} /></span>
      <ModernEditbox
        bind:value={name}
        label={plugin.string.Name}
        kind="ghost"
        autoFocus={false}
        width="100%"
        disabled={readonly}
        style="padding:0"
        on:blur={() => {
          clearTimeout(timer)
          void save()
        }}
      />
    </div>

    <div class="row" style="align-items: flex-start">
      <span class="label" style="margin-top: 0.625rem"> <Label label={plugin.string.From} /> </span>
      <ModernDropdownLabels
        items={fromStatusItems}
        bind:selected={fromStatusItemIds}
        multiselect={true}
        wrap={true}
        placeholder={ui.string.NotSelected}
        justify="left"
        width="100%"
        disabled={readonly}
      />
    </div>

    <div class="row">
      <span class="label"> <Label label={plugin.string.To} /></span>
      <ModernDropdown
        items={toStatusItems}
        bind:selected={toStatusItem}
        placeholder={ui.string.NotSelected}
        icon={StatePresenter}
        justify="left"
        width="100%"
        disabled={readonly}
        showCheckmark={true}
      />
    </div>

    {#if isSelf}
      <div class="error-row">
        <div class="error-icon">
          <IconError size="small" />
        </div>
        <span class="error-text">
          <Label
            label={plugin.string.SelfTransitionError}
            params={{
              to: toStatusItem?.label ?? ''
            }}
          />
        </span>
      </div>
    {:else if conflictInfo != null}
      {@const fromItem = fromStatusItems.find((item) => item.id === conflictInfo?.status)}
      <div class="error-row">
        <div class="error-icon">
          <IconError size="small" />
        </div>
        <span class="error-text">
          <Label
            label={plugin.string.TransitionConflictError}
            params={{
              to: toStatusItem?.label ?? '',
              from: fromItem?.label ?? '',
              transition: conflictInfo.transition.name
            }}
          />
        </span>
      </div>
    {/if}
  </div>
  <span class="separator" />

  {#if transition}
    <ValidatorsNavGroup {workflow} {transitions} {statuses} {transition} />
  {/if}
  <div slot="footer" class="footer-row flex-row-center w-full justify-between">
    <div class="footer-left">
      {#if !readonly}
        <ModernButton label={presentation.string.Remove} size="large" kind="secondary" on:click={handleRemove} />
      {/if}
    </div>
    <div class="footer-right flex-row-center flex-gap-2">
      {#if isSaving}
        <div class="save-indicator">
          <Spinner size="small" />
          <span class="save-status-text"><Label label={presentation.string.Saving} /></span>
        </div>
      {/if}
    </div>
  </div>
</Modal>

<style lang="scss">
  :global(.hulyNavGroup-container .hulyNavGroup-header) {
    padding: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 2.5rem;
  }
  .label {
    text-transform: uppercase;
    font-weight: 500;
    font-size: 0.75rem;
    font-style: normal;
    line-height: 1rem;
    color: var(--global-secondary-TextColor);
    min-width: 3rem;
  }

  .footer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .footer-left {
    display: flex;
    align-items: center;
  }

  .footer-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }

  .save-indicator {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--global-tertiary-TextColor);
    min-height: 1.5rem;
  }

  .save-status-text {
    color: var(--global-tertiary-TextColor);
    font-size: 0.625rem;
    text-transform: uppercase;
    font-weight: 600;
  }

  .error-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    color: var(--negative-button-default);
    font-size: 0.8125rem;
    line-height: 1.125rem;
    margin-top: 1rem;
    min-width: 0;
    word-break: break-word;
    overflow-wrap: anywhere;

    .error-icon {
      display: flex;
      align-items: center;
      margin-top: 0.0625rem;
      flex-shrink: 0;
    }

    .error-text {
      color: var(--negative-button-default);
      word-break: break-word;
      overflow-wrap: anywhere;
      min-width: 0;
    }
  }

  .separator {
    padding: 0.75rem 0;
    margin-left: -0.75rem;
    height: 1px;
    width: calc(100% + 1.5rem);
    border-bottom: 1px solid var(--global-subtle-ui-BorderColor);
  }
</style>
