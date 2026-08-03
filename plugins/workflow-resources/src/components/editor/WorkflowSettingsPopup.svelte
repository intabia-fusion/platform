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
  import { getClient, reduceCalls } from '@hcengineering/presentation'
  import { StatePresenter } from '@hcengineering/task-resources'
  import ui, { DropdownTextItem, Label, languageStore, Modal, ModernDropdownLabels } from '@hcengineering/ui'
  import { Workflow } from '@hcengineering/workflow'

  import plugin from '../../plugin'

  export let workflow: Workflow
  export let statuses: Status[] = []
  export let readonly = false

  const client = getClient()

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  const dispatch = createEventDispatcher<{ close: void }>()

  let initialStatusItemIds: string[] = []
  let initialStatusItems: DropdownTextItem[] = []

  $: initialStatusItemIds =
    workflow?.initialStatuses != null && workflow.initialStatuses.length > 0 ? workflow.initialStatuses : ['null']

  const updateInitialStatusItems = reduceCalls(async (lang: string, stList: Status[]): Promise<void> => {
    const anyStatusLabel = await translate(plugin.string.AnyStatus, {}, lang)
    initialStatusItems = [
      { label: anyStatusLabel, id: 'null', exclusive: true },
      ...stList.map(
        (s): DropdownTextItem => ({
          id: s._id,
          label: s.name,
          icon: StatePresenter,
          iconProps: { value: s, shouldShowName: false }
        })
      )
    ]
  })

  $: void updateInitialStatusItems($languageStore, statuses)

  async function handleInitialStatusesChange (evt: CustomEvent<string[]>): Promise<void> {
    if (readonly || workflow === undefined) return
    const selected = evt.detail
    const initialStatuses = selected.includes('null') ? [] : (selected as Ref<Status>[])
    await client.update(workflow, { initialStatuses })
  }
</script>

<Modal type="type-popup" label={plugin.string.WorkflowSettings} width="medium" onCancel={() => dispatch('close')}>
  <div class="hulyModal-content__settingsSet settings-set">
    <div class="hulyModal-content__settingsSet-line">
      <span class="label"> <Label label={plugin.string.InitialStatuses} /></span>
      <ModernDropdownLabels
        items={initialStatusItems}
        selected={initialStatusItemIds}
        multiselect={true}
        wrap={true}
        autoSelect={false}
        disabled={readonly}
        placeholder={ui.string.NotSelected}
        justify="left"
        width="25rem"
        on:selected={handleInitialStatusesChange}
      />
    </div>
  </div>
</Modal>

<style lang="scss">
  .settings-set {
    padding: 1rem;
  }
</style>
