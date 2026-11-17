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
  import type { Ref } from '@hcengineering/core'
  import { getEmbeddedLabel, translate } from '@hcengineering/platform'
  import type { TaskType } from '@hcengineering/task'
  import ui, { languageStore, ModernPopupLabels, showPopup, type DropdownTextItem } from '@hcengineering/ui'
  import { SelectButton } from '@hcengineering/ui/kit'
  import type { Workflow } from '@hcengineering/workflow'

  // Workflow of one task type in a project: the workflows of that type to choose from, or none
  export let taskType: TaskType
  export let workflows: Workflow[]
  export let value: Ref<Workflow> | undefined
  export let onChange: (value: Ref<Workflow> | undefined) => void | Promise<void>

  let notSelected = ''
  $: void translate(ui.string.NotSelected, {}, $languageStore).then((it) => {
    notSelected = it
  })

  $: items = workflows.filter((w) => w.taskType === taskType._id).map((w) => ({ id: w._id, label: w.name }))
  $: selected = items.find((it) => it.id === value)

  let opened = false

  function choose (e: MouseEvent, items: DropdownTextItem[]): void {
    opened = true
    showPopup(
      ModernPopupLabels,
      { placeholder: ui.string.SearchDots, items, selected: value ?? 'none' },
      e.currentTarget as HTMLElement,
      async (result: DropdownTextItem['id'] | DropdownTextItem['id'][] | null | undefined) => {
        opened = false
        if (result == null) return
        const id = Array.isArray(result) ? result[0] : result
        await onChange(id != null && id !== 'none' ? (String(id) as Ref<Workflow>) : undefined)
      }
    )
  }
</script>

<SelectButton
  data-id={`workflow-for-${taskType.name}`}
  label={selected !== undefined ? getEmbeddedLabel(selected.label) : undefined}
  placeholder={ui.string.NotSelected}
  disabled={items.length === 0}
  field
  fullWidth
  chevron
  pressed={opened}
  on:click={(e) => {
    choose(e, [{ id: 'none', label: notSelected }, ...items])
  }}
/>
