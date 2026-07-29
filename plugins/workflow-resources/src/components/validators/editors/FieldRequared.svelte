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
  import { createEventDispatcher } from 'svelte'
  import ui, { DropdownTextItem, Label, languageStore, ModernDropdownLabels } from '@hcengineering/ui'
  import { WorkflowValidatorConfig } from '@hcengineering/workflow'
  import { TaskType } from '@hcengineering/task'

  import plugin from '../../../plugin'
  import { getDisplayAttributes } from '../../../utils'

  interface Props {
    fields: string[]
  }

  export let taskType: TaskType
  export let config: WorkflowValidatorConfig | undefined = undefined
  export let canSave = false

  const dispatch = createEventDispatcher<{ update: Props }>()

  let items: DropdownTextItem[] = []
  let selected: string[] =
    config?.props?.fields != null && Array.isArray(config.props.fields) ? config.props.fields : []

  $: void updateItems($languageStore)
  $: canSave = selected.length > 0
  $: dispatch('update', { fields: selected })

  async function updateItems (lang: string): Promise<void> {
    const res = await getDisplayAttributes(taskType.ofClass, lang)

    const resultItems: DropdownTextItem[] = []

    res.forEach((group, groupIdx) => {
      const regular = group.regular as DropdownTextItem[]
      const collection = group.collection as DropdownTextItem[]

      regular.forEach((f, idx) => {
        const isFirstInGroup = groupIdx > 0 && idx === 0
        resultItems.push({
          ...f,
          separatorBefore: isFirstInGroup,
          separatorLabel: isFirstInGroup ? group.classLabel : undefined
        })
      })

      collection.forEach((f, idx) => {
        const isFirstInGroup = groupIdx > 0 && regular.length === 0 && idx === 0
        const isFirstCollection = regular.length > 0 && idx === 0
        resultItems.push({
          ...f,
          separatorBefore: isFirstInGroup || isFirstCollection,
          separatorLabel: isFirstInGroup ? group.classLabel : undefined
        })
      })
    })

    items = resultItems
  }
</script>

<div class="field-required">
  <span class="field-required--label">
    <Label label={plugin.string.FieldRequiredValidator} />
  </span>
  <ModernDropdownLabels
    {items}
    bind:selected
    multiselect={true}
    wrap={true}
    autoSelect={false}
    placeholder={ui.string.NotSelected}
    justify="left"
    width="100%"
  />
</div>

<style lang="scss">
  .field-required {
    display: flex;
    gap: 1rem;

    &--label {
      display: flex;
      align-items: center;
      white-space: nowrap;
      height: 2.375rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--global-secondary-TextColor);
    }
  }
</style>
