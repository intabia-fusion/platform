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
  import { DocumentUpdate, Ref, Status } from '@hcengineering/core'
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
    LabelAndProps
  } from '@hcengineering/ui'
  import { WorkflowTransition, removeTransition, Workflow, updateTransition } from '@hcengineering/workflow'
  import { StatePresenter } from '@hcengineering/task-resources'
  import { translate } from '@hcengineering/platform'

  import plugin from '../../plugin'

  export let workflow: Workflow
  export let _id: Ref<WorkflowTransition>
  export let transition: WorkflowTransition | undefined
  export let readonly: boolean
  export let statuses: Status[] = []

  const client = getClient()
  const transitionQuery = createQuery()

  let name = ''
  let fromStatusItemIds: string[] | undefined = []
  let toStatusItem: ListItem | undefined = undefined
  let fromStatusItems: DropdownTextItem[] = []

  let isSaving = false

  $: transitionQuery.query(plugin.class.WorkflowTransition, { _id, attachedTo: workflow._id }, (res) => {
    transition = res.shift()
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

  async function save (): Promise<void> {
    if (transition == null) return
    try {
      isSaving = true
      const fromVal = fromStatusItemIds?.includes('null') ? null : (fromStatusItemIds as Ref<Status>[])
      const toVal = toStatusItem?._id as Ref<Status>

      const update: DocumentUpdate<WorkflowTransition> = {}
      const hasFromChanged = JSON.stringify(fromVal) !== JSON.stringify(transition.from)
      if (hasFromChanged) {
        update.from = fromVal
      }
      if (toVal != null && toVal !== transition.to) {
        update.to = toVal
      }
      if (name.trim() !== transition.name) {
        update.name = name
      }

      if (Object.keys(update).length !== 0) {
        await updateTransition(client, workflow._id, transition._id, update)
      }
    } finally {
      isSaving = false
    }
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

  $: canSave = name.trim().length > 0 && toStatusItem != null

  function getOkTooltip (name: string, toStatusItem: ListItem | undefined): LabelAndProps | undefined {
    if (name.trim().length === 0) {
      return {
        label: plugin.string.NameRequired
      }
    }
    if (toStatusItem == null) {
      return {
        label: plugin.string.StatusToRequired
      }
    }

    return undefined
  }
</script>

<Modal
  type="type-aside"
  okLabel={presentation.string.Save}
  okAction={save}
  {canSave}
  label={plugin.string.WorkflowTransition}
  labelProps={{ name: transition?.name ?? '' }}
  okLoading={isSaving}
  okTooltip={getOkTooltip(name, toStatusItem)}
  showCancelButton={false}
  on:close={clearSettingsStore}
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
  </div>
  <span class="separator" />
  <svelte:fragment slot="buttons">
    {#if !readonly}
      <ModernButton label={presentation.string.Remove} size="large" kind="secondary" on:click={handleRemove} />
    {/if}
  </svelte:fragment>
  <div slot="footer" class="flex-row-center flex-gap-2 w-full"></div>
</Modal>

<style lang="scss">
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

  .separator {
    padding: 0.75rem 0;
    margin-left: -0.75rem;
    height: 1px;
    width: calc(100% + 1.5rem);
    border-bottom: 1px solid var(--global-subtle-ui-BorderColor);
  }
</style>
