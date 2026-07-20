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
  import { Ref, Status } from '@hcengineering/core'
  import presentation, { getClient } from '@hcengineering/presentation'
  import ui, {
    ModernDropdown,
    ModernDropdownLabels,
    Label,
    ListItem,
    Modal,
    ModernEditbox,
    languageStore,
    type DropdownTextItem,
    type LabelAndProps
  } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { Workflow, addTransition } from '@hcengineering/workflow'
  import { StatePresenter } from '@hcengineering/task-resources'
  import { translate } from '@hcengineering/platform'

  import plugin from '../../plugin'

  export let workflow: Workflow
  export let statuses: Status[] = []

  const client = getClient()
  const dispatch = createEventDispatcher()

  let name: string = ''

  let toStatusItem: ListItem | undefined
  let to: Ref<Status> | undefined = undefined
  $: to = toStatusItem?._id as Ref<Status>

  let fromStatusItemIds: string[] | undefined = []
  let fromStatusItems: DropdownTextItem[] = []

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

  async function save (): Promise<void> {
    if (to === undefined || name.trim() === '' || fromStatusItemIds == null || fromStatusItemIds.length === 0) return

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

    return undefined
  }
</script>

<Modal
  type="type-popup"
  okAction={save}
  okLabel={presentation.string.Create}
  canSave={name.trim() !== '' && to != null && fromStatusItemIds != null && fromStatusItemIds.length > 0}
  okTooltip={getOkTooltip(name, toStatusItem)}
  label={plugin.string.CreateTransition}
  width="medium"
  onCancel={() => dispatch('close')}
>
  <div class="hulyModal-content__titleGroup" style="padding: 0">
    <ModernEditbox bind:value={name} label={plugin.string.Name} kind="transparent" autoFocus={true} width="100%" />
  </div>

  <div class="hulyModal-content__settingsSet" style="padding: 1rem 1rem 0 1rem">
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
  </div>
</Modal>
