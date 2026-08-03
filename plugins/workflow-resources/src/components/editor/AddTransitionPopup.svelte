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
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Ref, Status } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import presentation, { getClient, reduceCalls } from '@hcengineering/presentation'
  import { StatePresenter } from '@hcengineering/task-resources'
  import ui, {
    DropdownTextItem,
    IconError,
    Label,
    LabelAndProps,
    languageStore,
    ListItem,
    Modal,
    ModernDropdown,
    ModernDropdownLabels,
    ModernEditbox
  } from '@hcengineering/ui'
  import {
    addTransition,
    ConflictInfo,
    getTransitionConflict,
    Workflow,
    WorkflowTransition
  } from '@hcengineering/workflow'

  import plugin from '../../plugin'

  export let workflow: Workflow
  export let statuses: Status[] = []
  export let transitions: WorkflowTransition[] = []

  const client = getClient()

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  const dispatch = createEventDispatcher<{ close: void }>()

  let name = ''

  let toStatusItem: ListItem | undefined
  let to: Ref<Status> | undefined = undefined
  $: to = toStatusItem?._id as Ref<Status>

  let fromStatusItemIds: string[] | undefined = []
  let fromStatusItems: DropdownTextItem[] = []

  const updateFromStatusItems = reduceCalls(async (lang: string, stList: Status[]): Promise<void> => {
    const it = await translate(plugin.string.AnyStatus, {}, lang)
    fromStatusItems = [
      { label: it, id: 'null', exclusive: true },
      ...stList.map((s) => ({
        id: s._id,
        label: s.name,
        icon: StatePresenter,
        iconProps: { value: s, shouldShowName: false }
      }))
    ]
  })

  $: void updateFromStatusItems($languageStore, statuses)

  $: toStatusItems = statuses.map((s) => ({
    _id: s._id,
    label: s.name,
    icon: StatePresenter,
    iconProps: { value: s, shouldShowName: false }
  }))

  $: isSelf = to != null && fromStatusItemIds != null && fromStatusItemIds.includes(to)

  let conflictInfo: ConflictInfo | null = null
  $: {
    const fromVal = fromStatusItemIds?.includes('null') ? null : (fromStatusItemIds as Ref<Status>[])
    conflictInfo =
      to != null && fromStatusItemIds != null && fromStatusItemIds.length > 0
        ? getTransitionConflict({ from: fromVal, to }, transitions)
        : null
  }

  async function save (): Promise<void> {
    if (
      to === undefined ||
      name.trim() === '' ||
      fromStatusItemIds == null ||
      fromStatusItemIds.length === 0 ||
      conflictInfo != null ||
      isSelf
    ) {
      return
    }

    const from = fromStatusItemIds.includes('null') ? null : (fromStatusItemIds as Ref<Status>[])
    await addTransition(client, workflow._id, name.trim(), from, to)
    dispatch('close')
  }

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
    if (isSelf) {
      return {
        label: plugin.string.SelfTransitionError,
        props: {
          to: toStatusItem?.label ?? ''
        }
      }
    }
    if (conflictInfo != null) {
      const fromItem = fromStatusItems.find((item) => item.id === conflictInfo?.status)
      return {
        label: plugin.string.TransitionConflictError,
        props: {
          to: toStatusItem?.label ?? '',
          from: fromItem?.label ?? '',
          transition: conflictInfo.transition.name
        }
      }
    }

    return undefined
  }
</script>

<Modal
  type="type-popup"
  okAction={save}
  okLabel={presentation.string.Create}
  canSave={name.trim() !== '' &&
    to != null &&
    fromStatusItemIds != null &&
    fromStatusItemIds.length > 0 &&
    conflictInfo == null &&
    !isSelf}
  okTooltip={getOkTooltip(name, toStatusItem)}
  label={plugin.string.CreateTransition}
  width="medium"
  onCancel={() => dispatch('close')}
>
  <div class="hulyModal-content__titleGroup title-group">
    <ModernEditbox bind:value={name} label={plugin.string.Name} kind="transparent" autoFocus={true} width="100%" />
  </div>

  <div class="hulyModal-content__settingsSet settings-set">
    <div class="hulyModal-content__settingsSet-line">
      <span class="label"> <Label label={plugin.string.From} /></span>
      <ModernDropdownLabels
        items={fromStatusItems}
        bind:selected={fromStatusItemIds}
        multiselect={true}
        wrap={true}
        placeholder={ui.string.NotSelected}
        justify="left"
        width="25rem"
      />
    </div>

    <div class="hulyModal-content__settingsSet-line">
      <span class="label"> <Label label={plugin.string.To} /> </span>
      <ModernDropdown
        items={toStatusItems}
        bind:selected={toStatusItem}
        placeholder={ui.string.NotSelected}
        icon={StatePresenter}
        justify="left"
        width="25rem"
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
</Modal>

<style lang="scss">
  .title-group {
    padding: 0;
  }

  .settings-set {
    padding: 1rem 1rem 0 1rem;
  }

  .error-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    color: var(--negative-button-default);
    font-size: 0.8125rem;
    line-height: 1.125rem;
    margin-top: 1.5rem;
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
</style>
